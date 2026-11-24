"""Traceable corpus acquisition. Network via curl; no production access."""
import fcntl,uuid
import concurrent.futures, hashlib, html, json, os, re, shutil, subprocess, time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse, quote
ROOT=Path(os.environ.get('CHESSMASTER_CORPUS_ROOT',Path(__file__).resolve().parents[1])).resolve()
if Path(__file__).parent.name=='corpus' and not os.environ.get('CHESSMASTER_CORPUS_ROOT'):
 raise RuntimeError('Set CHESSMASTER_CORPUS_ROOT to the private corpus directory outside Git')
if any((parent/'.git').exists() for parent in [ROOT,*ROOT.parents]):
 raise RuntimeError('Raw corpus storage must be outside a Git checkout')
def now(): return datetime.now(timezone.utc).isoformat()
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(1048576),b''): h.update(b)
 return h.hexdigest()
def atomic(p,v):
 p.parent.mkdir(parents=True,exist_ok=True);q=p.with_name(p.name+'.'+uuid.uuid4().hex+'.tmp')
 with q.open('w',encoding='utf-8') as f:
  json.dump(v,f,ensure_ascii=False,indent=2);f.write('\n');f.flush();os.fsync(f.fileno())
 q.replace(p)
 directory=os.open(p.parent,os.O_RDONLY)
 try:os.fsync(directory)
 finally:os.close(directory)

def fetch(source,url,name=None,kind='data',reserve=1200*1024**2):
 if not re.fullmatch(r'[A-Za-z0-9_.-]+',source):raise ValueError('Invalid source namespace')
 locks=ROOT/'checkpoints/download-locks';locks.mkdir(parents=True,exist_ok=True)
 url=quote(url,safe=':/?&=%+#@;,')
 candidate=re.sub(r'[^A-Za-z0-9._-]','_',name or (Path(urlparse(url).path).name or 'index.html'))
 identity=hashlib.sha256((source+'|'+candidate).encode()).hexdigest()
 with (locks/(identity+'.lock')).open('a') as lock:
  try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  except BlockingIOError:raise RuntimeError('Download already claimed by another worker')
  return _fetch_locked(source,url,name,kind,reserve)

def _fetch_locked(source,url,name=None,kind='data',reserve=1200*1024**2):
 url=quote(url,safe=':/?&=%+#@;,')
 folder=ROOT/('raw' if kind=='data' else 'reports/pages')/source
 folder.mkdir(parents=True,exist_ok=True)
 name=name or (Path(urlparse(url).path).name or 'index.html')
 # Names come only from explicit plans or URL basenames, never archive paths.
 name=re.sub(r'[^A-Za-z0-9._-]','_',name)
 target=folder/name; receipt=target.with_name(target.name+'.receipt.json')
 if receipt.exists():
  old=json.loads(receipt.read_text())
  if old.get('url')!=url:
   return fetch(source,url,Path(name).stem+'-'+hashlib.sha256(url.encode()).hexdigest()[:12]+Path(name).suffix,kind,reserve)
  if old.get('status')=='complete' and target.exists() and sha(target)==old['sha256']: return old
 # A completed receipt with a mismatching digest, or existing unreceipted raw
 # bytes, is an integrity incident. Never replace those bytes with a new download.
 if target.exists():
  raise RuntimeError('Existing raw target is not checksum-verified; preserve and inspect: '+str(target))
 headers=target.with_name(target.name+'.headers')
 partial=target.with_name(target.name+'.part')
 r={'source_id':source,'url':url,'kind':kind,'started_at':now(),'path':str(target.relative_to(ROOT)),'rights_review':'RIGHTS_REVIEW_PENDING'}
 try:
  from http_resume_r2 import final_headers,validator,safe_partial,validate_range,prefix_sha
  head=subprocess.run(['curl','-sSIL','--max-time','25',url],capture_output=True,text=True)
  r['head_response']=head.stdout;head_info=final_headers(head.stdout)
  length=head_info['headers'].get('content-length');size=int(length) if length and length.isdigit() else None;r['advertised_bytes']=size
  resume_path=target.with_name(target.name+'.resume.json');resume_start=0
  if partial.exists():
   safe,reason=safe_partial(partial,resume_path,url,head_info)
   if safe:resume_start=partial.stat().st_size
   else:
    saved=ROOT/'reports/incomplete-prefixes';saved.mkdir(parents=True,exist_ok=True)
    old=saved/(name+'.'+uuid.uuid4().hex+'.part');partial.replace(old)
    r['preserved_partial']={'path':str(old.relative_to(ROOT)),'reason':reason,'bytes':old.stat().st_size}
  needed=max(0,size-resume_start) if size is not None else None
  free=shutil.disk_usage(ROOT).free
  if kind=='data' and (free<=reserve or (needed is not None and needed>free-reserve)):
   r.update(status='blocked_storage' if size else 'pending_size_probe',free_bytes=free,storage_reserve_bytes=reserve)
   atomic(receipt,r); return r
  args=['curl','-sS','--fail-with-body','--location','--connect-timeout','15','--max-time','1800','--retry','1','--dump-header',str(headers),'--output',str(partial)]
  if resume_start:
   previous=json.loads(resume_path.read_text());args+=['--continue-at','-','--header','If-Range: '+previous['validator']]
  args+=['--max-filesize',str(size if kind=='data' and size is not None else max(1,free-reserve) if kind=='data' else 8*1024**2),url]
  run=subprocess.run(args,capture_output=True,text=True)
  text=headers.read_text(errors='replace') if headers.exists() else ''
  response=final_headers(text);token,token_type=validator(response['headers'])
  resume_ok=bool(token and response['status'] in [200,206])
  if resume_start:
   try:
    validate_range(response,resume_start,size)
    if token!=previous['validator']:raise ValueError('Resume response validator changed or missing')
   except ValueError:resume_ok=False;raise
  atomic(resume_path,{'validator':token,'validator_type':token_type,'url':url,'resume_safe':resume_ok,'partial_bytes':partial.stat().st_size if partial.exists() else 0,'partial_sha256':prefix_sha(partial) if partial.exists() and resume_ok else None})
  r['response_headers']=text
  if run.returncode: raise RuntimeError(run.stderr.strip() or str(run.returncode))
  if size is not None and partial.stat().st_size!=size: raise RuntimeError('Downloaded bytes differ from HEAD Content-Length')
  with partial.open('rb') as saved:os.fsync(saved.fileno())
  if target.exists():raise RuntimeError('Concurrent completed raw target; refusing overwrite')
  partial.replace(target)
  r.update(status='complete',bytes=target.stat().st_size,sha256=sha(target),completed_at=now())
 except Exception as e: r.update(status='failed',error=str(e),partial_bytes=partial.stat().st_size if partial.exists() else 0)
 atomic(receipt,r)
 if kind=='data' and r.get('status')=='complete':refresh()
 print(source,r['status'],r.get('bytes',r.get('error','')),flush=True); return r

