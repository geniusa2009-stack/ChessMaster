"""Orthodox directmate adapter with independent certificate checks of Popeye keys.
Source solution absence remains explicit. No fairy, help/selfmate or retro proof is inferred.
"""
import argparse,hashlib,json,re,shutil,sqlite3,subprocess,time
from pathlib import Path
import chess
from acquire import ROOT,atomic,now
from normalize_r2 import unpack,digest
from verify_r2 import Queue
from mate_proof_r2 import prove,check_certificate

def problem(fen,stipulation):
 match=re.fullmatch(r'#([1-5])',stipulation or '')
 if not match:raise ValueError('Unsupported stipulation; direct orthodox #1–#5 only')
 b=chess.Board(fen)
 if not b.is_valid() or b.turn!=chess.WHITE or b.castling_rights or b.ep_square is not None:raise ValueError('Requires valid white-to-move diagram without castling/en-passant rights')
 forsyth=b.board_fen().replace('n','s').replace('N','S')
 return f'BeginProblem\nStipulation {stipulation}\nForsyth {forsyth}\nOption NoCastling a1e1h1a8e8h8\nEndProblem\n',int(match[1])

def keys(output):
 out=[]
 for m in re.finditer(r'^\s*1\.(?!\.)\s*[KQRBSP]?([a-h][1-8])[-*x]([a-h][1-8])(?:=([QRBS]))?',output,re.M):
  move=m[1]+m[2]+(m[3].lower().replace('s','n') if m[3] else '')
  if move not in out:out.append(move)
 return out

def run(seconds=60):
 binary=ROOT/'extracted/popeye/popeye';configuration={'adapter':'popeye-direct-1','binary_sha256':hashlib.sha256(binary.read_bytes()).hexdigest(),'native_maxmem_mib':32,'native_maxtime_seconds':1,'python_certificate_nodes':20000,'python_certificate_seconds':1};config=digest(configuration)
 db=sqlite3.connect((ROOT/'consolidated/r2.sqlite').as_uri()+'?mode=ro',uri=True);q=Queue(ROOT/'solver-results/r2-analysis.sqlite');start=time.monotonic();states={};processed=0;unsupported={}
 try:
  for id,blob in db.execute("select id,payload from entities where domain='compositions' and id in(select entity_id from normalization_outputs where adapter=(select adapter from normalization_outputs order by rowid desc limit 1)) order by id"):
   if seconds and time.monotonic()-start>=seconds:break
   if shutil.disk_usage(ROOT).free<1200*1024**2:break
   r=unpack(blob)
   try:text,n=problem(r['display_fen'],r.get('stipulation'))
   except ValueError as exc:
    reason=str(exc);unsupported[reason]=unsupported.get(reason,0)+1;continue
   owner=q.claim('r2:'+id,'popeye',config,lease=90)
   if not owner:continue
   try:
    process=subprocess.run([str(binary),'-maxmem','32M','-maxtime','1'],input=text,text=True,capture_output=True,timeout=5)
    result={'status':'engine_analyzed','objective_verified':False,'source_stipulation':r['stipulation'],'source_solution_present':not r.get('missing_solution',True),'source_solution_comparison':'not_performed','native_input':text,'stdout':process.stdout,'stderr':process.stderr,'exit_code':process.returncode,'configuration':configuration,'proofs':[]}
    if process.returncode==0 and not process.stderr.strip():
     for move in keys(process.stdout):
      proof=prove(r['display_fen'],move,2*n-1,20000,1,unique=False)
      if proof['objective_verified'] and check_certificate(r['display_fen'],proof['certificate'],2*n-1):result['proofs'].append(proof)
    if result['proofs']:result.update(status='objective_verified',objective_verified=True,objective_scope='At least one forced orthodox mate within the stated horizon; source solution, exact-length soundness and uniqueness remain separate')
    q.finish('r2:'+id,'popeye',config,owner,result);processed+=1;states[result['status']]=states.get(result['status'],0)+1
   except Exception as e:q.finish('r2:'+id,'popeye',config,owner,{'status':'verification_incomplete','error':str(e),'configuration':configuration},True)
  atomic(ROOT/'reports/r2-popeye.json',{'generated_at':now(),'processed_this_run':processed,'states_this_run':states,'unsupported_records_observed':unsupported,'configuration':configuration,'seconds':time.monotonic()-start,'rights_review':'RIGHTS_REVIEW_PENDING'});print(states,flush=True)
 finally:q.close();db.close()
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--seconds',type=float,default=60);a=p.parse_args();run(a.seconds)
