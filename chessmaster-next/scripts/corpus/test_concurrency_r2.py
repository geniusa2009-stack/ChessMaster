import json,tempfile,threading,unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
import acquire,normalize_r2 as n
from verify_r2 import Queue
class ConcurrencyTests(unittest.TestCase):
 def test_retry_history_survives_success(self):
  with tempfile.TemporaryDirectory() as t:
   q=Queue(Path(t)/'q.sqlite');owner=q.claim('x','legal','c',stamp=1);q.finish('x','legal','c',owner,{'old_failure':'retained'},True)
   second=q.claim('x','legal','c',stamp=2);q.finish('x','legal','c',second,{'success':True})
   history=q.db.execute('select status,result from attempts order by attempt').fetchall();self.assertEqual(len(history),2);self.assertEqual(json.loads(history[0][1]),{'old_failure':'retained'});q.close()
 def test_atomic_reports_are_valid_under_concurrency(self):
  with tempfile.TemporaryDirectory() as t:
   p=Path(t)/'report.json';threads=[threading.Thread(target=acquire.atomic,args=(p,{'worker':i})) for i in range(20)]
   for th in threads:th.start()
   for th in threads:th.join()
   self.assertIn(json.loads(p.read_text())['worker'],range(20));self.assertEqual(list(Path(t).glob('*.tmp')),[])
 def test_concurrent_import_claim_is_exclusive(self):
  with tempfile.TemporaryDirectory() as t:
   root=Path(t);p=root/'x.csv';p.write_text('name,moves\nA,1.e4\nB,1.d4\n');r={'path':'x.csv','sha256':acquire.sha(p),'bytes':p.stat().st_size,'source_id':'maahi'}
   setup=n.connection(root);setup.close();ready=threading.Barrier(3);entered=threading.Event();release=threading.Event();results=[];original=n.rows
   def slow(path,source):
    entered.set();self.assertTrue(release.wait(5));yield from original(path,source)
   def first():
    db=n.connection(root);ready.wait();results.append(n.import_file(db,root,r));db.close()
   def second():
    db=n.connection(root);ready.wait();entered.wait(5);results.append(n.import_file(db,root,r));release.set();db.close()
   with patch('normalize_r2.shutil.disk_usage',return_value=SimpleNamespace(free=10**10)),patch('normalize_r2.rows',slow):
    a=threading.Thread(target=first);b=threading.Thread(target=second);a.start();b.start();ready.wait();a.join(10);b.join(10)
   self.assertFalse(a.is_alive());self.assertFalse(b.is_alive());self.assertEqual(sorted(x['state'] for x in results),['already_claimed','complete'])
   db=n.connection(root);self.assertEqual(db.execute('select count(*) from provenance').fetchone()[0],2);db.close()
if __name__=='__main__':unittest.main()
