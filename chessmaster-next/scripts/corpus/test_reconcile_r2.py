import sqlite3,tempfile,unittest
from pathlib import Path
from reconcile_shards_r2 import reconcile
class ReconcileTests(unittest.TestCase):
 def test_only_uncommitted_normalized_artifacts_are_moved(self):
  with tempfile.TemporaryDirectory() as t:
   root=Path(t).resolve();(root/'consolidated').mkdir();(root/'normalized').mkdir();(root/'raw').mkdir();(root/'raw/original').write_bytes(b'raw')
   db=sqlite3.connect(root/'consolidated/index.sqlite');db.execute('create table batches(shard text)');db.execute('insert into batches values(?)',('normalized/committed.jsonl.gz',));db.commit();db.close()
   (root/'normalized/committed.jsonl.gz').write_bytes(b'committed');(root/'normalized/orphan.tmp').write_bytes(b'incomplete')
   r=reconcile(root,True);self.assertEqual(r['missing_committed_shards'],[]);self.assertEqual(len(r['quarantined']),1);self.assertEqual((root/'raw/original').read_bytes(),b'raw');self.assertTrue((root/'normalized/committed.jsonl.gz').exists())
if __name__=='__main__':unittest.main()
