"""Additive, bounded, provenance-preserving adapters. Never mutates R1 databases.
Raw snapshots remain authoritative. Analysis variations are not accepted solutions.
"""
import bz2,resource,fcntl
import argparse,csv,gzip,hashlib,io,json,logging,shutil,sqlite3,time,zipfile,zlib
from contextlib import contextmanager
from pathlib import Path
import chess,chess.pgn,ijson,zstandard
from acquire import ROOT,atomic,now
logging.getLogger('chess.pgn').setLevel(logging.CRITICAL)
csv.field_size_limit(16*1024*1024)
VERSION='r2.2'
RESERVE=1200*1024**2
class UnsupportedFormat(ValueError):pass

def digest(value):return hashlib.sha256(json.dumps(value,sort_keys=True,ensure_ascii=False,separators=(',',':'),default=str).encode('utf-8',errors='surrogatepass')).hexdigest()
def pack(value):return zlib.compress(json.dumps(value,ensure_ascii=True,separators=(',',':'),default=str).encode(),3)
def unpack(value):return json.loads(zlib.decompress(value))
def connection(root=ROOT):
 p=root/'consolidated/r2.sqlite';p.parent.mkdir(parents=True,exist_ok=True)
 db=sqlite3.connect(p,timeout=30);db.execute('pragma journal_mode=WAL');db.execute('pragma synchronous=FULL');db.execute('pragma cache_size=-16384');db.execute('pragma temp_store=FILE')
 db.executescript('''
 CREATE TABLE IF NOT EXISTS entities(id TEXT PRIMARY KEY,domain TEXT NOT NULL,state_hash TEXT,position_hash TEXT,board_hash TEXT,solution_hash TEXT,objective TEXT NOT NULL,status TEXT NOT NULL,payload BLOB NOT NULL);
 CREATE TABLE IF NOT EXISTS provenance(source TEXT,snapshot TEXT,member TEXT,ordinal INTEGER,source_id TEXT,entity_id TEXT NOT NULL,raw_path TEXT NOT NULL,original BLOB NOT NULL,PRIMARY KEY(source,snapshot,member,ordinal));
 CREATE INDEX IF NOT EXISTS provenance_entity ON provenance(entity_id);
 CREATE TABLE IF NOT EXISTS normalization_outputs(source TEXT,snapshot TEXT,member TEXT,ordinal INTEGER,adapter TEXT,entity_id TEXT,PRIMARY KEY(source,snapshot,member,ordinal,adapter));
 CREATE INDEX IF NOT EXISTS entity_position ON entities(position_hash,domain);
 CREATE INDEX IF NOT EXISTS entity_domain ON entities(domain,id);
 CREATE INDEX IF NOT EXISTS normalization_active ON normalization_outputs(adapter,entity_id);
 CREATE INDEX IF NOT EXISTS entity_board ON entities(board_hash,domain);
 CREATE TABLE IF NOT EXISTS progress(raw_path TEXT,snapshot TEXT,adapter TEXT,processed INTEGER,accepted INTEGER,rejected INTEGER,duplicates INTEGER,complete INTEGER,updated_at TEXT,PRIMARY KEY(raw_path,snapshot,adapter));
 CREATE TABLE IF NOT EXISTS rejected(raw_path TEXT,snapshot TEXT,member TEXT,ordinal INTEGER,reason TEXT,original BLOB,PRIMARY KEY(raw_path,snapshot,member,ordinal));
 CREATE TABLE IF NOT EXISTS issues(raw_path TEXT,snapshot TEXT,kind TEXT,detail TEXT,PRIMARY KEY(raw_path,snapshot,kind));
 CREATE TABLE IF NOT EXISTS relations(relation TEXT,group_id TEXT,entity_id TEXT,PRIMARY KEY(relation,group_id,entity_id));
 CREATE INDEX IF NOT EXISTS relation_entity ON relations(entity_id,relation);
 ''');return db

