"""A typed, queryable evaluation domain over immutable Parquet, without copying its rows."""
import json
import duckdb
from acquire import ROOT,atomic,now

def run():
 records=[]
 for receipt in sorted((ROOT/'raw/hf-eval').glob('*.receipt.json')):
  r=json.loads(receipt.read_text())
  if r.get('status')=='complete' and r['path'].endswith('.parquet'):records.append(r)
 if not records:raise RuntimeError('No acquired evaluation Parquet files')
 quote=lambda v:"'"+str(v).replace("'","''")+"'"
 db=duckdb.connect(str(ROOT/'consolidated/evaluations.duckdb'))
 db.execute('set threads=1');db.execute("set memory_limit='128MB'")
 values=','.join('('+','.join(quote(v) for v in [str(ROOT/r['path']),r['sha256'],r['url'],r.get('completed_at','')])+')' for r in records)
 files=','.join(quote(ROOT/r['path']) for r in records)
 db.execute(f"create or replace view provenance as select * from (values {values}) t(raw_file,source_file_sha256,source_url,retrieved_at)")
 db.execute(f"create or replace view evaluations as select raw.* exclude(filename),p.*,'RIGHTS_REVIEW_PENDING' as collection_status,false as locally_objective_verified from read_parquet([{files}],filename=true) raw join provenance p on raw.filename=p.raw_file")
 count=db.execute('select count(*) from evaluations').fetchone()[0]
 schema=db.execute('describe evaluations').fetchall()
 db.close();atomic(ROOT/'reports/evaluations.json',{'normalized_queryable_records':count,'storage':'DuckDB view over immutable source Parquet; zero row copies','schema':schema,'locally_verified':0,'created_at':now()});print(count)
if __name__=='__main__':run()