def inspect(s):
 r=fetch(s['source_id'],s['source_url'],'index.html','inspection')
 links=[]
 if r['status']=='complete':
  body=(ROOT/r['path']).read_text(errors='replace')
  for link in re.findall(r'''(?:href|src)\s*=\s*["']([^"']+)["']''',body,re.I):
   full=urljoin(s['source_url'],html.unescape(link))
   if re.search(r'\.(?:pgn|zip|bz2|zst|gz|epd|fen|csv|tsv|json|parquet|7z|si4|bin)(?:[?#]|$)',full,re.I): links.append(full)
 s.update(inspected_at=now(),inspection_status=r['status'],discovered_downloads=sorted(set(links)))
 atomic(ROOT/'manifests/inspections'/f"{s['source_id']}.json",s)
 return s

def refresh():
 locks=ROOT/'checkpoints';locks.mkdir(parents=True,exist_ok=True)
 with (locks/'manifest.lock').open('a') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX);return _refresh_locked()

def _refresh_locked():
 rows=[]
 for p in sorted((ROOT/'manifests/inspections').glob('*.json')): rows.append(json.loads(p.read_text()))
 atomic(ROOT/'manifests/sources.json',rows)
 receipts=[]
 for p in (ROOT/'raw').rglob('*.receipt.json'): receipts.append(json.loads(p.read_text()))
 atomic(ROOT/'manifests/acquisitions.json',receipts)
 with (ROOT/'manifests/acquisitions.jsonl').open('w') as f:
  for r in receipts:f.write(json.dumps(r,ensure_ascii=False)+'\n')
 atomic(ROOT/'reports/acquisition-status.json',{'generated_at':now(),'sources_discovered':len(rows),'sources_inspected':sum(s.get('inspection_status')=='complete' for s in rows),'data_files_downloaded':sum(r.get('status')=='complete' for r in receipts),'data_bytes_downloaded':sum(r.get('bytes',0) for r in receipts if r.get('status')=='complete'),'blocked_or_failed':[r for r in receipts if r.get('status')!='complete']})
if __name__=='__main__':
 import argparse
 p=argparse.ArgumentParser();p.add_argument('command',choices=['inspect','download','status']);p.add_argument('--plan',type=Path);a=p.parse_args()
 if a.command=='inspect':
  plan=json.loads(a.plan.read_text())
  with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:list(ex.map(inspect,plan))
 elif a.command=='download':
  # Downloads are serial: capacity decisions must see previously committed files.
  for item in json.loads(a.plan.read_text()):
   result=fetch(**item)
   if result.get('status')=='blocked_storage' and result.get('free_bytes',0)<=result.get('storage_reserve_bytes',0):
    print('Storage reserve reached; remaining plan entries stay pending.',flush=True);break
 refresh()