@contextmanager
def open_text(path):
 errors='surrogateescape' if '.pgn' in path.name.lower() else 'strict'
 if path.name.lower().endswith('.bz2'):
  with bz2.open(path,'rt',encoding='utf-8-sig',errors=errors,newline='') as f:yield f
 elif path.name.lower().endswith('.gz'):
  with gzip.open(path,'rt',encoding='utf-8-sig',errors=errors,newline='') as f:yield f
 elif path.name.lower().endswith('.zst'):
  with path.open('rb') as f,zstandard.ZstdDecompressor().stream_reader(f) as z,io.TextIOWrapper(z,encoding='utf-8-sig',errors=errors,newline='') as t:yield t
 else:
  with path.open(encoding='utf-8-sig',errors=errors,newline='') as f:yield f

def parse_rows(f,name,source):
 logical=name
 for compression in ['.gz','.zst','.bz2']:
  if logical.lower().endswith(compression):logical=logical[:-len(compression)]
 suffix=Path(logical).suffix.lower()
 if suffix in ['.csv','.tsv']:
  for n,row in enumerate(csv.DictReader(f,delimiter='\t' if suffix=='.tsv' else ','),1):yield name,n,row
 elif suffix=='.json':
  first=''
  while not first:
   c=f.read(1)
   if not c:return
   if not c.isspace():first=c
  # ijson supports a streaming reader; no complete JSON document is loaded.
  class PrefixReader:
   def __init__(self):self.prefix=first
   def read(self,size=-1):
    if size==0:return b''
    if self.prefix:
     p=self.prefix;self.prefix='';return (p+f.read(-1 if size<0 else max(0,size-len(p)))).encode('utf-8')
    return f.read(size).encode('utf-8')
  stream=PrefixReader()
  if first=='[':
   iterator=ijson.items(stream,'item',use_float=True)
  elif source=='chesscom-puzzles':
   iterator=(dict(row,source_object_key=k) for k,row in ijson.kvitems(stream,'',use_float=True))
  elif source=='chessdb-brilliancies':iterator=(row for _,row in ijson.kvitems(stream,'items',use_float=True))
  elif source=='arcade':iterator=ijson.items(stream,'problems.item',use_float=True)
  elif source=='chessdb-china' and 'brilliancies' in name:iterator=ijson.items(stream,'items.item',use_float=True)
  else:raise UnsupportedFormat('JSON envelope requires a source-specific adapter: '+source+'/'+name)
  count=0
  for count,row in enumerate(iterator,1):yield name,count,row
  if first=='{' and not count:raise UnsupportedFormat('Expected JSON envelope is missing or empty: '+source+'/'+name)
 elif suffix in ['.fns','.epd']:
  for n,line in enumerate(f,1):
   if line.strip():yield name,n,{'line':line.rstrip('\r\n'),'format':suffix}
 elif suffix=='.pgn':
  n=0
  while True:
   game=chess.pgn.read_game(f)
   if game is None:break
   n+=1
   yield name,n,{'pgn':game.accept(chess.pgn.StringExporter(headers=True,comments=True,variations=True)),'parse_errors':[str(e) for e in game.errors]}
 else:raise UnsupportedFormat('Unsupported archive member: '+name)

def rows(path,source):
 if path.suffix.lower()=='.zip':
  with zipfile.ZipFile(path) as z:
   supported=False
   for entry in z.infolist():
    if entry.is_dir():continue
    if Path(entry.filename).suffix.lower() not in ['.csv','.tsv','.json','.pgn','.epd','.fns']:
     if not entry.filename.lower().endswith(('.txt','.md','.html')):raise UnsupportedFormat('Unsupported ZIP member: '+entry.filename)
     continue
    supported=True
    with z.open(entry) as f,io.TextIOWrapper(f,encoding='utf-8-sig',errors='surrogateescape' if entry.filename.lower().endswith('.pgn') else 'strict',newline='') as t:yield from parse_rows(t,entry.filename,source)
   if not supported:raise UnsupportedFormat('ZIP has no supported data members')
 else:
  logical=path.name.lower()
  for compression in ['.gz','.zst','.bz2']:
   if logical.endswith(compression):logical=logical[:-len(compression)]
  if Path(logical).suffix not in ['.csv','.tsv','.json','.pgn','.fns','.epd']:
   raise UnsupportedFormat('Native/binary format requires its dedicated adapter: '+path.name+'; evaluation Parquet uses evaluation_view.py')
  with open_text(path) as f:yield from parse_rows(f,path.name,source)

