"""Capacity-bounded serial resume of incomplete receipts; preserves prior receipts."""
import argparse,json,shutil
from pathlib import Path
from acquire import ROOT,fetch,atomic,now,refresh
RESERVE=1200*1024**2

def candidates(root=ROOT,budget=10*1024**2):
 items=[]
 for p in (root/'raw').rglob('*.receipt.json'):
  r=json.loads(p.read_text());size=r.get('advertised_bytes')
  if r.get('status')=='complete' or not isinstance(size,int) or size<=0:continue
  target=root/r['path']
  # Never replace an unreceipted or incomplete-status target with existing bytes.
  if target.exists():continue
  part=target.with_name(target.name+'.part')
  # Existing partials require explicit validator/HTTP range validation; not selected by this small-file pass.
  if part.exists():continue
  if size<=budget:items.append((size,str(p),r))
 return sorted(items,key=lambda x:(x[0],x[1]))

def run(budget=10*1024**2,max_files=10):
 results=[];spent=0
 for size,receipt_path,old in candidates(budget=budget):
  if len(results)>=max_files or spent+size>budget:break
  if shutil.disk_usage(ROOT).free-RESERVE<size+4*1024**2:break
  receipt=Path(receipt_path);target=ROOT/old['path']
  journal=ROOT/'reports/r2-acquisition-attempts';journal.mkdir(exist_ok=True)
  import hashlib
  identity=hashlib.sha256((old['path']+now()).encode()).hexdigest()
  atomic(journal/(identity+'-before.json'),old)
  result=fetch(old['source_id'],old['url'],name=target.name,kind=old.get('kind','data'),reserve=RESERVE)
  if result.get('advertised_bytes') is None:
   result['advertised_bytes']=old['advertised_bytes'];atomic(receipt,result)
  atomic(journal/(identity+'-after.json'),result)
  if result.get('status')=='complete':refresh()
  spent+=result.get('bytes',0) if result.get('status')=='complete' else 0
  results.append({k:result.get(k) for k in ['source_id','path','status','bytes','sha256','error']});print(results[-1],flush=True)
  if result.get('status')=='failed' and 'Could not resolve host' in result.get('error',''):break
 # Do not regenerate source metadata or touch completed snapshots.
 atomic(ROOT/'reports/r2-acquisition.json',{'generated_at':now(),'rights_review':'RIGHTS_REVIEW_PENDING','downloaded_bytes_this_run':spent,'results':results,'budget_bytes':budget})
 return results
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--budget-mib',type=int,default=10);p.add_argument('--max-files',type=int,default=10);a=p.parse_args();run(a.budget_mib*1024**2,a.max_files)
