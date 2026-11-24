"""Exact installed-material Syzygy probes; no implied seven-man coverage or source-line proof."""
import argparse,json,shutil,sqlite3,time
import chess,chess.syzygy
from acquire import ROOT,sha,atomic,now
from normalize_r2 import unpack,digest,VERSION as ADAPTER_VERSION
from verify_r2 import Queue

def study_records(db):
 after=''
 while True:
  keys=db.execute("select e.id from entities e indexed by entity_domain where e.domain='endgame_studies' and e.id>? and exists(select 1 from normalization_outputs o where o.entity_id=e.id and o.adapter=?) order by e.id limit 1000",(after,ADAPTER_VERSION)).fetchall()
  if not keys:break
  for (id,) in keys:yield id,db.execute('select payload from entities where id=?',(id,)).fetchone()[0]
  after=keys[-1][0]

def run():
 files=sorted(p for p in (ROOT/'raw/syzygy').iterdir() if p.suffix in ('.rtbw','.rtbz'));config={'verifier':'syzygy-study-value-1','chess_version':chess.__version__,'files':{p.name:sha(p) for p in files},'rule_policy':'Fresh FEN, halfmove clock zero, unconditional WDL only; no source-solution comparison'};identity=digest(config)
 db=sqlite3.connect((ROOT/'consolidated/r2.sqlite').as_uri()+'?mode=ro',uri=True);db.execute('pragma cache_size=-32768');queue=Queue(ROOT/'solver-results/r2-analysis.sqlite');started=time.monotonic();states={};processed=0
 try:
  with chess.syzygy.open_tablebase(str(ROOT/'raw/syzygy')) as tables:
   for id,blob in study_records(db):
    if shutil.disk_usage(ROOT).free<1200*1024**2:break
    owner=queue.claim('r2:'+id,'syzygy',identity)
    if not owner:continue
    r=unpack(blob);result={'status':'verification_incomplete','objective_verified':False,'source_stipulation':r.get('stipulation'),'source_solution_comparison':'not_performed','configuration':config}
    try:
     board=chess.Board(r['display_fen']);result['material']=chess.syzygy.calc_key(board)
     if not board.is_valid() or board.castling_rights or board.ep_square is not None:result['reason']='Unsupported orthodox state for this tablebase adapter'
     elif len(board.piece_map())>7:result['reason']='Material exceeds available standard Syzygy probing support'
     else:
      try:
       wdl=tables.probe_wdl(board);dtz=tables.probe_dtz(board);white_wdl=wdl if board.turn==chess.WHITE else -wdl
       result.update(status='position_valid',wdl_side_to_move=wdl,dtz=dtz,white_wdl=white_wdl,tablebase_position_value_verified=True)
       if board.halfmove_clock==0 and ((r.get('stipulation')=='+' and white_wdl==2) or (r.get('stipulation')=='=' and white_wdl==0)):
        result.update(status='objective_verified',objective_verified=True,objective_scope='Source study win/draw value for this fresh FEN and installed material, not published solution or uniqueness')
      except KeyError as exc:result['missing_dependency']=str(exc)
     queue.finish('r2:'+id,'syzygy',identity,owner,result);processed+=1;states[result['status']]=states.get(result['status'],0)+1
    except Exception as exc:queue.finish('r2:'+id,'syzygy',identity,owner,{'status':'verification_incomplete','error':str(exc),'configuration':config},True)
  atomic(ROOT/'reports/r2-endgames.json',{'generated_at':now(),'processed_this_run':processed,'states_this_run':states,'installed_material_files':list(config['files']),'config_hash':identity,'seconds':time.monotonic()-started,'coverage':'Exactly the installed material files and available dependencies; not all 3–7-man positions','rights_review':'RIGHTS_REVIEW_PENDING'});print(states,flush=True)
 finally:queue.close();db.close()
if __name__=='__main__':run()