def position(fen,chess960=False):
 b=chess.Board(fen,chess960=chess960)
 if not b.is_valid():raise ValueError('Invalid legal board state')
 return b

def replay(board,moves):
 b=board.copy()
 for move in moves:
  m=chess.Move.from_uci(move)
  if m not in b.legal_moves:raise ValueError('Illegal solution move: '+move)
  b.push(m)
 return b

def normalized(source,row,member):
 domain=None;board=None;lines=[];objective='unspecified';context=source
 if source=='chesscom-puzzles':
  game=chess.pgn.read_game(io.StringIO(row.get('pgn','')))
  if game is None or game.errors:raise ValueError('Missing or invalid source PGN')
  board=position(row['initialFen']);moves=list(game.mainline_moves())
  if game.board().fen()!=board.fen():raise ValueError('PGN setup disagrees with initialFen')
  user=row.get('colorOfUser')
  if user not in ['white','black']:raise ValueError('Unknown puzzle player side')
  setup=None
  if board.turn!=(user=='white'):
   if not moves:raise ValueError('Missing setup move')
   setup=moves.pop(0).uci();replay(board,[setup]);board.push_uci(setup)
  tactic=game.headers.get('Tactic_line')
  b=board.copy();line=[]
  for san in (tactic or '').split():
   m=b.parse_san(san);line.append(m.uci());b.push(m)
  if [m.uci() for m in moves][:len(line)]!=line:raise ValueError('Tactic_line differs from mainline continuation')
  domain='puzzles';lines=[line] if line else [];payload={'setup_move':setup,'initial_fen':row['initialFen'],'source_pgn':row['pgn'],'source_rating':row.get('rating'),'source_side':user,'missing_solution':not bool(line),'analysis_variations_status':'source_analysis_not_accepted_solutions'}
 elif source in ['maahi','planchetto','lichess-openings'] or Path(member).suffix=='.tsv':
  text=row.get('moves') or row.get('pgn');name=row.get('name') or row.get('name_en')
  if not text or not name:raise ValueError('Missing opening path or name')
  game=chess.pgn.read_game(io.StringIO(text))
  if game is None or game.errors:raise ValueError('Malformed opening PGN')
  initial=game.board()
  board=initial.copy();line=[];sans=[]
  for move in game.mainline_moves():sans.append(board.san(move));line.append(move.uci());board.push(move)
  if not line:raise ValueError('Empty opening path')
  domain='openings';lines=[line];objective='opening_path';context=[name,row.get('eco')]
  payload={'name':name,'eco':row.get('eco'),'family':name.split(':',1)[0],'variation':name.split(':',1)[1].strip() if ':' in name else None,'initial_fen':initial.fen(),'final_fen':board.fen(),'uci':line,'san':sans,'pgn':text,'subvariation':row.get('subvariation'),'source_metadata':row}
 elif source=='chessy':
  # Acquired Chessy tables are aggregate statistics, not puzzles. Never invent FENs.
  domain='statistics';payload={'source_table':member,'source_metadata':row};objective='statistical_observation';context=member
 elif source in ['arcade','chessdb-brilliancies','chessdb-china']:
  fen=row.get('fen') if source=='arcade' else row.get('position',{}).get('fenBefore')
  if not fen:raise ValueError('Source record has no diagram')
  # Composition diagrams can be non-orthodox: preserve syntax and stipulation without rejecting their genre.
  board=chess.Board(fen)
  genre=row.get('genre','brilliancy');domain='endgame_studies' if genre=='study' else 'compositions' if source=='arcade' else 'brilliancies'
  objective=row.get('stipulation') or 'unspecified';context=[source,str(row.get('id')),genre,objective]
  payload={'genre':genre,'stipulation':row.get('stipulation'),'authors':row.get('authors'),'publication':{k:row.get(k) for k in ['sourceName','sourceYear','award']},'solution_text':row.get('solutionText'),'missing_solution':not bool(row.get('solutionText')),'source_verification':row.get('verification'),'original_metadata':row,'orthodox_position_valid':board.is_valid(),'specialized_verification':'pending','source_continuation_uci':row.get('actualContinuationUci'),'source_analysis_lines':row.get('analysisLines')}
 elif row.get('format') in ['.fns','.epd']:
  if row['format']=='.fns':
   parts=row['line'].split('|');board=position(parts[0]);solution=parts[2] if len(parts)>2 else ''
   if solution:
    game=chess.pgn.read_game(io.StringIO('[SetUp "1"]\n[FEN "'+board.fen()+'"]\n\n'+solution))
    if game is None or game.errors:raise ValueError('Invalid FNS solution')
    lines=[[m.uci() for m in game.mainline_moves()]]
   payload={'label':parts[1] if len(parts)>1 else None,'solution_text':solution};objective='source_stipulation:'+payload['label'] if payload['label'] else 'unspecified'
  else:
   board=chess.Board();ops=board.set_epd(row['line']);position(board.fen())
   def clean(v):
    if isinstance(v,chess.Move):return v.uci()
    if isinstance(v,list):return [clean(x) for x in v]
    return v
   payload={'operations':{k:clean(v) for k,v in ops.items()}}
   # bm is a list of alternative first moves, never a sequential line.
   objective='epd_operations';payload['missing_solution']=True
  domain='training_positions'
 elif 'pgn' in row:
  if row.get('parse_errors'):raise ValueError('PGN parser errors')
  game=chess.pgn.read_game(io.StringIO(row['pgn']))
  if game is None or game.errors:raise ValueError('Invalid PGN')
  initial=game.board()
  board=initial.copy();line=[]
  for move in game.mainline_moves():
   if move not in board.legal_moves:raise ValueError('Illegal game move')
   line.append(move.uci());board.push(move)
  if not line:raise ValueError('Empty game')
  domain='games';lines=[line];objective='game_record'
  headers=dict(game.headers);variant=headers.get('Variant','Standard');context=[variant,{k:headers.get(k) for k in ['Event','Site','Date','Round','White','Black','Result']},initial.fen()]
  payload={'headers':headers,'initial_fen':initial.fen(),'final_fen':board.fen(),'moves':line,'variant':variant,'pgn':row['pgn'],'text_decoding':'utf-8-surrogateescape; raw snapshot is authoritative'}
 else:raise UnsupportedFormat('No semantic adapter: '+source+'/'+member)
 status='source_only' if domain in ['compositions','endgame_studies','brilliancies'] else 'legal_line_verified' if board and lines else 'position_valid' if board else 'source_only'
 if board:
  for line in lines:
   if domain not in ['games','openings']:replay(board,line)
  fen=board.fen(en_passant='legal');state_hash=digest([board.uci_variant,board.chess960,fen]);position_hash=digest([board.uci_variant,board.chess960,fen.split()[:4]]);board_hash=digest([board.uci_variant,fen.split()[:2]])
 else:fen=state_hash=position_hash=board_hash=None
 payload.update(display_fen=fen,solution_lines=lines if domain not in ['games','openings'] else [],verification_status=status,objective_verified=False,rights_review='RIGHTS_REVIEW_PENDING',adapter_version=VERSION)
 solution_hash=digest(lines) if lines else None
 # Unknown tactical purpose is kept source-scoped. Position groups are candidate links, not educational equivalence.
 entity=digest([domain,state_hash,solution_hash,objective,context,payload if not board else None])
 return entity,domain,state_hash,position_hash,board_hash,solution_hash,objective,status,payload

