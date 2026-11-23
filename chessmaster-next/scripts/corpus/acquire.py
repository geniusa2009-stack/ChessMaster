"""Traceable corpus acquisition. Network via curl; no production access."""
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
 p.parent.mkdir(parents=True,exist_ok=True); q=p.with_suffix(p.suffix+'.tmp'); q.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n'); q.replace(p)
def fetch(source,url,name=None,kind='data',reserve=1200*1024**2):
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
  head=subprocess.run(['curl','-sSIL','--max-time','25',url],capture_output=True,text=True)
  r['head_response']=head.stdout; sizes=re.findall(r'(?im)^content-length:\s*(\d+)',head.stdout)
  size=int(sizes[-1]) if sizes else None; r['advertised_bytes']=size
  free=shutil.disk_usage(ROOT).free
  if kind=='data' and (free<=reserve or (size is not None and size>free-reserve)):
   r.update(status='blocked_storage' if size else 'pending_size_probe',free_bytes=free,storage_reserve_bytes=reserve)
   atomic(receipt,r); return r
  args=['curl','-sS','--fail-with-body','--location','--connect-timeout','15','--max-time','1800','--retry','1','--dump-header',str(headers),'--output',str(partial)]
  if partial.exists():
   previous=target.with_name(target.name+'.resume.json')
   if not previous.exists(): raise RuntimeError('Partial file has no validator; preserve and inspect before resuming')
   validator=json.loads(previous.read_text()).get('validator')
   if not validator: raise RuntimeError('Server supplied no resume validator; preserve partial file')
   args+=['--continue-at','-','--header','If-Range: '+validator]
  args+=['--max-filesize',str(max(1,free-reserve) if kind=='data' else 8*1024**2),url]
  run=subprocess.run(args,capture_output=True,text=True)
  text=headers.read_text(errors='replace') if headers.exists() else ''
  vals=re.findall(r'(?im)^(?:etag|last-modified):\s*(.+)',text)
  atomic(target.with_name(target.name+'.resume.json'),{'validator':vals[0].strip() if vals else None,'url':url})
  r['response_headers']=text
  if run.returncode: raise RuntimeError(run.stderr.strip() or str(run.returncode))
  if size is not None and partial.stat().st_size!=size: raise RuntimeError('Downloaded bytes differ from HEAD Content-Length')
  partial.replace(target)
  r.update(status='complete',bytes=target.stat().st_size,sha256=sha(target),completed_at=now())
 except Exception as e: r.update(status='failed',error=str(e),partial_bytes=partial.stat().st_size if partial.exists() else 0)
 atomic(receipt,r); print(source,r['status'],r.get('bytes',r.get('error','')),flush=True); return r

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
