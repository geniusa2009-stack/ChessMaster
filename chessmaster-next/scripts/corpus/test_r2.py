import csv,gzip,io,json,sqlite3,tempfile,threading,unittest,zipfile
from pathlib import Path
from unittest.mock import patch
from types import SimpleNamespace
import chess,zstandard
import normalize_r2 as n
from verify_r2 import Queue,legal
import acquire

class R2Tests(unittest.TestCase):
 def test_chesscom_setup_and_explicit_solution(self):
  row={'id':1,'initialFen':chess.STARTING_FEN,'colorOfUser':'black','pgn':'[Tactic_line "e5 Nf3"]\n\n1. e4 e5 2. Nf3 *'}
  r=n.normalized('chesscom-puzzles',row,'puzzles.json')[-1]
  self.assertEqual(r['setup_move'],'e2e4');self.assertEqual(r['solution_lines'],[['e7e5','g1f3']]);self.assertEqual(legal(r)['status'],'legal_line_verified');self.assertFalse(legal(r)['objective_verified'])
 def test_no_tactic_line_is_not_fabricated(self):
  row={'initialFen':chess.STARTING_FEN,'colorOfUser':'white','pgn':'1.e4 e5 *'}
  r=n.normalized('chesscom-puzzles',row,'x')[-1]
  self.assertEqual(r['solution_lines'],[]);self.assertTrue(r['missing_solution'])
 def test_illegal_solution_rejected(self):
  with self.assertRaises(ValueError):legal({'display_fen':chess.STARTING_FEN,'solution_lines':[['e2e5']]})
 def test_all_lines_replayed(self):
  with self.assertRaises(ValueError):legal({'display_fen':chess.STARTING_FEN,'solution_lines':[['e2e4'],['d2d5']]})
 def test_castling_state_is_not_board_equivalence(self):
  fen='r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'
  a=n.normalized('lucas',{'format':'.fns','line':fen+'|a|'},'a')
  b=n.normalized('lucas',{'format':'.fns','line':fen.replace('KQkq','-')+'|a|'},'a')
  self.assertNotEqual(a[3],b[3]);self.assertEqual(a[4],b[4]);self.assertNotEqual(a[0],b[0])
 def test_epd_best_moves_are_alternatives(self):
  r=n.normalized('test',{'format':'.epd','line':chess.STARTING_FEN.rsplit(' ',2)[0]+' bm e4 d4;'},'x.epd')[-1]
  self.assertEqual(r['operations']['bm'],['e2e4','d2d4']);self.assertEqual(r['solution_lines'],[])
 def test_statistics_are_not_puzzles(self):
  self.assertEqual(n.normalized('chessy',{'count':20},'stats.json')[1],'statistics')
 def test_composition_missing_solution_preserved(self):
  row={'id':4,'fen':chess.STARTING_FEN,'genre':'self','stipulation':'s#2'}
  r=n.normalized('arcade',row,'page.json')
  self.assertEqual(r[1],'compositions');self.assertEqual(r[-1]['verification_status'],'source_only');self.assertTrue(r[-1]['missing_solution'])
 def test_compositions_with_different_stipulations_stay_separate(self):
  a={'id':4,'fen':chess.STARTING_FEN,'genre':'direct','stipulation':'#2'}
  self.assertNotEqual(n.normalized('arcade',a,'x')[0],n.normalized('arcade',dict(a,stipulation='#3'),'x')[0])
 def test_streamed_json_csv_and_compressed_pgn(self):
  with tempfile.TemporaryDirectory() as t:
   root=Path(t);p=root/'rows.zip'
   with zipfile.ZipFile(p,'w') as z:z.writestr('x.json',json.dumps({'1':{'id':1,'pgn':'x'}}))
   self.assertEqual(list(n.rows(p,'chesscom-puzzles'))[0][2]['id'],1)
   for ext,encode in [('.pgn.gz',gzip.compress),('.pgn.zst',lambda b:zstandard.ZstdCompressor().compress(b))]:
    p=root/('games'+ext);p.write_bytes(encode(b'1.e4 e5 2.Nf3 *'))
    self.assertEqual(len(list(n.rows(p,'test'))),1)
 def test_unsupported_envelope_explicit(self):
  with self.assertRaises(n.UnsupportedFormat):list(n.parse_rows(io.StringIO('{"x":1}'),'x.json','unknown'))
 def test_resume_counts_and_provenance(self):
  with tempfile.TemporaryDirectory() as t:
   root=Path(t);p=root/'sample.csv';p.write_text('name,moves,eco\nA,1.e4 e5,C20\nA,1.e4 e5,C20\nB,1.d4 d5,D00\n');d=n.connection(root)
   receipt={'path':'sample.csv','sha256':acquire.sha(p),'source_id':'maahi','bytes':p.stat().st_size}
   with patch('normalize_r2.shutil.disk_usage',return_value=SimpleNamespace(free=10**10)):
    self.assertEqual(n.import_file(d,root,receipt,limit=1)['state'],'partial');self.assertEqual(n.import_file(d,root,receipt)['state'],'complete');self.assertEqual(n.import_file(d,root,receipt)['state'],'already_complete')
   self.assertEqual(d.execute('select count(*) from entities').fetchone()[0],2);self.assertEqual(d.execute('select count(*) from provenance').fetchone()[0],3);d.close()
 def test_storage_floor_does_not_advance(self):
  with tempfile.TemporaryDirectory() as t:
   root=Path(t);p=root/'sample.csv';p.write_text('name,moves\nA,1.e4\n');d=n.connection(root);r={'path':'sample.csv','sha256':acquire.sha(p),'source_id':'maahi','bytes':p.stat().st_size}
   with patch('normalize_r2.shutil.disk_usage',return_value=SimpleNamespace(free=1)):self.assertEqual(n.import_file(d,root,r)['state'],'blocked_storage')
   self.assertEqual(d.execute('select processed from progress').fetchone()[0],0);d.close()
 def test_snapshot_change_refused(self):
  with tempfile.TemporaryDirectory() as t:
   root=Path(t);p=root/'sample.csv';p.write_text('name,moves\nA,1.e4\n');d=n.connection(root);r={'path':'sample.csv','sha256':'0'*64,'source_id':'maahi','bytes':p.stat().st_size}
   with self.assertRaises(ValueError):n.import_file(d,root,r)
   d.close()
 def test_queue_concurrent_claim_and_expired_owner(self):
  with tempfile.TemporaryDirectory() as t:
   path=Path(t)/'jobs.sqlite';q=Queue(path);q.close();barrier=threading.Barrier(2);owners=[]
   def worker():
    queue=Queue(path);barrier.wait();owners.append(queue.claim('id','legal','c',stamp=100));queue.close()
   threads=[threading.Thread(target=worker) for _ in range(2)]
   for x in threads:x.start()
   for x in threads:x.join()
   self.assertEqual(sum(x is not None for x in owners),1)
   q=Queue(path);old=next(x for x in owners if x);new=q.claim('id','legal','c',stamp=221)
   self.assertTrue(new);self.assertFalse(q.finish('id','legal','c',old,{}));self.assertTrue(q.finish('id','legal','c',new,{}));self.assertIsNone(q.claim('id','legal','c',stamp=500));self.assertTrue(q.claim('id','legal','different-engine',stamp=500));q.close()
 def test_acquisition_never_overwrites_existing_raw(self):
  with tempfile.TemporaryDirectory() as t:
   root=Path(t);p=root/'raw/test/file.pgn';p.parent.mkdir(parents=True);p.write_bytes(b'original')
   with patch.object(acquire,'ROOT',root),patch('acquire.subprocess.run') as run:
    with self.assertRaises(RuntimeError):acquire.fetch('test','https://example.org/file.pgn')
    run.assert_not_called();self.assertEqual(p.read_bytes(),b'original')
