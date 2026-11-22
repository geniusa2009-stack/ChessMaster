"""Resumable lazy local analysis queue. A finite search is evidence, never a proof of every stipulation."""
import argparse,gzip,hashlib,json,sqlite3,time
from pathlib import Path
import chess,chess.engine,chess.syzygy
from acquire import ROOT,atomic,now

def run(stage,seconds,engine_path,nodes):
 folder=ROOT/'solver-results';folder.mkdir(exist_ok=True)
 db=sqlite3.connect(folder/'analysis.sqlite',timeout=30)
 db.executescript('''create table if not exists jobs(canonical_id text,stage text,config text,status text,attempts integer,lease_until real,result text,updated_at text,primary key(canonical_id,stage,config));''')
 config=json.dumps({'stage':stage,'nodes':nodes if stage=='fast' else None,'engine_binary_sha256':hashlib.sha256(engine_path.read_bytes()).hexdigest() if stage=='fast' else None,'chess_version':chess.__version__},sort_keys=True)
 config_hash=hashlib.sha256(config.encode()).hexdigest()
 engine=None;tb=None;start=time.monotonic();processed=failed=0
 if stage=='fast':
  engine=chess.engine.SimpleEngine.popen_uci(str(engine_path),timeout=30)
  engine.configure({'Threads':1,'Hash':32})
 syzygy=ROOT/'raw/syzygy'
 if syzygy.exists():tb=chess.syzygy.open_tablebase(str(syzygy))
 try:
  for shard in sorted((ROOT/'normalized/lichess-puzzles').glob('*/*.jsonl.gz')):
   # Only committed shards are queue candidates. An orphan after interruption is not queued.
   source_db=sqlite3.connect(f'file:{ROOT / "consolidated/index.sqlite"}?mode=ro',uri=True,timeout=30)
   committed=source_db.execute('select 1 from batches where shard=?',(str(shard.relative_to(ROOT)),)).fetchone();source_db.close()
   if not committed:continue
   with gzip.open(shard,'rt') as f:
    for line in f:
     if seconds and time.monotonic()-start>=seconds:return
     r=json.loads(line)
     if r.get('quarantined') or r.get('exact_duplicate'):continue
     id=r['canonical_id'];stamp=time.time()
     db.execute('begin immediate')
     job=db.execute('select status,attempts,lease_until from jobs where canonical_id=? and stage=? and config=?',(id,stage,config_hash)).fetchone()
     if job and (job[0]=='completed' or (job[0]=='running' and job[2]>stamp) or job[1]>=3):db.commit();continue
     db.execute('insert or replace into jobs values(?,?,?,?,?,?,?,?)',(id,stage,config_hash,'running',(job[1] if job else 0)+1,stamp+120,None,now()));db.commit()
     try:
      board=chess.Board(r['display_fen'])
      if not board.is_valid():raise ValueError('Invalid display position')
      # Always replay the entire canonical source line before any engine evidence is stored.
      end=board.copy()
      for move in r['solution_lines'][0]:end.push_uci(move)
      result={'source_snapshot':r['source_snapshot'],'legal_line':True,'ends_in_checkmate':end.is_checkmate(),'objective_verified':False,'config':json.loads(config)}
      if tb is not None and len(board.piece_map())<=7:
       try:result['syzygy']={'wdl':tb.probe_wdl(board),'dtz':tb.probe_dtz(board)}
       except KeyError:result['syzygy']={'status':'required_material_table_missing'}
      if engine:
       infos=engine.analyse(board,chess.engine.Limit(nodes=nodes),multipv=min(3,board.legal_moves.count()))
       result['engine']=dict(engine.id);result['lines']=[]
       for info in infos:
        pov=info['score'].pov(board.turn)
        result['lines'].append({'moves':[m.uci() for m in info.get('pv',[])],'score_cp':pov.score(),'mate':pov.mate(),'depth':info.get('depth'),'nodes':info.get('nodes'),'time':info.get('time')})
       result['source_first_move_matches_engine']=bool(result['lines'] and result['lines'][0]['moves'] and result['lines'][0]['moves'][0]==r['solution_lines'][0][0])
       result['limitation']='Finite-node MultiPV comparison is not forced-objective or uniqueness proof.'
      db.execute('update jobs set status=?,lease_until=0,result=?,updated_at=? where canonical_id=? and stage=? and config=?',('completed',json.dumps(result),now(),id,stage,config_hash));processed+=1
     except Exception as e:
      db.execute('update jobs set status=?,lease_until=0,result=?,updated_at=? where canonical_id=? and stage=? and config=?',('failed',json.dumps({'error':str(e)}),now(),id,stage,config_hash));failed+=1
     db.commit()
     if processed and processed%1000==0:print(stage,processed,'seconds',round(time.monotonic()-start,2),flush=True)
 finally:
  if engine:engine.quit()
  if tb:tb.close()
  totals={status:n for status,n in db.execute('select status,count(*) from jobs where stage=? and config=? group by status',(stage,config_hash))}
  elapsed=time.monotonic()-start
  atomic(ROOT/'reports'/f'analysis-{stage}.json',{'stage':stage,'config_hash':config_hash,'config':json.loads(config),'totals':totals,'processed_this_run':processed,'failed_this_run':failed,'seconds_this_run':round(elapsed,3),'records_per_second':round(processed/elapsed,3),'objective_verified':0,'updated_at':now()})
  db.close()
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--stage',choices=['legal','fast'],required=True);p.add_argument('--seconds',type=float,default=0,help='0 drains queue; a positive value is a throughput benchmark');p.add_argument('--engine',type=Path,default=ROOT/'extracted/stockfish-19/stockfish');p.add_argument('--nodes',type=int,default=50000);a=p.parse_args();run(a.stage,a.seconds,a.engine,a.nodes)
