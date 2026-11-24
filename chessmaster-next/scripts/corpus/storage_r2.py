"""Measured storage lower bounds plus labeled working-space projections; no fabricated full total."""
import json,shutil,sqlite3
from acquire import ROOT,atomic,now

def run():
 audit=json.loads((ROOT/'reports/r2-audit.json').read_text());free=shutil.disk_usage(ROOT).free
 db=sqlite3.connect((ROOT/'consolidated/index.sqlite').as_uri()+'?mode=ro',uri=True);rows=db.execute('select sum(processed) from batches').fetchone()[0];db.close()
 normalized=sum(p.stat().st_size for p in (ROOT/'normalized/lichess-puzzles').rglob('*.gz'))
 index=(ROOT/'consolidated/index.sqlite').stat().st_size;per=(normalized+index)/rows
 puzzle_total=0
 for receipt in (ROOT/'raw/lichess-puzzles').glob('*.receipt.json'):
  r=json.loads(receipt.read_text());count=ROOT/'reports/file-counts'/(r.get('sha256','')+'.json')
  if r.get('status')=='complete' and count.exists():puzzle_total+=sum(m.get('records',0) for m in json.loads(count.read_text()).get('members',[]) if m.get('domain')=='puzzles')
 remaining=max(0,puzzle_total-rows)
 source_counts={}
 for p in (ROOT/'reports/file-counts').glob('*.json'):
  r=json.loads(p.read_text())
  for m in r.get('members',[]):
   if m.get('records') is not None:source_counts[m['domain']]=source_counts.get(m['domain'],0)+m['records']
 history=ROOT/'reports/r2-import-history.jsonl';measurements=[]
 if history.exists():
  for line in history.read_text().splitlines():
   r=json.loads(line);n=r.get('processed_this_run',0);growth=r.get('database_growth_bytes')
   if n and growth is not None:
    measurements.append({'source':r['source'],'path':r['path'],'processed_rows':n,'seconds':r.get('seconds'),'source_rows_per_second':n/r['seconds'] if r.get('seconds') else None,'database_growth_bytes':growth,'observed_bytes_per_million_source_rows':growth/n*1e6,'peak_rss_bytes':r.get('peak_rss_bytes'),'limitation':'Measured physical DB/WAL growth for this run; allocator reuse, graph/index changes and duplicate distribution limit extrapolation.'})
 known=audit['remaining_known_download_bytes'];reserve=1200*1024**2
 result={'generated_at':now(),'primary_corpus_root':str(ROOT),'root_moved':False,'disk_free_bytes':free,'existing_component_bytes':audit['disk']['directories'],'known_remaining_raw_download_bytes':known,'minimum_additional_bytes_for_known_raw_downloads_and_reserve':max(0,known+reserve-free),'lichess_processing_projection':{'source_rows_remaining':remaining,'observed_normalized_and_index_bytes_per_row':per,'observed_bytes_per_million':per*1e6,'projected_remaining_normalization_bytes':round(per*remaining),'limitation':'Projection from the current prefix; excludes future position indexes, WAL, source distribution changes and verification.'},'working_overheads':{'download_reserve_bytes':reserve,'largest_existing_sqlite_bytes':max(p.stat().st_size for p in (ROOT/'consolidated').glob('*.sqlite')),'streamed_archive_full_decompression_bytes':0,'stream_decompression_note':'Archives are streamed; no full extra decompressed copy is scheduled. Reader/cache memory and output shards remain required.','r2_import_transaction_records':100,'r1_shard_transaction_records':10000,'wal_and_index_note':'WAL is checkpointed after workers; size depends on committed batch and active readers. Full-size output indexes and solver results are not known yet.'},'r2_import_measurements':measurements,'full_working_space_requirement_exact':None,'why_no_exact_full_total':'Saved plans include unknown-size files and sources without a completed record scan; full-scale game, evaluation, graph and solver-output expansion has not been measured. The known-byte lower bound must not be presented as sufficient total capacity.','source_record_copies_observed':source_counts,'external_storage':{'eligible_external_volume':None,'configured_object_storage_target':None,'installer_images_are_not_storage_targets':True},'rights_review':'RIGHTS_REVIEW_PENDING'}
 atomic(ROOT/'reports/r2-storage-projection.json',result);print(json.dumps(result,indent=2))
if __name__=='__main__':run()
