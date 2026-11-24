"""Real bounded mate proofs over existing private records, independent of Stockfish scores."""
import argparse,gzip,json,re,shutil,sqlite3,time
import chess
from acquire import ROOT,atomic,now
from normalize_r2 import unpack,digest,VERSION as ADAPTER_VERSION
from verify_r2 import Queue,legal
from mate_proof_r2 import prove,check_certificate,VERSION

def records(scope):
 if scope=='r2':
  db=sqlite3.connect((ROOT/'consolidated/r2.sqlite').as_uri()+'?mode=ro',uri=True)
  try:
   for domain in ['puzzles','training_positions']:
    after=''
    while True:
     keys=db.execute('select e.id from entities e indexed by entity_domain where e.domain=? and e.id>? and exists(select 1 from normalization_outputs o where o.entity_id=e.id and o.adapter=?) order by e.id limit 1000',(domain,after,ADAPTER_VERSION)).fetchall()
     if not keys:break
     for (id,) in keys:yield 'r2:'+id,unpack(db.execute('select payload from entities where id=?',(id,)).fetchone()[0])
     after=keys[-1][0]
  finally:db.close()
 else:
  db=sqlite3.connect((ROOT/'consolidated/index.sqlite').as_uri()+'?mode=ro',uri=True)
  try:
   for shard, in db.execute('select shard from batches order by source,snapshot,batch'):
    with gzip.open(ROOT/shard,'rt') as f:
     for line in f:
      r=json.loads(line)
      if not r.get('quarantined') and not r.get('exact_duplicate'):yield 'r1:'+r['canonical_id'],r
  finally:db.close()

def run(scope,seconds=60,nodes=20000,per_job_seconds=1):
 config={'verifier':VERSION,'chess_version':chess.__version__,'node_budget':nodes,'per_job_seconds':per_job_seconds,'unique_first_move':True,'scope':scope}
 identity=digest(config);q=Queue(ROOT/'solver-results/r2-analysis.sqlite');start=time.monotonic();attempted=done=failed=0;counts={};blocked=False
 try:
  for id,r in records(scope):
   if seconds and time.monotonic()-start>=seconds:break
   if shutil.disk_usage(ROOT).free<1200*1024**2:blocked=True;break
   lines=r.get('solution_lines') or ([r['solution']] if r.get('solution') else [])
   if not lines or not lines[0] or len(lines[0])>5 or len(lines[0])%2!=1:continue
   board=chess.Board(r['display_fen']);end=board.copy()
   try:
    for m in lines[0]:end.push_uci(m)
   except ValueError:continue
   if not end.is_checkmate():continue
   theme=next((x for x in r.get('themes',[]) if re.fullmatch(r'mateIn[1-9][0-9]*',x)),None)
   plies=2*int(theme[6:])-1 if theme else len(lines[0])
   if plies>5:continue
   owner=q.claim(id,'objective',identity,lease=per_job_seconds+60)
   if not owner:continue
   attempted+=1
   try:
    # A source theme is retained; otherwise this is an explicitly derived model.
    result=prove(board.fen(),lines[0][0],plies,nodes,per_job_seconds)
    result.update(configuration=config,source_record=id,display_fen=board.fen(),objective_origin='source_theme' if theme else 'modeled_from_checkmating_source_line',source_theme=theme)
    if result['objective_verified']:
     if not check_certificate(board.fen(),result['certificate'],plies):raise ValueError('Independent proof certificate replay failed')
     for alternative in result.get('alternative_first_move_proofs',[]):
      if not check_certificate(board.fen(),alternative,plies):raise ValueError('Alternative certificate replay failed')
     result['certificate_replayed']=True
    q.finish(id,'objective',identity,owner,result);done+=1;counts[result['status']]=counts.get(result['status'],0)+1
   except Exception as e:q.finish(id,'objective',identity,owner,{'status':'rejected','error':str(e),'configuration':config},True);failed+=1
  totals=[list(x) for x in q.db.execute("select json_extract(result,'$.status'),count(*) from jobs where stage='objective' and status='completed' group by json_extract(result,'$.status')")]
  atomic(ROOT/f'reports/r2-objectives-{scope}.json',{'generated_at':now(),'scope':scope,'configuration':config,'config_hash':identity,'attempted_this_run':attempted,'completed_this_run':done,'failed_this_run':failed,'states_this_run':counts,'all_objective_states':totals,'seconds':time.monotonic()-start,'blocked_storage':blocked,'rights_review':'RIGHTS_REVIEW_PENDING'})
  print(counts,flush=True)
 finally:q.close()
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--scope',choices=['r1','r2'],default='r1');p.add_argument('--seconds',type=float,default=60);p.add_argument('--nodes',type=int,default=20000);p.add_argument('--job-seconds',type=float,default=1);a=p.parse_args();run(a.scope,a.seconds,a.nodes,a.job_seconds)
