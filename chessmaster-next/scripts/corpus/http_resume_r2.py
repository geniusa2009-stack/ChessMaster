"""HTTP resume validation. Failed HTTP bodies are never trusted as source prefixes."""
import hashlib,json,re
from pathlib import Path

def final_headers(text):
 blocks=re.split(r'(?m)(?=^HTTP/\S+\s+\d{3})',text)
 blocks=[b for b in blocks if re.match(r'^HTTP/\S+\s+\d{3}',b)]
 if not blocks:return {'status':None,'headers':{}}
 lines=blocks[-1].splitlines();status=int(lines[0].split()[1]);headers={}
 for line in lines[1:]:
  if not line.strip():break
  if ':' in line:
   k,v=line.split(':',1);headers[k.lower()]=v.strip()
 return {'status':status,'headers':headers}

def validator(headers):
 etag=headers.get('etag')
 if etag and not etag.startswith('W/'):return etag,'etag'
 if headers.get('last-modified'):return headers['last-modified'],'last-modified'
 return None,None

def prefix_sha(path):
 d=hashlib.sha256()
 with path.open('rb') as f:
  for block in iter(lambda:f.read(1024*1024),b''):d.update(block)
 return d.hexdigest()

def safe_partial(partial,state_path,url,head):
 if not partial.exists():return False,'no_partial'
 if not state_path.exists():return False,'missing_resume_state'
 state=json.loads(state_path.read_text());old=state.get('validator');kind=state.get('validator_type')
 if not state.get('resume_safe') or not old or kind not in ['etag','last-modified']:return False,'unverified_legacy_or_error_prefix'
 if state.get('url')!=url:return False,'source_url_changed'
 if partial.stat().st_size!=state.get('partial_bytes') or prefix_sha(partial)!=state.get('partial_sha256'):return False,'partial_prefix_changed'
 current=head['headers'].get(kind)
 if current and current!=old:return False,'source_validator_changed'
 return True,'verified_prefix'

def validate_range(response,start,total=None):
 if response['status']!=206:raise ValueError('Resume requires HTTP 206')
 match=re.fullmatch(r'bytes (\d+)-(\d+)/(\d+|\*)',response['headers'].get('content-range',''))
 if not match or int(match[1])!=start:raise ValueError('Content-Range does not start at verified prefix')
 if int(match[2])<int(match[1]):raise ValueError('Invalid Content-Range interval')
 if match[3]=='*':raise ValueError('Cannot establish complete resumed object length')
 length=int(match[3])
 if total is not None and length!=total:raise ValueError('Content-Range total changed')
 if int(match[2])!=length-1:raise ValueError('Open-ended resume did not reach object end')
 return length
