import gzip,hashlib,json,sqlite3,tempfile,unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
import relations_r2
from normalize_r2 import connection,pack,VERSION
from verify_r2 import Queue

class CrossResumeTests(unittest.TestCase):
 def test_incremental_r1_scan_and_inactive_target_isolation(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);(root/'consolidated').mkdir();(root/'solver-results').mkdir()
   Queue(root/'solver-results/r2-analysis.sqlite').close()
   fen='7k/8/5KQ1/8/8/8/8/8 w - - 0 1';lines=[['g6g7']];pos=relations_r2.position_key(fen)
   task=hashlib.sha256(pos+json.dumps(lines,separators=(',',':')).encode()).digest()
   db=connection(root);db.execute('insert into entities values(?,?,?,?,?,?,?,?,?)',('target','puzzles',None,None,None,None,'tactic','source_only',pack({'display_fen':fen,'solution_lines':lines})))
   db.execute('insert into normalization_outputs values(?,?,?,?,?,?)',('fixture','snapshot','file',1,VERSION,'target'));db.commit();db.close()
   legacy=sqlite3.connect(root/'consolidated/index.sqlite');legacy.execute('create table tasks(id integer primary key,task_hash blob,position_hash blob,shard text,ordinal integer)')
   shard=root/'shard.jsonl.gz'
   def write_rows(n):
    with gzip.open(shard,'wt') as f:
     for i in range(n):f.write(json.dumps({'display_fen':fen})+'\n')
   write_rows(1);legacy.execute('insert into tasks values(1,?,?,?,0)',(task,pos,shard.name));legacy.commit()
   with patch.object(relations_r2,'ROOT',root),patch.object(relations_r2.shutil,'disk_usage',return_value=SimpleNamespace(free=10**12)):
    relations_r2.run();first=json.loads((root/'reports/r2-cross-source.json').read_text());self.assertEqual(first['r1_start_checkpoint'],0)
    pending=sqlite3.connect(root/'consolidated/cross-source.sqlite');pending.execute('update runs set complete=0');pending.commit();pending.close()
    write_rows(2);legacy.execute('insert into tasks values(2,?,?,?,1)',(b'x'*32,pos,shard.name));legacy.commit()
    relations_r2.run();second=json.loads((root/'reports/r2-cross-source.json').read_text());self.assertEqual(second['r1_start_checkpoint'],1);self.assertEqual(sum(x[2] for x in second['relation_counts']),2)
    relations_r2.run();third=json.loads((root/'reports/r2-cross-source.json').read_text());self.assertEqual(third['r1_start_checkpoint'],2);self.assertEqual(third['relation_counts'],second['relation_counts'])
    db=sqlite3.connect(root/'consolidated/r2.sqlite');db.execute("update normalization_outputs set adapter='historical'");db.commit();db.close()
    relations_r2.run();inactive=json.loads((root/'reports/r2-cross-source.json').read_text());self.assertEqual(inactive['active_r2_targets'],0);self.assertEqual(inactive['relation_counts'],[])
   legacy.close()
if __name__=='__main__':unittest.main()