def import_file(db,root,receipt,limit=0,seconds=0):
 locks=root/'checkpoints/normalization-locks';locks.mkdir(parents=True,exist_ok=True)
 lock_id=digest([receipt['path'],VERSION])
 with (locks/(lock_id+'.lock')).open('a') as lock:
  try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  except BlockingIOError:return {'state':'already_claimed'}
  return _import_file_claimed(db,root,receipt,limit,seconds)

def _import_file_claimed(db,root,receipt,limit=0,seconds=0):
 path=root/receipt['path'];snapshot=receipt['sha256'];source=receipt['source_id'];start=time.monotonic()
 database_path=Path(db.execute('pragma database_list').fetchone()[2])
 def disk_bytes():return sum(p.stat().st_size for p in [database_path,Path(str(database_path)+'-wal')] if p.exists())
 bytes_before=disk_bytes()
 old=db.execute('select processed,accepted,rejected,duplicates,complete from progress where raw_path=? and snapshot=? and adapter=?',(receipt['path'],snapshot,VERSION)).fetchone()
 if old and old[4]:return {'state':'already_complete'}
 if not path.exists() or path.stat().st_size!=receipt['bytes']:raise ValueError('Receipt size mismatch: '+receipt['path'])
 from acquire import sha
 if sha(path)!=snapshot:raise ValueError('Raw digest changed: '+receipt['path'])
 # Refuse a source whose immutable digest changes across checkpoints.
 previous=db.execute('select snapshot from progress where raw_path=? and snapshot<>?',(receipt['path'],snapshot)).fetchone()
 if previous:raise ValueError('Snapshot changed at existing path; preserve and inspect')
 counts=list(old[:4]) if old else [0,0,0,0];skip=counts[0];processed_now=0;complete=False
 def checkpoint():
  db.execute('insert or replace into progress values(?,?,?,?,?,?,?,?,?)',(receipt['path'],snapshot,VERSION,*counts,int(complete),now()));db.commit()
 try:
  db.execute('begin immediate')
  for seen,(member,ordinal,row) in enumerate(rows(path,source),1):
   if seen<=skip:continue
   if (limit and processed_now>=limit) or (seconds and time.monotonic()-start>=seconds):break
   if processed_now%100==0 and shutil.disk_usage(root).free<RESERVE+8*1024**2:
    checkpoint();return {'state':'blocked_storage','counts':counts,'processed_this_run':processed_now,'seconds':round(time.monotonic()-start,3),'database_growth_bytes':disk_bytes()-bytes_before,'peak_rss_bytes':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss}
   try:
    result=normalized(source,row,member);entity,*values,payload=result
    inserted=db.execute('insert or ignore into entities values(?,?,?,?,?,?,?,?,?)',(entity,*values,pack(payload))).rowcount
    db.execute('insert or ignore into provenance values(?,?,?,?,?,?,?,?)',(source,snapshot,member,ordinal,str(row.get('id',row.get('source_object_key',ordinal))),entity,receipt['path'],pack(row)))
    db.execute('insert or ignore into normalization_outputs values(?,?,?,?,?,?)',(source,snapshot,member,ordinal,VERSION,entity))
    counts[1]+=1;counts[3]+=not bool(inserted)
   except UnsupportedFormat:raise
   except (ValueError,KeyError,TypeError,IndexError) as exc:
    db.execute('insert or ignore into rejected values(?,?,?,?,?,?)',(receipt['path'],snapshot,member,ordinal,str(exc),pack(row)));counts[2]+=1
   counts[0]+=1;processed_now+=1
   if processed_now%100==0:checkpoint();db.execute('begin immediate')
  else:complete=True
  checkpoint()
 except UnsupportedFormat as exc:
  # An unsupported envelope is a visible issue, never a false completed file.
  checkpoint();db.execute('insert or replace into issues values(?,?,?,?)',(receipt['path'],snapshot,'unsupported_format',str(exc)));db.commit()
  return {'state':'unsupported_format','detail':str(exc),'counts':counts}
 except BaseException:db.rollback();raise
 return {'state':'complete' if complete else 'partial','counts':counts,'processed_this_run':processed_now,'seconds':round(time.monotonic()-start,3),'database_growth_bytes':disk_bytes()-bytes_before,'peak_rss_bytes':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss}