if __name__=='__main__':unittest.main()

class InterruptionTests(unittest.TestCase):
 def test_interrupted_batch_resumes_without_duplicate_provenance(self):
  with tempfile.TemporaryDirectory() as t:
   root=Path(t);p=root/'sample.csv';p.write_text('name,moves\n'+''.join('A,1.e4\n' for _ in range(150)));d=n.connection(root)
   r={'path':'sample.csv','sha256':acquire.sha(p),'source_id':'maahi','bytes':p.stat().st_size};original=n.rows
   def interrupted(path,source):
    for i,row in enumerate(original(path,source)):
     if i==125:raise KeyboardInterrupt()
     yield row
   with patch('normalize_r2.shutil.disk_usage',return_value=SimpleNamespace(free=10**10)):
    with patch('normalize_r2.rows',interrupted):
     with self.assertRaises(KeyboardInterrupt):n.import_file(d,root,r)
    self.assertEqual(d.execute('select processed from progress').fetchone()[0],100)
    n.import_file(d,root,r)
   self.assertEqual(d.execute('select count(*) from provenance').fetchone()[0],150);self.assertEqual(d.execute('select count(*) from entities').fetchone()[0],1);d.close()
 def test_retry_exhaustion_is_durable(self):
  with tempfile.TemporaryDirectory() as t:
   q=Queue(Path(t)/'queue.sqlite')
   for stamp in [0,121,242]:self.assertTrue(q.claim('a','legal','cfg',stamp=stamp))
   self.assertIsNone(q.claim('a','legal','cfg',stamp=400));q.close()
 def test_different_rounds_do_not_merge_games(self):
  a={'pgn':'[Event "E"]\n[Round "1"]\n\n1.e4 e5 *','parse_errors':[]}
  b={'pgn':a['pgn'].replace('[Round "1"]','[Round "2"]'),'parse_errors':[]}
  self.assertNotEqual(n.normalized('test',a,'x.pgn')[0],n.normalized('test',b,'x.pgn')[0])
 def test_private_acquired_chesscom_fixture_if_enabled(self):
  import os
  if os.environ.get('CHESSMASTER_TEST_PRIVATE_FIXTURES')!='1':self.skipTest('Private fixture access is opt-in')
  p=n.ROOT/'raw/chesscom-puzzles/v2-puzzles-json.zip'
  member,ordinal,row=next(n.rows(p,'chesscom-puzzles'));record=n.normalized('chesscom-puzzles',row,member)[-1]
  self.assertEqual(legal(record)['status'],'legal_line_verified');self.assertEqual(record['setup_move'],'f1f2')
 def test_legacy_pgn_text_bytes_are_preserved(self):
  with tempfile.TemporaryDirectory() as t:
   p=Path(t)/'legacy.pgn';raw=b'[Event "Legacy \x96 event"]\n\n1.e4 e5 *';p.write_bytes(raw)
   member,ordinal,row=next(n.rows(p,'test'));record=n.normalized('test',row,member)
   self.assertEqual(record[1],'games');self.assertIn(b'\x96',n.unpack(n.pack(row))['pgn'].encode('utf-8',errors='surrogateescape'))
