"""Separate local domains, legal replay, transposition links and provenance-preserving dedup."""
import shutil
import csv,gzip,hashlib,io,json,logging,sqlite3,time,zipfile,zlib
from pathlib import Path
import chess,chess.pgn
from acquire import ROOT,atomic,sha,now
logging.getLogger('chess.pgn').setLevel(logging.CRITICAL)
def key(value):return hashlib.sha256(json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def dbopen():
 db=sqlite3.connect(ROOT/'consolidated/domains.sqlite');db.execute('pragma journal_mode=WAL')
 db.executescript('''create table if not exists records(canonical_id text primary key,domain text not null,position_hash text,verification text,payload blob not null);
 create table if not exists sources(canonical_id text,source text,raw_path text,raw_sha256 text,member text,ordinal integer,original_metadata blob,unique(source,raw_sha256,member,ordinal));
 create table if not exists file_progress(raw_path text primary key,raw_sha256 text,processed integer,normalized integer,rejected integer,duplicates integer);
 create table if not exists files(raw_path text primary key,raw_sha256 text,records integer,normalized integer,rejected integer,duplicates integer,completed_at text);
 create table if not exists quarantine(raw_path text,member text,ordinal integer,reason text,raw blob);
 create index if not exists domain_position on records(domain,position_hash);''');return db

def streams(file):
 if file.suffix.lower()=='.zip':
  with zipfile.ZipFile(file) as z:
   for member in z.infolist():
    # No extraction path is trusted. Stream only supported data members.
    if Path(member.filename).suffix.lower() in ['.pgn','.csv','.epd','.fns','.json']:
     with z.open(member) as f,io.TextIOWrapper(f,encoding='utf-8-sig',errors='replace') as t:yield member.filename,t
 else:
  with file.open(encoding='utf-8-sig',errors='replace',newline='') as t:yield file.name,t

def pgn_record(text,fen=None):
 if fen:text='[SetUp "1"]\n[FEN "'+fen+'"]\n\n'+text
 game=chess.pgn.read_game(io.StringIO(text))
 if game is None or game.errors:raise ValueError('Malformed PGN or illegal moves')
 initial=game.board();board=initial.copy();moves=[]
 for move in game.mainline_moves():
  if move not in board.legal_moves:raise ValueError('Illegal mainline move')
  moves.append(move.uci());board.push(move)
 return game,initial,board,moves

def rows(source,file):
 for member,t in streams(file):
  ext=Path(member).suffix.lower()
  if ext=='.pgn':
   ordinal=0
   while True:
    game=chess.pgn.read_game(t)
    if game is None:break
    ordinal+=1
    yield member,ordinal,'games',{'pgn':game.accept(chess.pgn.StringExporter(headers=True,variations=True,comments=True)),'parse_errors':[str(e) for e in game.errors]}
  elif ext in ['.fns','.epd']:
   for ordinal,line in enumerate(t,1):
    if line.strip():yield member,ordinal,'training_positions',{'line':line.strip(),'format':ext}
  elif ext=='.tsv':
   for ordinal,row in enumerate(csv.DictReader(t,delimiter='\t'),1):yield member,ordinal,'openings',row
  elif ext=='.csv':
   reader=csv.DictReader(t)
   domain='openings' if source in ['maahi','planchetto'] else 'statistics' if source=='chessy' else 'similarity_labels' if source=='zenodo-similarity' else 'unmapped_csv'
   for ordinal,row in enumerate(reader,1):yield member,ordinal,domain,row
  elif ext=='.json' and source=='maahi':
   for ordinal,row in enumerate(json.load(t),1):yield member,ordinal,'openings',row

def normalize(domain,row,source):
 if domain=='openings':
  name=row.get('name') or row.get('name_en');pgn=row.get('pgn') or row.get('moves')
  if not name or not pgn:raise ValueError('Missing opening name or move path')
  game,initial,board,moves=pgn_record(pgn)
  if not moves:raise ValueError('Empty opening path')
  payload={'name':name,'family':name.split(':',1)[0],'eco':row.get('eco'),'moves':moves,'pgn':pgn,'final_fen':board.fen(),'original_metadata':row,'verification':'legal_move_validation','rights_review':'RIGHTS_REVIEW_PENDING'}
  return key([domain,name,row.get('eco'),moves]),key(board.fen(en_passant='legal').split()[:4]),payload
 if domain=='games':
  if row['parse_errors']:raise ValueError('; '.join(row['parse_errors']))
  game,initial,board,moves=pgn_record(row['pgn'])
  if not moves:raise ValueError('Empty game')
  variant=game.headers.get('Variant','Standard')
  # Variant games retain their own domain; they are never standard-puzzle candidates.
  metadata={k:game.headers.get(k) for k in ['Event','Site','Date','Round','White','Black','Result','Variant']}
  payload={'headers':dict(game.headers),'initial_fen':initial.fen(),'moves':moves,'pgn':row['pgn'],'variant':variant,'verification':'legal_move_validation','rights_review':'RIGHTS_REVIEW_PENDING'}
  return key([domain,metadata,initial.fen(),moves]),key(initial.fen().split()[:4]),payload
 if domain=='training_positions':
  if row['format']=='.fns':
   parts=row['line'].split('|');fen=parts[0];board=chess.Board(fen)
   if not board.is_valid():raise ValueError('Invalid FEN')
   label=parts[1] if len(parts)>1 else None;solution=parts[2] if len(parts)>2 else ''
   if solution:
    game,initial,end,moves=pgn_record(solution,fen)
   else:moves=[]
   payload={'original_fen':fen,'display_fen':board.fen(),'label':label,'source_solution_pgn':solution,'solution_lines':[moves] if moves else [],'original_metadata':row,'content_type':'training_position','verification':'legal_move_validation' if moves else 'position_valid_only','objective_verified':False,'rights_review':'RIGHTS_REVIEW_PENDING'}
  else:
   board=chess.Board();ops=board.set_epd(row['line'])
   if not board.is_valid():raise ValueError('Invalid EPD board')
   def clean(v):
    if isinstance(v,chess.Move):return v.uci()
    if isinstance(v,list):return [clean(x) for x in v]
    return v
   payload={'display_fen':board.fen(),'operations':{k:clean(v) for k,v in ops.items()},'original_metadata':row,'verification':'position_valid_only','objective_verified':False,'rights_review':'RIGHTS_REVIEW_PENDING'}
  return key([domain,payload.get('display_fen'),payload.get('solution_lines'),payload.get('operations'),payload.get('label')]),key(payload['display_fen'].split()[:4]),payload
 payload={'original_metadata':row,'verification':'not_applicable','rights_review':'RIGHTS_REVIEW_PENDING'}
 return key([domain,row]),None,payload

def run(sources=None):
 db=dbopen();start=time.monotonic();summary=[]
 for receipt in sorted((ROOT/'raw').rglob('*.receipt.json')):
  rec=json.loads(receipt.read_text())
  if rec.get('status')!='complete':continue
  file=ROOT/rec['path'];source=rec['source_id']
  if sources and source not in sources:continue
  if source in ['lichess-puzzles','chesscom-puzzles','stockfish-tests','hf-eval','hf-zero']:continue
  if file.suffix.lower() not in ['.pgn','.csv','.tsv','.json','.zip','.fns','.epd']:continue
  if source=='chessdb-china':continue # APIs retain native structure until a dedicated adapter maps them.
  digest=rec['sha256'];previous=db.execute('select raw_sha256 from files where raw_path=?',(rec['path'],)).fetchone()
  if previous:
   if previous[0]!=digest:raise ValueError('Raw input mutated: '+str(file))
   continue
  progress=db.execute('select raw_sha256,processed,normalized,rejected,duplicates from file_progress where raw_path=?',(rec['path'],)).fetchone()
  if progress and progress[0]!=digest:raise ValueError('Checkpoint snapshot changed')
  counts=list(progress[1:]) if progress else [0,0,0,0]
  skip=counts[0];seen=0
  try:
   db.execute('begin')
   for member,ordinal,domain,row in rows(source,file):
    seen+=1
    if seen<=skip:continue
    counts[0]+=1
    try:
     canonical,pos,payload=normalize(domain,row,source)
     created=db.execute('insert or ignore into records values(?,?,?,?,?)',(canonical,domain,pos,payload['verification'],zlib.compress(json.dumps(payload,ensure_ascii=False).encode(),3))).rowcount
     db.execute('insert into sources values(?,?,?,?,?,?,?)',(canonical,source,rec['path'],digest,member,ordinal,zlib.compress(json.dumps(row,ensure_ascii=False).encode(),3)))
     counts[1]+=1;counts[3]+=not bool(created)
    except (ValueError,KeyError,TypeError,chess.InvalidMoveError,chess.IllegalMoveError,chess.AmbiguousMoveError) as e:
     counts[2]+=1;db.execute('insert into quarantine values(?,?,?,?,?)',(rec['path'],member,ordinal,str(e),zlib.compress(json.dumps(row).encode())))
    if counts[0]%1000==0:
     if shutil.disk_usage(ROOT).free<900*1024**2:raise RuntimeError('STORAGE_FLOOR: more disk required; committed batches preserved')
     db.execute('insert or replace into file_progress values(?,?,?,?,?,?)',(rec['path'],digest,*counts));db.commit()
     atomic(ROOT/'checkpoints/domains.json',{'file':rec['path'],'processed':counts[0],'normalized':counts[1],'quarantined':counts[2],'duplicates':counts[3],'updated_at':now()})
     db.execute('begin')
   db.execute('insert or replace into file_progress values(?,?,?,?,?,?)',(rec['path'],digest,*counts))
   db.execute('insert into files values(?,?,?,?,?,?,?)',(rec['path'],digest,*counts,now()));db.commit()
   print(source,file.name,counts,flush=True)
  except BaseException:db.rollback();raise
  summary.append({'file':rec['path'],'discovered':counts[0],'normalized':counts[1],'quarantined':counts[2],'duplicate_records':counts[3]})
  atomic(ROOT/'checkpoints/domains.json',{'updated_at':now(),'last_completed_file':rec['path'],'seconds_this_run':round(time.monotonic()-start,2)})
 stats={d:n for d,n in db.execute('select domain,count(*) from records group by domain')}
 trans=db.execute("select count(*) from (select position_hash from records where domain='openings' group by position_hash having count(*)>1)").fetchone()[0]
 atomic(ROOT/'reports/domains.json',{'unique_records_by_domain':stats,'opening_transposition_groups':trans,'source_files':db.execute('select count(*) from files').fetchone()[0],'source_records':db.execute('select coalesce(sum(records),0) from files').fetchone()[0],'normalized_source_records':db.execute('select coalesce(sum(normalized),0) from files').fetchone()[0],'quarantined':db.execute('select count(*) from quarantine').fetchone()[0],'duplicate_records':db.execute('select coalesce(sum(duplicates),0) from files').fetchone()[0],'generated_at':now()})
 db.execute('pragma wal_checkpoint(TRUNCATE)');db.close()
if __name__=='__main__':
 import argparse
 parser=argparse.ArgumentParser();parser.add_argument('--sources',nargs='*');args=parser.parse_args();run(args.sources)
