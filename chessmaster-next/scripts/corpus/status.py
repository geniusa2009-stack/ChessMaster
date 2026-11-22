"""Build a local dashboard solely from receipts, parser counts and committed SQLite state."""
import collections,json,os,shutil,sqlite3
from pathlib import Path
from acquire import ROOT,atomic,refresh,now

def status():
 refresh();sources=json.loads((ROOT/'manifests/sources.json').read_text());receipts=json.loads((ROOT/'manifests/acquisitions.json').read_text())
 counts={p.stem:json.loads(p.read_text()) for p in (ROOT/'reports/file-counts').glob('*.json')}
 by_source={};domain_copies=collections.Counter();source_files={};checksum_paths=collections.defaultdict(list)
 for rec in receipts:
  source=rec['source_id'];s=by_source.setdefault(source,{'complete_files':0,'bytes':0,'records_by_domain':collections.Counter(),'other_statuses':collections.Counter(),'files':[]})
  if rec.get('status')!='complete':s['other_statuses'][rec.get('status','unknown')]+=1;continue
  s['complete_files']+=1;s['bytes']+=rec['bytes'];s['files'].append(rec['path']);checksum_paths[rec['sha256']].append(rec['path'])
  count=counts.get(rec['sha256'],{})
  for entry in count.get('members',[]):
   if entry.get('records') is not None:
    s['records_by_domain'][entry['domain']]+=entry['records'];domain_copies[entry['domain']]+=entry['records']
 puzzle={};file=ROOT/'consolidated/index.sqlite'
 if file.exists():
  db=sqlite3.connect(f'file:{file}?mode=ro',uri=True,timeout=30)
  b=db.execute('select coalesce(sum(processed),0),coalesce(sum(unique_count),0),coalesce(sum(duplicates),0),coalesce(sum(rejected),0) from batches').fetchone()
  puzzle=dict(zip(['source_records_normalized','unique_normalized_tasks','exact_duplicate_records','quarantined'],b))
  puzzle['exact_duplicate_groups']=db.execute('select count(*) from (select task_hash from aliases group by task_hash)').fetchone()[0]
  db.close()
 domains={};f=ROOT/'consolidated/domains.sqlite'
 if f.exists():
  db=sqlite3.connect(f'file:{f}?mode=ro',uri=True,timeout=30)
  domains={'unique_records_by_domain':dict(db.execute('select domain,count(*) from records group by domain')),'source_links':db.execute('select count(*) from sources').fetchone()[0],'quarantined_records':db.execute('select count(*) from quarantine').fetchone()[0],'completed_files':db.execute('select count(*) from files').fetchone()[0],'incomplete_file_checkpoints':[dict(zip(['raw_path','raw_sha256','processed','normalized','quarantined','duplicates'],row)) for row in db.execute('select p.* from file_progress p left join files f using(raw_path) where f.raw_path is null')]}
  domains['opening_transposition_groups']=db.execute("select count(*) from (select position_hash from records where domain='openings' group by position_hash having count(*)>1)").fetchone()[0]
  domains['duplicate_game_copies']=db.execute("select count(*) from sources where canonical_id in (select canonical_id from records where domain='games')").fetchone()[0]-domains['unique_records_by_domain'].get('games',0)
  db.close()
 analysis={}
 f=ROOT/'solver-results/analysis.sqlite'
 if f.exists():
  db=sqlite3.connect(f'file:{f}?mode=ro',uri=True)
  for stage,state,n in db.execute('select stage,status,count(*) from jobs group by stage,status'):analysis.setdefault(stage,{})[state]=n
  db.close()
 storage={}
 for name in ['raw','extracted','normalized','consolidated','solver-results']:
  folder=ROOT/name;storage[name+'_logical_bytes']=sum(p.stat().st_size for p in folder.rglob('*') if p.is_file()) if folder.exists() else 0
 storage['remaining_free_bytes']=shutil.disk_usage(ROOT).free
 storage['download_reserve_bytes']=1200*1024**2;storage['normalization_reserve_bytes']=1100*1024**2
 output={'status':'PARTIALLY COMPLETE — TECHNICAL WORK REMAINS','generated_at':now(),'rights_review':'DEFERRED_TO_PROJECT_OWNER','collection_status':'RIGHTS_REVIEW_PENDING','production_modified':False,'sources_discovered':len(sources),'source_region_labels':sorted(set(s.get('country_or_region','Unknown') for s in sources)),'new_sources_beyond_original_leads':sum(not s.get('original_lead',False) for s in sources),'sources_by_category':dict(collections.Counter(s.get('category','unknown') for s in sources)),'files_downloaded':sum(r.get('status')=='complete' for r in receipts),'payload_bytes_acquired':sum(r.get('bytes',0) for r in receipts if r.get('status')=='complete'),'record_copies_acquired_by_domain':dict(domain_copies),'copy_count_warning':'Counts include historical snapshots, alternate formats and overlapping game archives. They are not globally unique totals. Composition index entries do not mean positions or solutions were acquired.','sources':by_source,'puzzle_consolidation':puzzle,'other_domains':domains,'local_analysis':analysis,'evaluation_domain':json.loads((ROOT/'reports/evaluations.json').read_text()) if (ROOT/'reports/evaluations.json').exists() else None,'storage':storage,'identical_raw_file_groups':[{'sha256':h,'paths':paths} for h,paths in checksum_paths.items() if len(paths)>1],'remaining_not_computed':['Global puzzle cross-source equivalence','Near-position similarity groups','All solution alternatives proved','Full source-by-source completion beyond acquired exports'],'pending_plans':[]}
 # A plan is an inventory of concrete retrieval work, never a claim of acquisition.
 completed_urls={r['url'] for r in receipts if r.get('status')=='complete'}
 for p in sorted((ROOT/'manifests').glob('*plan.json')):
  d=json.loads(p.read_text());pending=[x for x in d if x.get('kind','data')=='data' and x.get('url') not in completed_urls]
  if pending:output['pending_plans'].append({'plan':str(p.relative_to(ROOT)),'pending_files':len(pending)})
 atomic(ROOT/'reports/dashboard.json',output)
 # Enrich the source registry without treating an inspected web page as acquired data.
 for s in sources:
  a=by_source.get(s['source_id'],{});s['files_acquired']=a.get('files',[]);s['actual_bytes_acquired']=a.get('bytes',0);s['actual_acquired_record_copies_by_domain']=a.get('records_by_domain',{})
  s['acquisition_status']='partial' if a.get('complete_files') else 'unavailable' if s.get('inspection_status')=='failed' else 'pending'
  s['completion_note']='Completeness of the source beyond saved exports is not asserted.'
  complete_scopes={'lichess-puzzles':'Complete acquired official puzzle snapshot, SHA-256 pinned','lichess-openings':'Complete official a.tsv through e.tsv at revision 48a8c0e733facfdc9a3723fe882e51ec28014074','maahi':'Both published data/openings.csv and data/openings.json exports','planchetto':'Published openings-2026-09.csv export','chesscom-puzzles':'All four repository release archives in v1 and v2; not all puzzles on Chess.com','zenodo-similarity':'Published three-file pair-label and feature-mapping exports'}
  if s['source_id'] in complete_scopes and a.get('complete_files'):
   s['acquisition_status']='complete';s['acquisition_scope']=complete_scopes[s['source_id']]
 atomic(ROOT/'manifests/sources.json',sources)
 print(json.dumps({k:v for k,v in output.items() if k not in ['sources','identical_raw_file_groups']},ensure_ascii=False,indent=2))
if __name__=='__main__':status()
