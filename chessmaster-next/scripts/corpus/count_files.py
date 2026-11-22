"""Count raw records by parsing files; advertised webpage totals never become acquired totals."""
import bz2,csv,gzip,io,json,re,time,zipfile
from pathlib import Path
import chess.pgn,ijson,zstandard,duckdb
from acquire import ROOT,atomic,now

def count_text(stream,extension,source):
 if extension=='.pgn':
  n=0
  while chess.pgn.read_headers(stream) is not None:n+=1
  return n,'games'
 if extension in ['.csv','.tsv']:
  reader=csv.reader(stream,delimiter='\t' if extension=='.tsv' else ',');next(reader,None)
  return sum(1 for _ in reader),'openings' if source in ['lichess-openings','maahi','planchetto'] else 'statistics' if source=='chessy' else 'similarity_labels' if source=='zenodo-similarity' else 'csv_rows'
 if extension in ['.epd','.fns']:return sum(bool(line.strip()) for line in stream),'training_positions'
 return None,None

def run():
 root=ROOT/'reports/file-counts';root.mkdir(parents=True,exist_ok=True)
 for receipt in sorted((ROOT/'raw').rglob('*.receipt.json')):
  d=json.loads(receipt.read_text())
  if d.get('status')!='complete':continue
  file=ROOT/d['path'];source=d['source_id'];report=root/(d['sha256']+'.json')
  # Content-identical files share a count but do not lose source receipts.
  if report.exists():continue
  rows=[];started=time.monotonic()
  try:
   ext=file.suffix.lower()
   if ext=='.zip':
    with zipfile.ZipFile(file) as archive:
     for member in archive.infolist():
      e=Path(member.filename).suffix.lower()
      if e in ['.pgn','.csv','.tsv','.epd','.fns']:
       with archive.open(member) as f,io.TextIOWrapper(f,encoding='utf-8-sig',errors='replace') as t:n,domain=count_text(t,e,source)
       rows.append({'member':member.filename,'uncompressed_bytes':member.file_size,'records':n,'domain':domain})
      elif e=='.json' and source=='chesscom-puzzles':
       with archive.open(member) as f:n=sum(1 for _ in ijson.kvitems(f,''))
       rows.append({'member':member.filename,'uncompressed_bytes':member.file_size,'records':n,'domain':'puzzles'})
   elif ext=='.zst':
    with file.open('rb') as f,zstandard.ZstdDecompressor().stream_reader(f) as z,io.TextIOWrapper(z,encoding='utf-8-sig',errors='replace') as t:n,domain=count_text(t,'.csv' if source=='lichess-puzzles' else '.pgn',source)
    if source=='lichess-puzzles':domain='puzzles'
    rows.append({'records':n,'domain':domain})
   elif ext=='.bz2':
    with bz2.open(file,'rt',encoding='utf8',errors='replace') as t:n,domain=count_text(t,'.pgn',source)
    rows.append({'records':n,'domain':domain})
   elif ext=='.parquet':
    db=duckdb.connect();n=db.execute('select count(*) from read_parquet(?)',[str(file)]).fetchone()[0];schema=db.execute('describe select * from read_parquet(?)',[str(file)]).fetchall();db.close()
    rows.append({'records':n,'domain':'evaluations' if source.startswith('hf-') else 'similarity_labels','schema':schema})
   elif ext in ['.csv','.tsv','.pgn','.fns','.epd']:
    with file.open(encoding='utf-8-sig',errors='replace') as f:n,domain=count_text(f,ext,source)
    rows.append({'records':n,'domain':domain})
   elif ext=='.json':
    if source=='maahi':
     with file.open('rb') as f:n=sum(1 for _ in ijson.items(f,'item'))
     rows.append({'records':n,'domain':'openings'})
    elif source in ['arcade','chessdb-brilliancies']:
     data=json.loads(file.read_text());items=data.get('problems') if isinstance(data,dict) else data
     if source=='chessdb-brilliancies' and isinstance(data,dict):items=data.get('items',data)
     if isinstance(items,(list,dict)):rows.append({'records':len(items),'domain':'compositions' if source=='arcade' else 'brilliancies'})
     elif isinstance(data,dict) and 'ids' in data:rows.append({'records':len(data['ids']),'domain':'composition_index_entries'})
   atomic(report,{'raw_path':d['path'],'raw_sha256':d['sha256'],'members':rows,'count_seconds':round(time.monotonic()-started,3),'counted_at':now()})
   if rows:print(source,file.name,[(x['domain'],x['records']) for x in rows],flush=True)
  except Exception as error:atomic(report,{'raw_path':d['path'],'error':str(error),'members':[],'counted_at':now()})
if __name__=='__main__':run()
