"""Read-only inventory of the private corpus; reports contain no HTTP credentials."""
import collections, hashlib, json, os, shutil, sqlite3, time
from pathlib import Path
from acquire import ROOT, atomic, now, sha

def audit(verify_raw=False, integrity='quick_check'):
 start=time.monotonic(); report={'generated_at':now(),'rights_review':'RIGHTS_REVIEW_PENDING','disk':{},'databases':{},'receipts':[],'checkpoints':{},'plans':{},'missing_shards':[]}
 usage=shutil.disk_usage(ROOT);report['disk']={'total_bytes':usage.total,'free_bytes':usage.free,'reserve_bytes':1200*1024**2}
 report['disk']['directories']={d.name:sum(p.stat().st_size for p in d.rglob('*') if p.is_file()) for d in ROOT.iterdir() if d.is_dir()}
 for receipt_number,receipt in enumerate(sorted((ROOT/'raw').rglob('*.receipt.json')),1):
  r=json.loads(receipt.read_text());p=ROOT/r['path'];part=p.with_name(p.name+'.part')
  item={k:r.get(k) for k in ['source_id','path','status','bytes','advertised_bytes','sha256']}
  item.update(exists=p.exists(),partial_bytes=part.stat().st_size if part.exists() else 0)
  if r.get('status')=='complete':
   item['size_matches']=p.exists() and p.stat().st_size==r.get('bytes')
   if verify_raw and p.exists():item['sha256_matches']=sha(p)==r.get('sha256')
  report['receipts'].append(item)
  if receipt_number%100==0:print('Raw receipts checked:',receipt_number,flush=True)
 for p in sorted((ROOT/'checkpoints').glob('*.json')):report['checkpoints'][p.name]=json.loads(p.read_text())
 for p in sorted((ROOT/'manifests').glob('*plan.json')):
  data=json.loads(p.read_text());report['plans'][p.name]={'entries':len(data),'advertised_bytes':sum(x.get('bytes',x.get('advertised_bytes',0)) or 0 for x in data) if isinstance(data,list) else None}
 atomic(ROOT/'reports/r2-audit-raw-progress.json',{'generated_at':now(),'verify_raw':verify_raw,'receipts':report['receipts']})
 for p in [*(ROOT/'consolidated').glob('*.sqlite'),*(ROOT/'solver-results').glob('*.sqlite')]:
  db=sqlite3.connect(p.as_uri()+'?mode=ro',uri=True,timeout=5)
  db.execute('pragma cache_size=-131072');print('Checking database:',p.name,flush=True)
  result={'integrity':db.execute('pragma '+integrity).fetchall(),'tables':{}}
  for (table,) in db.execute("select name from sqlite_master where type='table' and name not like 'sqlite_%'"):
   result['tables'][table]=db.execute('select count(*) from "'+table.replace('"','""')+'"').fetchone()[0]
  if p.name=='index.sqlite':
   for (shard,) in db.execute('select shard from batches'):
    if not (ROOT/shard).is_file():report['missing_shards'].append(shard)
  if p.name=='domains.sqlite':result['domains']=dict(db.execute('select domain,count(*) from records group by domain'))
  if p.name=='analysis.sqlite':result['jobs']=[list(x) for x in db.execute('select stage,status,count(*) from jobs group by stage,status')]
  db.close();report['databases'][str(p.relative_to(ROOT))]=result
  atomic(ROOT/'reports/r2-audit-db-progress.json',{'databases':report['databases'],'updated_at':now()});print('Database complete:',p.name,flush=True)
 try:
  import duckdb
  db=duckdb.connect(str(ROOT/'consolidated/evaluations.duckdb'),read_only=True)
  report['duckdb']={'accessible':True,'tables':db.execute('show tables').fetchall()};db.close()
 except Exception as exc:report['duckdb']={'accessible':False,'error':str(exc)}
 report['acquisitions_by_status']=dict(collections.Counter(r['status'] for r in report['receipts']))
 report['remaining_known_download_bytes']=sum(max(0,(r.get('advertised_bytes') or 0)-r['partial_bytes']) for r in report['receipts'] if r['status']!='complete')
 report['storage_projection']={'known_download_lower_bound_bytes':report['remaining_known_download_bytes'],'additional_free_bytes_for_downloads_and_reserve':max(0,report['remaining_known_download_bytes']+report['disk']['reserve_bytes']-usage.free),'scope':'Lower bound only; unknown pending sizes, decompression, normalized shards, indexes, solver data, WAL and database expansion are excluded. Full projection requires measured import samples.'}
 report['seconds']=round(time.monotonic()-start,3)
 atomic(ROOT/'reports/r2-audit.json',report)
 print(json.dumps({k:report[k] for k in ['acquisitions_by_status','disk','remaining_known_download_bytes','storage_projection','missing_shards','duckdb','seconds']},indent=2))
 return report
if __name__=='__main__':
 import argparse
 p=argparse.ArgumentParser();p.add_argument('--verify-raw',action='store_true');p.add_argument('--full-integrity',action='store_true');a=p.parse_args();audit(a.verify_raw,'integrity_check' if a.full_integrity else 'quick_check')
