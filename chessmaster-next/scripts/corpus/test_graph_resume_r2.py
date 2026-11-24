import sqlite3,tempfile,unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
import graph_r2
from normalize_r2 import connection,pack

class GraphResumeTests(unittest.TestCase):
 def test_interrupt_rolls_back_only_uncommitted_graph_batch(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);(root/'consolidated').mkdir();connection(root).close()
   legacy=sqlite3.connect(root/'consolidated/domains.sqlite')
   legacy.execute('create table records(canonical_id text primary key,domain text,payload blob)')
   for i in range(120):legacy.execute('insert into records values(?,?,?)',(f'{i:04}','openings',pack({'moves':['e2e4'],'name':str(i)})))
   legacy.commit();legacy.close()
   class Interrupted(sqlite3.Connection):
    written=0
    def execute(self,sql,*args):
     if sql.startswith('insert into graph_done'):
      self.written+=1
      if self.written==101:raise KeyboardInterrupt('simulated interrupted graph batch')
     return super().execute(sql,*args)
   path=root/'consolidated/r2.sqlite'
   with patch.object(graph_r2,'ROOT',root),patch.object(graph_r2.shutil,'disk_usage',return_value=SimpleNamespace(free=10**12)):
    with patch.object(graph_r2,'connection',side_effect=lambda:sqlite3.connect(path,factory=Interrupted)):
     with self.assertRaises(KeyboardInterrupt):graph_r2.run()
    db=sqlite3.connect(path);self.assertEqual(db.execute('select count(*) from graph_done').fetchone()[0],100);db.close()
    with patch.object(graph_r2,'connection',side_effect=lambda:sqlite3.connect(path)):graph_r2.run()
   db=sqlite3.connect(path)
   self.assertEqual(db.execute('select count(*) from graph_done').fetchone()[0],120)
   self.assertEqual(db.execute('select count(*) from graph_sources').fetchone()[0],120)
   self.assertEqual(db.execute('select count(*) from graph_paths').fetchone()[0],1)
   self.assertEqual(db.execute('pragma integrity_check').fetchone()[0],'ok');db.close()
if __name__=='__main__':unittest.main()
