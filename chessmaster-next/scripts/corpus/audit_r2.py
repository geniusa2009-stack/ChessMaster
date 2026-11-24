"""Read-only inventory of the private corpus; reports contain no HTTP credentials."""
import collections, hashlib, json, os, shutil, sqlite3, time, resource
from pathlib import Path
from acquire import ROOT, atomic, now, sha

def fingerprint(path):
 stat=path.stat();wal=Path(str(path)+'-wal')
 return {'file_bytes':stat.st_size,'file_mtime_ns':stat.st_mtime_ns,'file_device':stat.st_dev,'file_inode':stat.st_ino,'wal_bytes':wal.stat().st_size if wal.exists() else 0}

def reusable_integrity(prior,path,relative,mode):
 entry=prior.get('databases',{}).get(relative,{})
 return bool(mode=='integrity_check' and prior.get('integrity_mode')==mode and prior.get('sqlite_version')==sqlite3.sqlite_version and entry.get('integrity')==[['ok']] and all(entry.get(k)==v for k,v in fingerprint(path).items()) and not fingerprint(path)['wal_bytes'])

def audit(verify_raw=False, integrity='quick_check',reuse_path=None,mmap_bytes=0):
 prior=json.loads(reuse_path.read_text()) if reuse_path else {}
 start=time.monotonic(); report={'generated_at':now(),'rights_review':'RIGHTS_REVIEW_PENDING','integrity_mode':integrity,'sqlite_version':sqlite3.sqlite_version,'disk':{},'databases':{},'receipts':[],'checkpoints':{},'plans':{},'missing_shards':[]}
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
  before=fingerprint(p)
  if before['wal_bytes']:raise RuntimeError('Checkpoint database WAL before audit: '+str(p.relative_to(ROOT)))
  db=sqlite3.connect(p.as_uri()+'?mode=ro',uri=True,timeout=5)
  db.execute('pragma cache_size=-262144');effective_mmap=db.execute('pragma mmap_size='+str(max(0,int(mmap_bytes)))).fetchone()[0];print('Checking database:',p.name,flush=True)
  relative=str(p.relative_to(ROOT));reuse=reusable_integrity(prior,p,relative,integrity)
  result={'integrity':prior['databases'][relative]['integrity'] if reuse else db.execute('pragma '+integrity).fetchall(),'tables':{},'connection_mmap_bytes':effective_mmap,'integrity_reused':reuse,'integrity_checked_at':prior['databases'][relative].get('integrity_checked_at',prior.get('generated_at')) if reuse else now()}
  for (table,) in db.execute("select name from sqlite_master where type='table' and name not like 'sqlite_%'"):
   result['tables'][table]=db.execute('select count(*) from "'+table.replace('"','""')+'"').fetchone()[0]
  if p.name=='index.sqlite':
   for (shard,) in db.execute('select shard from batches'):
    if not (ROOT/shard).is_file():report['missing_shards'].append(shard)
  if p.name=='domains.sqlite':result['domains']=dict(db.execute('select domain,count(*) from records group by domain'))
  if p.name=='analysis.sqlite':result['jobs']=[list(x) for x in db.execute('select stage,status,count(*) from jobs group by stage,status')]
  db.close()
  if fingerprint(p)!=before:raise RuntimeError('Database changed during audit: '+relative)
  result.update(before);report['databases'][relative]=result
  atomic(ROOT/'reports/r2-audit-db-progress.json',{'databases':report['databases'],'updated_at':now()});print('Database complete:',p.name,flush=True)
 try:
  import duckdb
  db=duckdb.connect(str(ROOT/'consolidated/evaluations.duckdb'),read_only=True)
  report['duckdb']={'accessible':True,'tables':db.execute('show tables').fetchall()};db.close()
 except Exception as exc:report['duckdb']={'accessible':False,'error':str(exc)}
 report['acquisitions_by_status']=dict(collections.Counter(r['status'] for r in report['receipts']))
 report['remaining_known_download_bytes']=sum(max(0,(r.get('advertised_bytes') or 0)-r['partial_bytes']) for r in report['receipts'] if r['status']!='complete')
 report['storage_projection']={'known_download_lower_bound_bytes':report['remaining_known_download_bytes'],'additional_free_bytes_for_downloads_and_reserve':max(0,report['remaining_known_download_bytes']+report['disk']['reserve_bytes']-usage.free),'scope':'Lower bound only; unknown pending sizes, decompression, normalized shards, indexes, solver data, WAL and database expansion are excluded. Full projection requires measured import samples.'}
 report['sqlite_cache_limit_bytes']=256*1024**2;report['audit_process_peak_rss_bytes']=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
 report['seconds']=round(time.monotonic()-start,3)
 atomic(ROOT/'reports/r2-audit.json',report)
 print(json.dumps({k:report[k] for k in ['acquisitions_by_status','disk','remaining_known_download_bytes','storage_projection','missing_shards','duckdb','seconds']},indent=2))
 return report
if __name__=='__main__':
 import argparse
 p=argparse.ArgumentParser();p.add_argument('--verify-raw',action='store_true');p.add_argument('--full-integrity',action='store_true');p.add_argument('--mmap-bytes',type=int,default=0,help='Optional read-only mapping limit; default uses ordinary buffered reads');p.add_argument('--reuse-integrity',type=Path,help='Reuse passed full checks only for identical checkpointed file fingerprints and SQLite version');a=p.parse_args();audit(a.verify_raw,'integrity_check' if a.full_integrity else 'quick_check',a.reuse_integrity,a.mmap_bytes)
