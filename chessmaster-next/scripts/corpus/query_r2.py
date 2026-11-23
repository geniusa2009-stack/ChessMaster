"""Read-only queries of active R2 normalized records and their full provenance."""
import argparse,json,sqlite3
from acquire import ROOT
from normalize_r2 import VERSION,unpack

def query(domain=None,id=None,limit=20):
 db=sqlite3.connect((ROOT/'consolidated/r2.sqlite').as_uri()+'?mode=ro',uri=True)
 where=['e.id in (select entity_id from normalization_outputs where adapter=?)'];args=[VERSION]
 if domain:where.append('e.domain=?');args.append(domain)
 if id:where.append('e.id=?');args.append(id)
 try:
  for entity,domain,status,blob in db.execute('select e.id,e.domain,e.status,e.payload from entities e where '+' and '.join(where)+' order by e.id limit ?',[*args,limit]):
   refs=[{'source':s,'snapshot':snap,'member':member,'ordinal':ordinal,'source_id':sid,'raw_path':path} for s,snap,member,ordinal,sid,path in db.execute('select source,snapshot,member,ordinal,source_id,raw_path from provenance p join normalization_outputs o using(source,snapshot,member,ordinal) where o.entity_id=? and o.adapter=?',(entity,VERSION))]
   yield {'id':entity,'domain':domain,'status':status,'record':unpack(blob),'provenance':refs}
 finally:db.close()
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--domain');p.add_argument('--id');p.add_argument('--limit',type=int,default=20);a=p.parse_args()
 for r in query(a.domain,a.id,a.limit):print(json.dumps(r,ensure_ascii=False))
