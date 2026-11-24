"""Private full file/plan ledger, including planned URLs without attempted receipts."""
import collections,json
from acquire import ROOT,atomic,now

def run():
 receipts=[];by_url=collections.defaultdict(list)
 for p in sorted((ROOT/'raw').rglob('*.receipt.json')):
  r=json.loads(p.read_text());target=ROOT/r['path'];partial=target.with_name(target.name+'.part')
  item={k:r.get(k) for k in ['source_id','url','path','status','bytes','advertised_bytes','sha256','error']}
  item.update(actual_file_bytes=target.stat().st_size if target.exists() else None,partial_bytes=partial.stat().st_size if partial.exists() else 0)
  receipts.append(item);by_url[(r['source_id'],r.get('url'))].append(item)
 plans={}
 for p in sorted((ROOT/'manifests').glob('*.json')):
  if 'plan' not in p.name and p.name!='first-downloads.json':continue
  data=json.loads(p.read_text())
  if not isinstance(data,list):continue
  for r in data:
   if not isinstance(r,dict) or not r.get('url') or r.get('kind','data')!='data':continue
   key=(r['source'],r['url']);item=plans.setdefault(key,{'source_id':key[0],'url':key[1],'plans':[],'explicit_names':[]})
   item['plans'].append(p.name)
   if r.get('name') and r['name'] not in item['explicit_names']:item['explicit_names'].append(r['name'])
 for key,item in plans.items():
  matches=by_url.get(key,[]);item['receipt_paths']=[r['path'] for r in matches]
  item['status']='complete' if any(r['status']=='complete' for r in matches) else matches[0]['status'] if matches else 'pending_unattempted'
  item['status_scope']='Unique planned source/URL job; physical file statuses are separate'
 result={'generated_at':now(),'rights_review':'RIGHTS_REVIEW_PENDING','physical_files':receipts,'physical_file_statuses':dict(collections.Counter(r['status'] for r in receipts)),'planned_url_jobs':list(plans.values()),'planned_url_job_statuses':dict(collections.Counter(r['status'] for r in plans.values())),'notes':['All saved data plans are included, deduplicated by source/URL. Inspection page plans are excluded.','No receipt means pending_unattempted, not completed or source-failed.','Unknown advertised size prevents an exact complete acquisition-byte total.']}
 atomic(ROOT/'reports/r2-file-ledger.json',result);print(json.dumps({k:result[k] for k in ['physical_file_statuses','planned_url_job_statuses']},indent=2))
if __name__=='__main__':run()
