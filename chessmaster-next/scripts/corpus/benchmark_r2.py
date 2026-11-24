"""Measured warm-cache point lookups, physical disk and process peak RSS."""
import json,resource,sqlite3,statistics,time
from acquire import ROOT,atomic,now

def measure(db,sql,args):
 elapsed=[]
 for values in args:
  start=time.perf_counter_ns();db.execute(sql,values).fetchone();elapsed.append((time.perf_counter_ns()-start)/1e6)
 return {'samples':len(elapsed),'median_ms':statistics.median(elapsed),'p95_ms':sorted(elapsed)[max(0,int(len(elapsed)*.95)-1)],'lookups_per_second':1000/(statistics.mean(elapsed) or 1e-9)} if elapsed else {'unavailable':True}

def run():
 report={'generated_at':now(),'scope':'Warm-cache point queries on the actual local databases; not cold-cache throughput.','queries':{}}
 db=sqlite3.connect((ROOT/'consolidated/r2.sqlite').as_uri()+'?mode=ro',uri=True)
 for name,sql,keys in [
 ('duplicate_identity','select id from entities where id=?',db.execute('select id from entities limit 1000').fetchall()),
 ('opening_path','select moves from graph_paths where id=?',db.execute('select id from graph_paths limit 1000').fetchall()),
 ('game_retrieval','select payload from entities where id=?',db.execute("select id from entities where domain='games' limit 1000").fetchall()),
 ('composition_retrieval','select payload from entities where id=?',db.execute("select id from entities where domain='compositions' limit 1000").fetchall()),
 ('endgame_retrieval','select payload from entities where id=?',db.execute("select id from entities where domain='endgame_studies' limit 1000").fetchall()),
 ('position_lookup','select id from entities where position_hash=? limit 1',db.execute('select position_hash from entities where position_hash is not null limit 1000').fetchall())]:report['queries'][name]=measure(db,sql,keys)
 entities=db.execute('select count(*) from entities').fetchone()[0];db.close()
 r1=sqlite3.connect((ROOT/'consolidated/index.sqlite').as_uri()+'?mode=ro',uri=True)
 report['queries']['r1_task_hash_lookup']=measure(r1,'select id from tasks where task_hash=?',r1.execute('select task_hash from tasks limit 1000').fetchall())
 report['queries']['r1_position_index_lookup']=measure(r1,'select id from tasks where position_hash=? limit 1',r1.execute('select position_hash from tasks limit 1000').fetchall());r1.close()
 size=(ROOT/'consolidated/r2.sqlite').stat().st_size
 report['storage']={'r2_sqlite_bytes':size,'historical_entities':entities,'observed_mixed_db_bytes_per_million_entities':size/entities*1e6 if entities else None,'limitation':'Includes provenance, rejected history, indexes and graph. Not a domain-specific linear capacity guarantee.'}
 try:
  q=sqlite3.connect((ROOT/'solver-results/r2-analysis.sqlite').as_uri()+'?mode=ro',uri=True)
  keys=q.execute('select id,stage,config from jobs limit 1000').fetchall();report['queries']['solver_job_lookup']=measure(q,'select status from jobs where id=? and stage=? and config=?',keys);q.close()
 except sqlite3.Error as exc:report['queries']['solver_job_lookup']={'error':str(exc)}
 try:
  import duckdb
  d=duckdb.connect(str(ROOT/'consolidated/evaluations.duckdb'),read_only=True);samples=[]
  for _ in range(20):
   start=time.perf_counter_ns();d.execute('select * from evaluations limit 1').fetchone();samples.append((time.perf_counter_ns()-start)/1e6)
  report['queries']['duckdb_evaluation_sample']={'samples':20,'median_ms':statistics.median(samples),'p95_ms':sorted(samples)[18]}
  fen=d.execute('select fen from evaluations limit 1').fetchone()[0];samples=[]
  for _ in range(10):
   start=time.perf_counter_ns();d.execute('select fen from evaluations where fen=? limit 1',[fen]).fetchone();samples.append((time.perf_counter_ns()-start)/1e6)
  report['queries']['duckdb_fen_filter']={'samples':10,'median_ms':statistics.median(samples),'p95_ms':sorted(samples)[8]};d.close()
 except Exception as exc:report['queries']['duckdb_evaluation_sample']={'error':str(exc)}
 report['benchmark_process_peak_rss_bytes']=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
 report['rss_platform']='macOS ru_maxrss bytes';atomic(ROOT/'reports/r2-benchmarks.json',report);print(json.dumps(report,indent=2))
if __name__=='__main__':run()
