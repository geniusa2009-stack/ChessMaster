"""Checkpointed local puzzle normalization; immutable gzip batches plus SQLite hash index.
No source ratings are recast as measured difficulty. No engine verification is implied.
"""
import fcntl
import argparse,csv,gzip,hashlib,io,json,os,re,shutil,sqlite3,sys,time,zipfile
from pathlib import Path
import chess,zstandard
from acquire import ROOT,atomic,sha,now

def connect():
 p=ROOT/'consolidated/index.sqlite';p.parent.mkdir(exist_ok=True)
 db=sqlite3.connect(p);db.execute('pragma journal_mode=WAL');db.execute('pragma synchronous=FULL');db.execute('pragma cache_size=-262144')
 db.executescript('''create table if not exists tasks(id integer primary key, task_hash blob unique not null,position_hash blob not null,source text not null,source_id text not null,shard text not null,ordinal integer not null,verification text not null default 'legal_pending');
 create table if not exists batches(source text not null,snapshot text not null,batch integer not null,processed integer not null,unique_count integer not null,duplicates integer not null,rejected integer not null,shard text not null,primary key(source,snapshot,batch));
 create table if not exists aliases(task_hash blob not null,source text not null,source_id text not null,shard text not null,ordinal integer not null);''')
 return db

def source_rows(file,kind):
 if kind=='lichess':
  with file.open('rb') as f,zstandard.ZstdDecompressor().stream_reader(f) as z,io.TextIOWrapper(z) as t:
   yield from csv.DictReader(t)
 elif kind=='chesscom':
  with zipfile.ZipFile(file) as z:
   for name in z.namelist():
    if name.lower().endswith('.csv'):
     with z.open(name) as f,io.TextIOWrapper(f,encoding='utf-8-sig',newline='') as t:yield from csv.DictReader(t)

def lichess(row):
 if not re.fullmatch(r'[A-Za-z0-9]{5}',row.get('PuzzleId','')):raise ValueError('Invalid source ID')
 board=chess.Board(row['FEN'])
 if not board.is_valid():raise ValueError('Invalid board state')
 moves=row['Moves'].split()
 if len(moves)<2 or any(not re.fullmatch('[a-h][1-8][a-h][1-8][qrbn]?',m) for m in moves):raise ValueError('Malformed source line')
 board.push_uci(moves[0]) # Lichess FEN precedes the opponent setup move.
 display=board.fen(en_passant='legal')
 return dict(source_id=row['PuzzleId'],original_fen=row['FEN'],display_fen=display,
   setup_move=moves[0],solution_lines=[moves[1:]],accepted_moves=[],original_rating=int(row['Rating']),
   rating_deviation=int(row['RatingDeviation']),popularity=int(row['Popularity']),
   themes=row['Themes'].split(),opening_tags=row.get('OpeningTags','').split(),game_reference=row['GameUrl'],
   content_type='practical_tactical_puzzle',verification_status='legal_pending',
   verification_metadata={'setup_move_legally_replayed':True,'remaining_solution_verified':False},original_metadata=row)

def run(file,kind,source,batch_size=10000):
 folder=ROOT/'checkpoints/normalization-locks';folder.mkdir(parents=True,exist_ok=True)
 identity=hashlib.sha256(('r1|'+source+'|'+kind).encode()).hexdigest()
 with (folder/'maintenance.lock').open('a') as maintenance:
  fcntl.flock(maintenance,fcntl.LOCK_SH|fcntl.LOCK_NB)
  with (folder/(identity+'.lock')).open('a') as lock:
   try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
   except BlockingIOError:raise RuntimeError('R1 source normalization is already claimed')
   return _run_claimed(file,kind,source,batch_size)

