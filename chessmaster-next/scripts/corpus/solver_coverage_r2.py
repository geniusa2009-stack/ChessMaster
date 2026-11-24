"""Inventory applicable native problems and exact missing installed table dependencies."""
import collections,json,sqlite3
from acquire import ROOT,atomic,now
from normalize_r2 import unpack,VERSION
from popeye_r2 import problem

def run():
 source=sqlite3.connect((ROOT/'consolidated/r2.sqlite').as_uri()+'?mode=ro',uri=True)
 queue=sqlite3.connect((ROOT/'solver-results/r2-analysis.sqlite').as_uri()+'?mode=ro',uri=True)
 reasons=collections.Counter();eligible=completed=0
 for id,blob in source.execute("select e.id,e.payload from entities e where e.domain='compositions' and exists(select 1 from normalization_outputs o where o.entity_id=e.id and o.adapter=?)",(VERSION,)):
  r=unpack(blob)
  try:problem(r['display_fen'],r.get('stipulation'));eligible+=1
  except ValueError as exc:reasons[str(exc)]+=1;continue
  completed+=bool(queue.execute("select 1 from jobs where id=? and stage='popeye' and status='completed' limit 1",('r2:'+id,)).fetchone())
 endgames=json.loads((ROOT/'reports/r2-endgames.json').read_text());missing=collections.Counter();states=collections.Counter()
 for text, in queue.execute("select result from jobs where stage='syzygy' and status='completed' and config=?",(endgames['config_hash'],)):
  r=json.loads(text);states[r['status']]+=1
  if r.get('missing_dependency'):missing[r['missing_dependency']]+=1
 study_count=source.execute("select count(*) from entities e where e.domain='endgame_studies' and exists(select 1 from normalization_outputs o where o.entity_id=e.id and o.adapter=?)",(VERSION,)).fetchone()[0]
 result={'generated_at':now(),'popeye':{'eligible_records':eligible,'eligible_entities_with_completed_native_job':completed,'eligible_without_completed_native_job':eligible-completed,'unsupported_or_invalid_records':dict(reasons),'scope':'Native job completion is not proof or source-solution agreement; see separate verification states.'},'syzygy':{'config_hash':endgames['config_hash'],'states':dict(states),'active_study_records':study_count,'completed_this_configuration':sum(states.values()),'not_probed_this_configuration':study_count-sum(states.values()),'missing_dependency_counts':dict(missing),'scope':'One stored table-file configuration; other retained configurations are not added as unique studies.'},'rights_review':'RIGHTS_REVIEW_PENDING'}
 source.close();queue.close();atomic(ROOT/'reports/r2-solver-coverage.json',result);print(json.dumps(result,indent=2))
if __name__=='__main__':run()
