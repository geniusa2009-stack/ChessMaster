"""Reconcile committed R1 shards; quarantine unreferenced normalized artifacts only."""
import argparse,fcntl,json,sqlite3,uuid
from pathlib import Path
from acquire import ROOT,atomic,sha,now

def reconcile(root,quarantine=False):
 locks=root/'checkpoints/normalization-locks';locks.mkdir(parents=True,exist_ok=True)
 with (locks/'maintenance.lock').open('a') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  return _reconcile(root,quarantine)

def _reconcile(root,quarantine=False):
 db=sqlite3.connect((root/'consolidated/index.sqlite').as_uri()+'?mode=ro',uri=True)
 committed={row[0] for row in db.execute('select shard from batches')};db.close()
 missing=sorted(path for path in committed if not (root/path).is_file())
 candidates=[]
 for path in (path for folder in {(root/shard).parent for shard in committed} for path in folder.glob('*')):
  if path.is_file() and (path.name.endswith('.jsonl.gz') or path.name.endswith('.tmp')) and str(path.relative_to(root)) not in committed:candidates.append(path)
 moved=[]
 if quarantine:
  if missing:raise ValueError('Committed shards are missing; preserve all artifacts for investigation')
  folder=root/'reports/orphan-shards';folder.mkdir(parents=True,exist_ok=True)
  for path in candidates:
   digest=sha(path);destination=folder/(uuid.uuid4().hex+'-'+path.name);old=str(path.relative_to(root));path.replace(destination);moved.append({'from':old,'to':str(destination.relative_to(root)),'sha256':digest})
 result={'checked_at':now(),'committed_shards':len(committed),'missing_committed_shards':missing,'orphan_candidates':[str(p.relative_to(root)) for p in candidates],'quarantined':moved,'raw_files_touched':False}
 atomic(root/'reports/r2-shard-reconciliation.json',result);return result
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--quarantine',action='store_true',help='Use only after all shard writers have stopped');a=p.parse_args();print(json.dumps(reconcile(ROOT,a.quarantine),indent=2))
