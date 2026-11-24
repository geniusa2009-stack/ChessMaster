"""Export measured safe receipts/counts without publishing raw content or HTTP headers."""
import re
from datetime import datetime
import argparse,collections,json,shutil,sqlite3,subprocess,time
from pathlib import Path
from acquire import ROOT,atomic,now,refresh
from normalize_r2 import VERSION,unpack

def fixture_passed(test_text,module):
 pattern=r'(?ms)^test_[^\n]*\('+re.escape(module)+r'\.[^\n]*\).*?(?=^test_|\Z)'
 return any(re.search(r'(?m)(?:\.\.\. )?ok$',block) for block in re.findall(pattern,test_text))

def read_report(name):
 p=ROOT/'reports'/name
 return json.loads(p.read_text()) if p.exists() else None

def export(output,baseline_path=None,verified_audit_path=None):
 verified_audit=json.loads(verified_audit_path.read_text()) if verified_audit_path else None
 if verified_audit and verified_audit.get('integrity_mode')!='integrity_check':raise ValueError('A full integrity_check audit is required for reuse')
 baseline=json.loads(baseline_path.read_text()) if baseline_path else read_report('r2-baseline.json');refresh();receipts=[]
 for p in sorted((ROOT/'raw').rglob('*.receipt.json')):
  r=json.loads(p.read_text());target=ROOT/r['path'];partial=target.with_name(target.name+'.part')
  receipts.append({**{k:r.get(k) for k in ['source_id','path','status','bytes','advertised_bytes','sha256']},'actual_file_bytes':target.stat().st_size if target.exists() else None,'partial_bytes':partial.stat().st_size if partial.exists() else 0})
 before={r['path']:r for r in baseline['receipts']};new=[r for r in receipts if r['status']=='complete' and before.get(r['path'],{}).get('status')!='complete']
 disk=shutil.disk_usage(ROOT);directories={d.name:sum(p.stat().st_size for p in d.rglob('*') if p.is_file()) for d in ROOT.iterdir() if d.is_dir()}
 report={'status':'PARTIALLY COMPLETE — STORAGE OR TECHNICAL WORK REMAINS','generated_at':now(),'rights_review':'RIGHTS_REVIEW_PENDING','baseline':{k:baseline[k] for k in ['generated_at','disk','acquisitions_by_status','databases','duckdb','missing_shards']},'storage_after':{'free_bytes':disk.free,'directories':directories,'corpus_total_bytes':sum(directories.values()),'reserve_bytes':1200*1024**2,'available_volumes':[p.name for p in Path('/Volumes').iterdir()],'corpus_moved':False},'acquisitions':{'counts':dict(collections.Counter(r['status'] for r in receipts)),'new_completed_files':len(new),'new_completed_bytes':sum(r.get('bytes') or 0 for r in new),'new_completed':new,'all_files':receipts},'databases':{}}
 for path in ['consolidated/domains.sqlite','consolidated/index.sqlite','consolidated/r2.sqlite','solver-results/analysis.sqlite','solver-results/r2-analysis.sqlite','consolidated/cross-source.sqlite']:
  p=ROOT/path
  if not p.exists():continue
  db=sqlite3.connect(p.as_uri()+'?mode=ro',uri=True)
  db.execute('pragma cache_size=-131072')
  if verified_audit:
   wal=p.with_name(p.name+'-wal')
   if p.stat().st_mtime>datetime.fromisoformat(verified_audit['generated_at']).timestamp() or (wal.exists() and wal.stat().st_size):raise ValueError('Database changed after audit or has uncheckpointed WAL: '+path)
   result=verified_audit['databases'][path]['integrity']
   if result!=[['ok']]:raise ValueError('Full integrity audit did not pass: '+path)
   entry={'full_integrity_check':result,'integrity_audit_generated_at':verified_audit['generated_at'],'tables':{}}
  else:entry={'quick_check':db.execute('pragma quick_check').fetchall(),'tables':{}}
  for (table,) in db.execute("select name from sqlite_master where type='table' and name not like 'sqlite_%'"):
   entry['tables'][table]=db.execute('select count(*) from "'+table.replace('"','""')+'"').fetchone()[0]
  if p.name=='domains.sqlite':entry['domains']=dict(db.execute('select domain,count(*) from records group by domain'))
  if p.name=='r2.sqlite':
   entry['active_adapter']=VERSION
   missing={}
   for domain,blob in db.execute("select e.domain,e.payload from entities e where e.domain in('compositions','endgame_studies') and exists(select 1 from normalization_outputs o where o.adapter=? and o.entity_id=e.id)",(VERSION,)):
    if unpack(blob).get('missing_solution'):missing[domain]=missing.get(domain,0)+1
   entry['missing_source_solution_records']=missing
   entry['active_domains']=dict(db.execute('select e.domain,count(*) from entities e where exists(select 1 from normalization_outputs o where o.adapter=? and o.entity_id=e.id) group by e.domain',(VERSION,)))
   entry['normalized_by_source']=[list(x) for x in db.execute('select source,count(*),count(distinct entity_id) from normalization_outputs where adapter=? group by source',(VERSION,))]
   entry['file_progress']=[dict(zip(['raw_path','snapshot','adapter','processed','accepted','rejected','duplicates','complete'],row)) for row in db.execute('select raw_path,snapshot,adapter,processed,accepted,rejected,duplicates,complete from progress')]
   entry['issues']=[list(x) for x in db.execute('select raw_path,kind,detail from issues')]
   entry['duplicate_identity_groups']=db.execute('select count(*) from (select entity_id from normalization_outputs where adapter=? group by entity_id having count(*)>1)',(VERSION,)).fetchone()[0]
   entry['duplicate_source_rows']=db.execute('select coalesce(sum(n-1),0) from (select count(*) n from normalization_outputs where adapter=? group by entity_id having count(*)>1)',(VERSION,)).fetchone()[0]
   entry['rejection_count_scope']='Historical rejection rows are retained after successful repairs; use recovery links and active outputs for acceptance.'
   entry['historical_rejections_recovered']=db.execute('select count(*) from normalization_recoveries').fetchone()[0] if db.execute("select 1 from sqlite_master where name='normalization_recoveries'").fetchone() else 0
   entry['relation_groups_scope']='Historical sidecar candidates across retained adapter entities; run-scoped active cross-source relations are separate.'
   entry['relation_groups']=[list(x) for x in db.execute('select relation,count(distinct group_id),count(*) from relations group by relation')]
  if p.name in ['analysis.sqlite','r2-analysis.sqlite']:
   entry['jobs']=[list(x) for x in db.execute('select stage,status,count(*) from jobs group by stage,status')]
   if p.name=='r2-analysis.sqlite':entry['verification_states']=[list(x) for x in db.execute("select stage,json_extract(result,'$.status'),count(*) from jobs where result is not null group by stage,json_extract(result,'$.status')")]
  report['databases'][path]=entry;db.close()
 remaining=sum(max(0,(r.get('advertised_bytes') or 0)-r['partial_bytes']) for r in receipts if r['status']!='complete')
 raw_counts=collections.defaultdict(collections.Counter);uncounted=[]
 for r in receipts:
  if r['status']!='complete':continue
  count_file=ROOT/'reports/file-counts'/(r['sha256']+'.json')
  counted=json.loads(count_file.read_text()) if count_file.exists() else {}
  found=False
  for member in counted.get('members',[]):
   if isinstance(member.get('records'),int):raw_counts[r['source_id']][member.get('domain') or 'unclassified']+=member['records'];found=True
  if not found:uncounted.append(r['path'])
 report['raw_parsed_record_copies']={'by_source':{s:dict(c) for s,c in raw_counts.items()},'files_without_record_count':uncounted,'scope':'Parsed source-record copies by format/domain, including alternate snapshots and representations; not globally unique counts.'}
 report['storage_requirement']={'known_remaining_download_bytes':remaining,'additional_bytes_for_known_downloads_and_reserve':max(0,remaining+1200*1024**2-disk.free),'unknown_size_files':sum(r['status']!='complete' and r.get('advertised_bytes') is None for r in receipts),'limitation':'This is a lower bound, not the full working-space requirement. Extracted data, full normalization, indexes, WAL and solver growth remain additional and unmeasured at complete-corpus scale.'}
 report['file_ledger']=read_report('r2-file-ledger.json')
 report['opening_graph']=read_report('r2-graph.json');report['latest_pending_size_probes']=read_report('r2-latest-pending-probes.json');report['opening_graph_last_work_pass']=read_report('r2-graph-work-pass.json');report['benchmarks']=read_report('r2-benchmarks.json')
 proof_db=sqlite3.connect((ROOT/'solver-results/r2-analysis.sqlite').as_uri()+'?mode=ro',uri=True)
 objective_jobs=proof_db.execute("select stage,count(distinct id),count(*) from jobs where stage in ('objective','popeye','syzygy') and status='completed' and json_extract(result,'$.objective_verified')=1 group by stage").fetchall()
 unique_jobs=proof_db.execute("select count(distinct id) from jobs where stage='objective' and status='completed' and json_extract(result,'$.unique_solution_verified')=1").fetchone()[0];proof_db.close()
 report['verification']={'objective_proofs_added':sum(x[1] for x in objective_jobs),'objective_entities_and_jobs_by_stage':[list(x) for x in objective_jobs],'unique_solution_proofs_added':unique_jobs,'uniqueness_scope':'Unique first move for the explicitly modeled mate horizon, not full-line uniqueness','r1_evidence_preserved':True,'r2_legal':read_report('r2-verification-legal.json'),'r2_engine':read_report('r2-verification-engine.json'),'popeye':read_report('r2-popeye.json'),'syzygy':read_report('r2-endgames.json'),'coverage_inventory':read_report('r2-solver-coverage.json')}
 report['git']={'branch':subprocess.check_output(['git','branch','--show-current'],text=True,cwd=Path(__file__).resolve().parents[3]).strip(),'commit':subprocess.check_output(['git','rev-parse','HEAD'],text=True,cwd=Path(__file__).resolve().parents[3]).strip(),'dirty':bool(subprocess.check_output(['git','status','--porcelain'],text=True,cwd=Path(__file__).resolve().parents[3]).strip())}
 report['unfinished']=['R1 final position-index completion and any remaining normalization are recorded separately in the current checkpoint and R1 normalization report.','Cross-source matching is checkpointed and partial; compare scanned high-water mark with final R1 committed count.','Cross-store canonical game reconciliation remains incomplete; source stores overlap.','Lichess evaluation and monthly games exceed current capacity.','Unknown-size and failed regional downloads require source-specific retry/probe review.','Full Chess.com and regional-game imports remain checkpointed, not complete.','R1/R2 counts overlap; never sum them as global unique records.','Global educational equivalence remains incomplete; verified alternative first-move groups are scoped to available proof certificates.','Composition source-solution retrieval, full stipulation soundness and broader Syzygy coverage remain incomplete; directmate model proofs are recorded separately.','Opening graph is partial; prefix paths are not named variations.','Material-gain, unique-defense, promotion and other tactical objective proof models remain unsupported.','Complete per-domain scale/storage projections remain unmeasured.']
 test_log=ROOT/'reports/r2-continuation-tests.txt';test_text=test_log.read_text() if test_log.exists() else '';match=re.search(r'Ran (\d+) tests',test_text)
 skipped_match=re.search(r'OK \(skipped=(\d+)\)',test_text);skipped=int(skipped_match[1]) if skipped_match else 0
 report['tests']={'run':int(match[1]) if match else None,'passed':int(match[1])-skipped if match and '\nOK' in test_text else None,'skipped':skipped,'includes_actual_private_fixture':fixture_passed(test_text,'test_private_formats_r2'),'includes_loopback_http_fixture':fixture_passed(test_text,'test_http_fetch_integration_r2'),'log':'reports/r2-continuation-tests.txt'}
 report['r1_puzzle_checkpoint']=json.loads((ROOT/'checkpoints/lichess-puzzles.json').read_text())
 report['r1_puzzle_normalization']=read_report('lichess-puzzles-normalization.json')
 report['certificate_replay']=read_report('r2-certificate-replay.json')
 report['new_file_verification']=read_report('r2-new-file-verification.json')
 report['final_integrity']=read_report('r2-final-mutated-integrity.json')
 report['cross_source_relations']=read_report('r2-cross-source.json');report['mate_proof_run']=read_report('r2-objectives-r1.json');report['mate_proof_r2_run']=read_report('r2-objectives-r2.json');report['storage_projection']=read_report('r2-storage-projection.json');report['normalization_performance_history']=[json.loads(line) for line in (ROOT/'reports/r2-import-history.jsonl').read_text().splitlines()] if (ROOT/'reports/r2-import-history.jsonl').exists() else []
 if (report.get('r1_puzzle_normalization') or {}).get('complete'):
  report['unfinished']=[x for x in report['unfinished'] if not x.startswith('R1 final position-index')]
 cross=report.get('cross_source_relations') or {}
 if not cross.get('blocked_storage',True) and cross.get('r1_scanned_through',0)>=report['r1_puzzle_checkpoint']['unique']:
  report['unfinished']=[x for x in report['unfinished'] if not x.startswith('Cross-source matching is checkpointed')]
 graph=report.get('opening_graph') or {}
 if not graph.get('blocked_storage',True) and not graph.get('invalid_lines_skipped_this_run',0):
  report['unfinished']=[x for x in report['unfinished'] if not x.startswith('Opening graph is partial')]
  report['unfinished'].append('Graph covers current normalized standard games through 20 plies and full named source paths; remaining game imports and variant-specific graphs are unfinished. Prefixes are not named variations.')
 report['unfinished'].append('Family/variation/subvariation taxonomy is not fully extracted from source-specific names; original names and metadata remain available.')
 coverage=report['verification'].get('coverage_inventory') or {}
 pending_native=coverage.get('popeye',{}).get('eligible_without_completed_native_job')
 if pending_native:report['unfinished'].append(str(pending_native)+' eligible composition entities have no completed native job; completed native jobs without a mate proof also remain unproved.')
 atomic(output,report);print(json.dumps({'status':report['status'],'new_completed_files':len(new),'new_bytes':report['acquisitions']['new_completed_bytes'],'active_domains':report['databases']['consolidated/r2.sqlite']['active_domains'],'free_bytes':disk.free,'remaining_known_bytes':remaining,'git':report['git']},indent=2))
 return report
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--output',type=Path,default=ROOT/'reports/r2-final.json');p.add_argument('--baseline',type=Path);p.add_argument('--verified-audit',type=Path,help='Reuse a fresh full integrity audit only for unchanged, checkpointed databases');a=p.parse_args();export(a.output,a.baseline,a.verified_audit)