def build_relations(db):
 # Indexed SQL groups avoid pairwise expansion. These are candidates, not proofs of equivalence.
 db.execute('begin immediate')
 for relation,column,where in [('same_game_position','position_hash',"domain='games'"),('transposition_group','position_hash',"domain='openings'"),('similar_position_group','board_hash',"domain in ('puzzles','training_positions')")]:
  db.execute(f'''insert or ignore into relations select ?,e.{column},e.id from entities e join (select {column} k from entities where {where} and {column} is not null group by {column} having count(*)>1) g on e.{column}=g.k where {where}''',(relation,))
 db.commit()

def main():
 locks=ROOT/'checkpoints/normalization-locks';locks.mkdir(parents=True,exist_ok=True)
 with (locks/'r2-maintenance.lock').open('a') as maintenance:
  fcntl.flock(maintenance,fcntl.LOCK_SH)
  return _main_claimed()

def _main_claimed():
 p=argparse.ArgumentParser();p.add_argument('--sources',nargs='+',required=True);p.add_argument('--paths',nargs='*',help='Select whole acquired files, e.g. the latest snapshot, without record sampling');p.add_argument('--limit',type=int,default=0,help='Optional benchmark limit; default drains work to the storage guard');p.add_argument('--seconds',type=float,default=0,help='Optional benchmark duration; 0 has no time cap');a=p.parse_args()
 audit=json.loads((ROOT/'reports/r2-audit.json').read_text())
 verified={x['path']:x for x in audit['receipts'] if x.get('sha256_matches') and x.get('size_matches')}
 db=connection();runs=[]
 try:
  receipts=[json.loads(p.read_text()) for p in (ROOT/'raw').rglob('*.receipt.json')]
  # Complete small snapshots first, leaving large archives at durable checkpoints.
  for r in sorted(receipts,key=lambda r:(r.get('bytes') or 0,r['path'])):
   if r.get('status')!='complete' or r['source_id'] not in a.sources:continue
   if a.paths and r['path'] not in a.paths:continue
   # Existing audit is the baseline; newly acquired files are SHA-256 checked in import_file.
   result=import_file(db,ROOT,r,a.limit,a.seconds);runs.append(dict(path=r['path'],**result))
   with (ROOT/'reports/r2-import-history.jsonl').open('a') as history:history.write(json.dumps({'at':now(),'source':r['source_id'],'snapshot':r['sha256'],'adapter':VERSION,'path':r['path'],**result})+'\n')
   print(r['path'],result,flush=True)
   if result['state']=='blocked_storage':break
  build_relations(db)
  report={'rights_review':'RIGHTS_REVIEW_PENDING','generated_at':now(),'runs':runs,'domains':dict(db.execute('select domain,count(*) from entities group by domain')),'provenance':db.execute('select count(*) from provenance').fetchone()[0],'quarantined':db.execute('select count(*) from rejected').fetchone()[0],'relation_groups':[list(x) for x in db.execute('select relation,count(distinct group_id),count(*) from relations group by relation')],'limitations':['R2 is additive; R1 counts must not be added to R2 counts as globally unique.','Similarity groups are exact board/turn candidates with state differences; they are not educational equivalence.','Objective proofs and equivalent_solution_group require a separate verifier.']}
  atomic(ROOT/'reports/r2-normalization.json',report)
 finally:db.execute('pragma wal_checkpoint(TRUNCATE)');db.close()
if __name__=='__main__':main()
