"""Lease-token queue and explicit local legality/finite-engine evidence for R2."""
import argparse,hashlib,json,shutil,sqlite3,time,uuid
from pathlib import Path
import chess,chess.engine,chess.syzygy
from acquire import ROOT,atomic,now
from normalize_r2 import connection,unpack,digest

class Queue:
 def __init__(self,path):
  self.db=sqlite3.connect(path,timeout=30);self.db.execute('pragma journal_mode=WAL');self.db.execute('pragma synchronous=FULL')
  self.db.execute('''create table if not exists jobs(id text,stage text,config text,status text,attempts integer,lease_until real,owner text,result text,updated_at text,primary key(id,stage,config))''');self.db.commit()
 def claim(self,id,stage,config,lease=120,stamp=None):
  stamp=time.time() if stamp is None else stamp;owner=uuid.uuid4().hex
  self.db.execute('begin immediate')
  try:
   old=self.db.execute('select status,attempts,lease_until from jobs where id=? and stage=? and config=?',(id,stage,config)).fetchone()
   if old and (old[0]=='completed' or old[1]>=3 or (old[0]=='running' and old[2]>stamp)):
    self.db.commit();return None
   self.db.execute('insert or replace into jobs values(?,?,?,?,?,?,?,?,?)',(id,stage,config,'running',old[1]+1 if old else 1,stamp+lease,owner,None,now()));self.db.commit();return owner
  except BaseException:self.db.rollback();raise
 def finish(self,id,stage,config,owner,result,failed=False):
  changed=self.db.execute('update jobs set status=?,result=?,lease_until=0,updated_at=? where id=? and stage=? and config=? and owner=? and status=?',('failed' if failed else 'completed',json.dumps(result),now(),id,stage,config,owner,'running')).rowcount
  self.db.commit();return bool(changed)
 def close(self):self.db.close()

def legal(record):
 b=chess.Board(record['display_fen'])
 if not b.is_valid():raise ValueError('Invalid position')
 setup=record.get('setup_move')
 if setup:
  initial=chess.Board(record['initial_fen']);initial.push_uci(setup)
  if initial.fen(en_passant='legal')!=b.fen(en_passant='legal'):raise ValueError('Setup position mismatch')
 lines=record.get('solution_lines',[])
 if not lines:return {'status':'position_valid','objective_verified':False,'missing_solution':True}
 endings=[]
 for line in lines:
  if not line:raise ValueError('Empty solution line')
  end=b.copy()
  for move in line:end.push_uci(move)
  endings.append({'checkmate':end.is_checkmate(),'stalemate':end.is_stalemate(),'final_fen':end.fen()})
 return {'status':'legal_line_verified','objective_verified':False,'lines_replayed':len(lines),'endings':endings,'limitation':'A legal source line is not a proof of a forced objective or uniqueness.'}

def run(stage='legal',limit=1000,engine_path=None,nodes=50000):
 engine=None;db=connection();q=Queue(ROOT/'solver-results/r2-analysis.sqlite');start=time.monotonic();done=failed=0
 configuration={'stage':stage,'verifier':'r2.2','chess_version':chess.__version__,'threads':1,'hash_mib':32,'multipv':3,'nodes':nodes if stage=='engine' else None}
 if stage=='engine':
  if not engine_path:raise ValueError('Engine binary required')
  engine=chess.engine.SimpleEngine.popen_uci(str(engine_path));engine.configure({'Threads':1,'Hash':32})
  configuration.update(engine_sha256=hashlib.sha256(engine_path.read_bytes()).hexdigest(),engine_identity=dict(engine.id),nnue_options={k:str(v.default) for k,v in engine.options.items() if 'evalfile' in k.lower()})
 config=digest(configuration)
 try:
  for id,blob in db.execute("select id,payload from entities where domain in ('puzzles','training_positions') order by id"):
   if done+failed>=limit or shutil.disk_usage(ROOT).free<1200*1024**2+8*1024**2:break
   owner=q.claim(id,stage,config)
   if not owner:continue
   try:
    record=unpack(blob);result=legal(record);result['configuration']=configuration
    board_for_tb=chess.Board(record['display_fen'])
    if len(board_for_tb.piece_map())<=7:
     material=chess.syzygy.calc_key(board_for_tb)
     table_root=ROOT/'raw/syzygy'
     with chess.syzygy.open_tablebase(str(table_root)) as tables:
      try:result['syzygy']={'wdl':tables.probe_wdl(board_for_tb),'dtz':tables.probe_dtz(board_for_tb),'material':material,'status':'exact_position_probed'}
      except KeyError as exc:result['syzygy']={'status':'verification_incomplete','material':material,'missing_dependency':str(exc),'coverage':'Only installed material tables, not complete seven-man coverage'}
    if engine:
     # Reset hash between jobs so previous worker history does not define hidden evidence state.
     if 'Clear Hash' in engine.options:engine.configure({'Clear Hash':None})
     board=chess.Board(record['display_fen']);infos=engine.analyse(board,chess.engine.Limit(nodes=nodes),multipv=min(3,board.legal_moves.count()))
     result['status']='engine_analyzed';result['lines']=[]
     for info in infos:
      score=info['score'].pov(board.turn);result['lines'].append({'pv':[m.uci() for m in info.get('pv',[])],'depth':info.get('depth'),'nodes':info.get('nodes'),'time':info.get('time'),'score_cp':score.score(),'mate':score.mate()})
     result['objective_verified']=False;result['limitation']='Finite-node MultiPV; no forced-objective or unique-solution proof.'
    q.finish(id,stage,config,owner,result);done+=1
   except Exception as exc:q.finish(id,stage,config,owner,{'status':'rejected','error':str(exc),'configuration':configuration},True);failed+=1
  totals=[list(x) for x in q.db.execute('select stage,status,count(*) from jobs group by stage,status')]
  atomic(ROOT/('reports/r2-verification-'+stage+'.json'),{'generated_at':now(),'config':configuration,'config_hash':config,'processed_this_run':done,'failed_this_run':failed,'objective_verified':0,'jobs':totals,'seconds':time.monotonic()-start,'rights_review':'RIGHTS_REVIEW_PENDING'})
 finally:
  if engine:engine.quit()
  q.close();db.close()
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--stage',choices=['legal','engine'],default='legal');p.add_argument('--limit',type=int,default=1000);p.add_argument('--engine',type=Path);p.add_argument('--nodes',type=int,default=50000);a=p.parse_args();run(a.stage,a.limit,a.engine,a.nodes)
