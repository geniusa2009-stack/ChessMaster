import csv,io,json,tempfile,unittest
from unittest import mock
from types import SimpleNamespace
from pathlib import Path
import zstandard
import consolidate,domains
class CorpusTests(unittest.TestCase):
 def test_setup_move_changes_player_turn(self):
  row={'PuzzleId':'abc12','FEN':'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1','Moves':'e2e4 e7e5','Rating':'1200','RatingDeviation':'80','Popularity':'95','Themes':'opening','GameUrl':'https://lichess.org/example'}
  record=consolidate.lichess(row)
  self.assertEqual(record['setup_move'],'e2e4');self.assertEqual(record['solution_lines'],[['e7e5']]);self.assertEqual(record['display_fen'].split()[1],'b');self.assertFalse(record['verification_metadata']['remaining_solution_verified'])
 def test_resume_and_duplicate_alias_preserve_sources(self):
  with tempfile.TemporaryDirectory() as t:
   root=Path(t);old=consolidate.ROOT;consolidate.ROOT=root
   try:
    (root/'checkpoints').mkdir();(root/'reports').mkdir()
    row={'PuzzleId':'abc12','FEN':'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1','Moves':'e2e4 e7e5','Rating':'1200','RatingDeviation':'80','Popularity':'95','Themes':'opening','GameUrl':'https://lichess.org/example'}
    buf=io.StringIO();writer=csv.DictWriter(buf,fieldnames=list(row));writer.writeheader();writer.writerow(row);writer.writerow(dict(row,PuzzleId='abc13'))
    file=root/'source.csv.zst';file.write_bytes(zstandard.ZstdCompressor().compress(buf.getvalue().encode()))
    with mock.patch('consolidate.shutil.disk_usage',return_value=SimpleNamespace(free=10*1024**3)):
     consolidate.run(file,'lichess','fixture',batch_size=1)
    before=(root/'checkpoints/fixture.json').read_text();consolidate.run(file,'lichess','fixture',batch_size=1)
    self.assertEqual(before,(root/'checkpoints/fixture.json').read_text())
    db=consolidate.connect();self.assertEqual(db.execute('select count(*) from tasks').fetchone()[0],1);self.assertEqual(db.execute('select count(*) from aliases').fetchone()[0],1);db.close()
   finally:consolidate.ROOT=old
 def test_transpositions_preserve_paths(self):
  a=domains.normalize('openings',{'name':'A','eco':'A00','moves':'1.Nf3 d5 2.d4'},'test')
  b=domains.normalize('openings',{'name':'B','eco':'D00','moves':'1.d4 d5 2.Nf3'},'test')
  self.assertNotEqual(a[0],b[0]);self.assertEqual(a[1],b[1])
 def test_illegal_opening_is_not_accepted(self):
  with self.assertRaises(ValueError):domains.normalize('openings',{'name':'Bad','moves':'1.e5'},'test')
if __name__=='__main__':unittest.main()
