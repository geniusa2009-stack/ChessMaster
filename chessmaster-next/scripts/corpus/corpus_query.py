"""Private local corpus inspection; never an application/public API."""
import argparse,gzip,json,sqlite3,zlib
from acquire import ROOT

def main():
 p=argparse.ArgumentParser();p.add_argument('--puzzle');p.add_argument('--domain');p.add_argument('--after',default='');p.add_argument('--limit',type=int,default=20);p.add_argument('--text',default='');a=p.parse_args()
 if a.puzzle:
  db=sqlite3.connect(f'file:{ROOT/"consolidated/index.sqlite"}?mode=ro',uri=True)
  row=db.execute('select shard,ordinal from tasks where task_hash=?',(bytes.fromhex(a.puzzle),)).fetchone();db.close()
  if row is None:raise SystemExit('No such canonical puzzle')
  with gzip.open(ROOT/row[0],'rt') as f:
   for ordinal,line in enumerate(f):
    if ordinal==row[1]:print(line,end='');return
 elif a.domain:
  limit=max(1,min(a.limit,100));out=[]
  db=sqlite3.connect(f'file:{ROOT/"consolidated/domains.sqlite"}?mode=ro',uri=True)
  cursor=db.execute('select canonical_id,payload from records where domain=? and canonical_id>? order by canonical_id',(a.domain,a.after))
  for id,payload in cursor:
   item=json.loads(zlib.decompress(payload))
   if a.text.casefold() not in json.dumps(item,ensure_ascii=False).casefold():continue
   out.append({'canonical_id':id,**item})
   if len(out)>=limit:break
  db.close();print(json.dumps({'records':out,'next_cursor':out[-1]['canonical_id'] if out else None},ensure_ascii=False,indent=2))
 else:p.error('Use --puzzle CANONICAL_ID or --domain DOMAIN')
if __name__=='__main__':main()
