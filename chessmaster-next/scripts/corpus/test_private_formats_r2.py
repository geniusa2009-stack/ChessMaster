"""Opt-in first-record fixtures from actual immutable acquired files; no corpus data in Git."""
import json,os,unittest,tempfile,hashlib
from pathlib import Path
import normalize_r2 as n
class PrivateFormatTests(unittest.TestCase):
 def setUp(self):
  if os.environ.get('CHESSMASTER_TEST_PRIVATE_FIXTURES')!='1':self.skipTest('Private snapshot fixtures are opt-in')
 def first(self,source,pattern):
  path=next((n.ROOT/'raw'/source).glob(pattern));member,ordinal,row=next(n.rows(path,source));return n.normalized(source,row,member)
 def test_actual_maahi_formats(self):
  self.assertEqual(self.first('maahi','openings.csv')[0],self.first('maahi','openings.json')[0])
 def test_actual_planchetto(self):self.assertEqual(self.first('planchetto','*.csv')[1],'openings')
 def test_actual_chessy_json_is_statistics(self):self.assertEqual(self.first('chessy','gambit-roi.json')[1],'statistics')
 def test_actual_lucas_epd_and_fns(self):
  self.assertEqual(self.first('lucas','*.epd')[1],'training_positions');self.assertEqual(self.first('lucas','*.fns')[1],'training_positions')
 def test_actual_legacy_fns_bytes_round_trip(self):
  for path in (n.ROOT/'raw/lucas').glob('*.fns'):
   raw=path.read_bytes()
   try:raw.decode('utf-8-sig');continue
   except UnicodeDecodeError:pass
   for member,ordinal,row in n.rows(path,'lucas'):
    if any(0xdc80<=ord(char)<=0xdcff for char in row['line']):
     line=row['line'].encode('utf-8',errors='surrogateescape');self.assertIn(line,raw)
     with tempfile.TemporaryDirectory() as folder:
      root=Path(folder);(root/'raw').mkdir();fixture=root/'raw/legacy.fns';fixture.write_bytes(line+b'\n');snapshot=hashlib.sha256(fixture.read_bytes()).hexdigest();receipt={'source_id':'lucas','path':'raw/legacy.fns','sha256':snapshot,'bytes':fixture.stat().st_size}
      db=n.connection(root);db.execute('insert into progress values(?,?,?,?,?,?,?,?,?)',(receipt['path'],snapshot,n.VERSION,1,0,1,0,1,'fixture'))
      db.execute('insert into rejected values(?,?,?,?,?,?)',(receipt['path'],snapshot,fixture.name,1,'historical legacy label encoding error',n.pack(row)));db.commit()
      result=n.import_file(db,root,receipt);self.assertEqual(result['counts'][1],1);self.assertEqual(db.execute('select count(*) from normalization_recoveries').fetchone()[0],1)
      self.assertEqual(db.execute('select count(*) from rejected').fetchone()[0],1);self.assertEqual(db.execute('select count(*) from progress').fetchone()[0],2);db.close()
     return
  self.fail('Expected acquired legacy FNS fixture')
 def test_actual_broadcast_zst(self):self.assertEqual(self.first('chessdb-broadcast','*.pgn.zst')[1],'games')
 def test_actual_chesscom_csv(self):self.assertEqual(self.first('chesscom-puzzles','v2-puzzles-csv.zip')[1],'puzzles')
 def test_actual_composition_missing_solution(self):
  r=self.first('arcade','direct-page-0000.json');self.assertEqual(r[1],'compositions');self.assertTrue(r[-1]['missing_solution'])
 def test_actual_brilliancy(self):self.assertEqual(self.first('chessdb-brilliancies','00.json')[1],'brilliancies')
if __name__=='__main__':unittest.main()
