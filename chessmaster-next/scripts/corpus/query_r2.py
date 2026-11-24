"""Read-only queries of active R2 normalized records and their full provenance."""
import argparse,json,sqlite3
from acquire import ROOT
from normalize_r2 import VERSION,unpack

def query(domain=None,id=None,limit=20,after=None,with_evidence=False):
 limit=max(1,min(limit,100))
 db=sqlite3.connect((ROOT/'consolidated/r2.sqlite').as_uri()+'?mode=ro',uri=True)
 where=['exists(select 1 from normalization_outputs o where o.entity_id=e.id and o.adapter=?)'];args=[VERSION]
 if domain:where.append('e.domain=?');args.append(domain)
 if id:where.append('e.id=?');args.append(id)
 if after:where.append('e.id>?');args.append(after)
 try:
  for entity,domain,status,blob in db.execute('select e.id,e.domain,e.status,e.payload from entities e where '+' and '.join(where)+' order by e.id limit ?',[*args,limit]):
   refs=[{'source':s,'snapshot':snap,'member':member,'ordinal':ordinal,'source_id':sid,'raw_path':path} for s,snap,member,ordinal,sid,path in db.execute('select source,snapshot,member,ordinal,source_id,raw_path from provenance p join normalization_outputs o using(source,snapshot,member,ordinal) where o.entity_id=? and o.adapter=?',(entity,VERSION))]
   result={'id':entity,'domain':domain,'status':status,'record':unpack(blob),'provenance':refs}
   if with_evidence:
    evidence_db=sqlite3.connect((ROOT/'solver-results/r2-analysis.sqlite').as_uri()+'?mode=ro',uri=True)
    evidence=[]
    for stage,config,job_status,text in evidence_db.execute('select stage,config,status,result from jobs where id in (?,?) order by stage,config',(entity,'r2:'+entity)):
     r=json.loads(text) if text else {}
     evidence.append({'stage':stage,'config_hash':config,'job_status':job_status,'verification_status':r.get('status'),'objective_verified':r.get('objective_verified',False),'unique_solution_verified':r.get('unique_solution_verified',False),'scope':r.get('objective_scope',r.get('uniqueness_scope',r.get('limitation'))),'source_solution_comparison':r.get('source_solution_comparison')})
    evidence_db.close();result['verification_evidence']=evidence;result['normalization_status_is_not_latest_verification']=True
   yield result
 finally:db.close()
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--domain');p.add_argument('--id');p.add_argument('--limit',type=int,default=20);p.add_argument('--after');p.add_argument('--with-evidence',action='store_true');a=p.parse_args()
 for r in query(a.domain,a.id,a.limit,a.after,a.with_evidence):print(json.dumps(r,ensure_ascii=True))
