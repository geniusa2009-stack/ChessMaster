import sqlite3,tempfile,unittest,shutil
from pathlib import Path
from audit_r2 import fingerprint,reusable_integrity
class AuditReuseTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.path=Path(self.temp.name)/'test.sqlite'
  db=sqlite3.connect(self.path);db.execute('create table values_test(value text)');db.commit();result=db.execute('pragma integrity_check').fetchall();db.close()
  self.prior={'sqlite_version':sqlite3.sqlite_version,'integrity_mode':'integrity_check','databases':{'test.sqlite':{'integrity':[list(x) for x in result],**fingerprint(self.path)}}}
 def test_unchanged_full_check_reused(self):self.assertTrue(reusable_integrity(self.prior,self.path,'test.sqlite','integrity_check'))
 def test_changed_file_or_wal_forces_new_check(self):
  Path(str(self.path)+'-wal').write_bytes(b'pending');self.assertFalse(reusable_integrity(self.prior,self.path,'test.sqlite','integrity_check'));Path(str(self.path)+'-wal').unlink()
  db=sqlite3.connect(self.path);db.execute("insert into values_test values('new row')");db.commit();db.close();self.assertFalse(reusable_integrity(self.prior,self.path,'test.sqlite','integrity_check'))
 def test_copied_file_with_preserved_timestamps_requires_new_check(self):
  copied=self.path.with_name('copy.sqlite');shutil.copy2(self.path,copied);self.assertFalse(reusable_integrity(self.prior,copied,'test.sqlite','integrity_check'))
 def test_old_engine_or_partial_check_not_reused(self):
  self.prior['sqlite_version']='old';self.assertFalse(reusable_integrity(self.prior,self.path,'test.sqlite','integrity_check'))
  self.prior['sqlite_version']=sqlite3.sqlite_version;self.prior['integrity_mode']='quick_check';self.assertFalse(reusable_integrity(self.prior,self.path,'test.sqlite','integrity_check'))
if __name__=='__main__':unittest.main()