def _run_claimed(file,kind,source,batch_size=10000):
 if kind!='lichess':raise NotImplementedError('No adapter available; source records are not quarantined for an unsupported format')
 started=time.monotonic();snapshot=sha(file);db=connect()
 batches=db.execute('select batch,processed,unique_count,duplicates,rejected,shard from batches where source=? and snapshot=? order by batch',(source,snapshot)).fetchall()
 # Verify all committed batch files exist before trusting checkpoints.
 for b in batches:
  if not (ROOT/b[5]).exists():raise RuntimeError('Missing committed batch '+b[5])
 skip=sum(b[1] for b in batches);batch_number=len(batches)
 folder=ROOT/'normalized'/source/snapshot[:16];folder.mkdir(parents=True,exist_ok=True)
 pending=[];seen=0
 def commit(rows,batch_number):
  if shutil.disk_usage(ROOT).free<1100*1024**2:raise RuntimeError('STORAGE_FLOOR: preserve raw files and checkpoints; more disk required')
  final=folder/f'{batch_number:06}.jsonl.gz';temp=final.with_suffix('.tmp')
  relative=str(final.relative_to(ROOT));unique=duplicates=rejected=0
  db.execute('begin immediate')
  try:
   with gzip.open(temp,'wt',encoding='utf8',compresslevel=3) as out:
    for ordinal,row in enumerate(rows):
     try:
      if kind!='lichess':raise ValueError('Adapter not implemented for '+kind)
      record=lichess(row)
      pos=hashlib.sha256(' '.join(record['display_fen'].split()[:4]).encode()).digest()
      task=hashlib.sha256(pos+json.dumps(record['solution_lines'],separators=(',',':')).encode()).digest()
      record.update(canonical_id=task.hex(),position_hash=pos.hex(),solution_hash=hashlib.sha256(json.dumps(record['solution_lines']).encode()).hexdigest(),source_name=source,source_snapshot=snapshot,raw_file_sha256=snapshot,raw_file=str(file),source_record_ordinal=seen-len(rows)+ordinal+1,rights_review='RIGHTS_REVIEW_PENDING')
      changed=db.execute('insert or ignore into tasks(task_hash,position_hash,source,source_id,shard,ordinal) values(?,?,?,?,?,?)',(task,pos,source,record['source_id'],relative,ordinal)).rowcount
      if changed:unique+=1
      else:
       duplicates+=1;db.execute('insert into aliases values(?,?,?,?,?)',(task,source,record['source_id'],relative,ordinal))
      record['exact_duplicate']=not bool(changed)
     except (ValueError,KeyError,TypeError) as e:
      rejected+=1;record={'quarantined':True,'reason':str(e),'original_metadata':row,'source':source,'source_snapshot':snapshot}
     out.write(json.dumps(record,ensure_ascii=False,separators=(',',':'))+'\n')
   with temp.open('rb') as f:os.fsync(f.fileno())
   temp.replace(final) # crash before DB commit is safe: next run overwrites this orphan batch.
   db.execute('insert into batches values(?,?,?,?,?,?,?,?)',(source,snapshot,batch_number,len(rows),unique,duplicates,rejected,relative))
   db.commit()
  except BaseException:db.rollback();raise
  summary=db.execute('select sum(processed),sum(unique_count),sum(duplicates),sum(rejected) from batches where source=? and snapshot=?',(source,snapshot)).fetchone()
  atomic(ROOT/'checkpoints'/f'{source}.json',{'source':source,'snapshot':snapshot,'processed':summary[0],'unique':summary[1],'duplicates':summary[2],'quarantined':summary[3],'last_batch':batch_number,'updated_at':now(),'verification':'legal_pending','elapsed_this_run_seconds':round(time.monotonic()-started,2)})
  if batch_number%10==0:print(source,summary,'seconds',round(time.monotonic()-started,1),flush=True)
 try:
  for row in source_rows(file,kind):
   seen+=1
   if seen<=skip:continue
   pending.append(row)
   if len(pending)>=batch_size:commit(pending,batch_number);pending=[];batch_number+=1
  if pending:commit(pending,batch_number)
  atomic(ROOT/'reports'/f'{source}-normalization.json',{'source':source,'snapshot':snapshot,'complete':False,'source_rows_complete':True,'position_index_complete':False,'source_records_seen':seen,'checkpoint':json.loads((ROOT/'checkpoints'/f'{source}.json').read_text())})
  # Costly indexes built only after all batches, not per individual insertion.
  if not db.execute("select 1 from sqlite_master where type='index' and name='task_position'").fetchone():
   indexed_rows=db.execute('select coalesce(sum(unique_count),0) from batches').fetchone()[0]
   # Reserve both the final B-tree and its temporary sort, plus existing floor.
   required=1100*1024**2+indexed_rows*100+32*1024**2
   if shutil.disk_usage(ROOT).free<required:raise RuntimeError('STORAGE_FLOOR: all source rows checkpointed; position index needs additional final/sort headroom: '+str(required))
  db.execute('create index if not exists task_position on tasks(position_hash)');db.commit()
  atomic(ROOT/'reports'/f'{source}-normalization.json',{'source':source,'snapshot':snapshot,'complete':True,'source_rows_complete':True,'position_index_complete':True,'source_records_seen':seen,'seconds_this_run':round(time.monotonic()-started,2),'checkpoint':json.loads((ROOT/'checkpoints'/f'{source}.json').read_text())})
 finally:db.execute('pragma wal_checkpoint(TRUNCATE)');db.close()
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--file',type=Path,required=True);p.add_argument('--kind',choices=['lichess'],required=True);p.add_argument('--source',required=True);a=p.parse_args();run(a.file,a.kind,a.source)
