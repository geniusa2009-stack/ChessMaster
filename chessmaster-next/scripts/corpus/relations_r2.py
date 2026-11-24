"""Cross-source position/line matching by one R1 scan and indexed R2 probes.
Near-position candidates use a material/turn + SimHash-prefix index, at most 64
prior candidates per record. Relations never delete records or assert pedagogy.
"""
import argparse,gzip,hashlib,json,shutil,sqlite3,time,fcntl
from pathlib import Path
import chess
from acquire import ROOT,atomic,now
from normalize_r2 import unpack,digest,VERSION
from mate_proof_r2 import check_certificate

def position_key(fen):return hashlib.sha256(' '.join(chess.Board(fen).fen(en_passant='legal').split()[:4]).encode()).digest()
def similarity(fen):
 board=chess.Board(fen);sums=[0]*64;material=[]
 for color in [chess.WHITE,chess.BLACK]:
  for kind in range(1,7):material.append(len(board.pieces(kind,color)))
 for square,piece in board.piece_map().items():
  h=int.from_bytes(hashlib.sha256((piece.symbol()+chess.square_name(square)).encode()).digest()[:8],'big')
  for bit in range(64):sums[bit]+=1 if h&(1<<bit) else -1
 value=sum((1<<bit) for bit,v in enumerate(sums) if v>=0)
 return digest([material,board.turn])[:16],value

def run():
 locks=ROOT/'checkpoints/normalization-locks';locks.mkdir(parents=True,exist_ok=True)
 with (locks/'r2-maintenance.lock').open('a') as maintenance:
  fcntl.flock(maintenance,fcntl.LOCK_EX)
  return _run_claimed()

def _run_claimed():
 start=time.monotonic();file=ROOT/'consolidated/cross-source.sqlite';db=sqlite3.connect(file,timeout=30)
 db.execute('pragma journal_mode=WAL');db.execute('pragma cache_size=-32768')
 db.executescript('''create table if not exists targets(id text primary key,position blob,full_state text,task blob,domain text,material text,simhash text,prefix integer);
 create index if not exists target_position on targets(position);
 create index if not exists target_similarity on targets(material,prefix,id);
 create table if not exists runs(id text primary key,source_signature text,complete integer,updated_at text);
 create table if not exists relations(run text,relation text,group_id text,left_namespace text,left_id text,right_namespace text,right_id text,evidence text,primary key(run,relation,left_namespace,left_id,right_namespace,right_id));
 create table if not exists scan_progress(run text primary key,last_r1_id integer);
 ''')
 source=sqlite3.connect((ROOT/'consolidated/r2.sqlite').as_uri()+'?mode=ro',uri=True)
 legacy=sqlite3.connect((ROOT/'consolidated/index.sqlite').as_uri()+'?mode=ro',uri=True)
 db.execute('create temp table active_targets(id text primary key) without rowid')
 db.execute('create temp view current_targets as select t.* from targets t join active_targets a on a.id=t.id')
 signature=hashlib.sha256();count=0
 # Targets reflect active outputs, not obsolete adapter entities.
 source.execute('pragma cache_size=-131072')
 for id,domain in source.execute("select e.id,e.domain from entities e indexed by entity_domain where e.domain in ('puzzles','training_positions') and exists(select 1 from normalization_outputs o where o.entity_id=e.id and o.adapter=?) order by e.id",(VERSION,)):
  blob=source.execute('select payload from entities where id=?',(id,)).fetchone()[0]
  r=unpack(blob);fen=r.get('display_fen')
  if not fen:continue
  signature.update(id.encode());count+=1
  db.execute('insert into active_targets values(?)',(id,))
  if db.execute('select 1 from targets where id=?',(id,)).fetchone():continue
  board=chess.Board(fen);pos=position_key(fen);lines=r.get('solution_lines',[])
  task=hashlib.sha256(pos+json.dumps(lines,separators=(',',':')).encode()).digest() if lines else None
  material,sim=similarity(fen)
  db.execute('insert into targets values(?,?,?,?,?,?,?,?)',(id,pos,board.fen(en_passant='legal'),task,domain,material,f'{sim:016x}',sim>>48))
  if count%1000==0:db.commit()
 db.commit();max_id=legacy.execute('select coalesce(max(id),0) from tasks').fetchone()[0]
 sig=signature.hexdigest()+':'+str(max_id);run=digest(['cross-source-2',sig]);db.execute('insert or ignore into runs values(?,?,0,?)',(run,sig,now()));db.commit()
 checkpoint=db.execute('select last_r1_id from scan_progress where run=?',(run,)).fetchone();last=checkpoint[0] if checkpoint else 0
 if checkpoint is None:
  # Same immutable targets: carry committed edges from complete or partial runs.
  for prior,prior_sig,prior_scanned in db.execute('select r.id,r.source_signature,coalesce(p.last_r1_id,0) from runs r left join scan_progress p on p.run=r.id where r.source_signature like ? order by coalesce(p.last_r1_id,0) desc',(signature.hexdigest()+':%',)).fetchall():
   prior_max=int(prior_sig.rsplit(':',1)[1])
   if prior_max<=max_id and prior==digest(['cross-source-2',prior_sig]):
    db.execute('insert or ignore into relations select ?,relation,group_id,left_namespace,left_id,right_namespace,right_id,evidence from relations where run=?',(run,prior))
    last=min(prior_max,prior_scanned);db.execute('insert into scan_progress values(?,?)',(run,last));db.commit();break
 # Cross-join order deliberately makes the large R1 table the outer sequential scan.
 db.execute('attach database ? as legacy',(str(ROOT/'consolidated/index.sqlite'),))
 scanned=last;matched=0;blocked=False
 try:
  while scanned<max_id:
   if shutil.disk_usage(ROOT).free<1200*1024**2:blocked=True;break
   stop=min(scanned+10000,max_id)
   join_cursor=db.execute('''select r.id,hex(r.task_hash),r.shard,r.ordinal,t.id,t.full_state,hex(t.task)
    from legacy.tasks r cross join current_targets t on t.position=r.position_hash
    where r.id>? and r.id<=? order by r.shard,r.ordinal''',(scanned,stop))
   while True:
    rows=join_cursor.fetchmany(1000)
    if not rows:break
    # At most the sparse matching records are loaded; never load the R1 corpus.
    needed={}
    for row in rows:needed.setdefault(row[2],set()).add(row[3])
    records={}
    for shard,ordinals in needed.items():
     with gzip.open(ROOT/shard,'rt') as f:
      for ordinal,line in enumerate(f):
       if ordinal in ordinals:records[(shard,ordinal)]=json.loads(line)
       if ordinal>=max(ordinals):break
    db.execute('begin')
    for _,rid,shard,ordinal,tid,state,task in rows:
     r=records[(shard,ordinal)];same_state=chess.Board(r['display_fen']).fen(en_passant='legal')==state
     exact=rid==task and same_state
     relation='exact_duplicate_of' if exact else 'same_position_candidate'
     evidence={'position_equal':True,'full_fen_state_equal':same_state,'solution_line_equal':rid==task,'scope':'position and canonical line only','educational_merge_allowed':False,'source_references':'R1 tasks/aliases and R2 provenance remain authoritative'}
     db.execute('insert or ignore into relations values(?,?,?,?,?,?,?,?)',(run,relation,digest([r['display_fen'].split()[:4],relation]),'r1',rid.lower(),'r2',tid,json.dumps(evidence)));matched+=1
    db.commit()
   db.execute('insert or replace into scan_progress values(?,?)',(run,stop));db.commit();scanned=stop
  # Bounded LSH candidates. No all-pairs scan, no educational merge.
  for id,material,prefix,sim in db.execute('select id,material,prefix,simhash from current_targets order by id'):
   for other,other_sim in db.execute('select id,simhash from current_targets where material=? and prefix=? and id<? order by id limit 64',(material,prefix,id)).fetchall():
    distance=(int(sim,16)^int(other_sim,16)).bit_count()
    if distance<=8:
     db.execute('insert or ignore into relations values(?,?,?,?,?,?,?,?)',(run,'similar_position_group',digest([material,prefix]),'r2',other,'r2',id,json.dumps({'simhash_hamming':distance,'candidate_cap_per_record':64,'candidate_only':True,'educational_merge_allowed':False})))
  # Certified alternatives can share a group only for identical full state and modeled objective.
  proofs=sqlite3.connect((ROOT/'solver-results/r2-analysis.sqlite').as_uri()+'?mode=ro',uri=True)
  db.execute('create temp table proof_candidates(group_id text,id text,primary key(group_id,id)) without rowid')
  for id,result in proofs.execute("select id,result from jobs where stage='objective' and status='completed' and json_extract(result,'$.objective_verified')=1"):
   r=json.loads(result);group=digest([r['display_fen'],r['objective'],r.get('objective_origin')]);db.execute('insert or ignore into proof_candidates values(?,?)',(group,id))
   for alternative in r.get('alternative_first_move_proofs',[]):
    if not check_certificate(r['display_fen'],alternative,r['objective']['plies']):raise ValueError('Alternative certificate did not replay')
    namespace,source_id=id.split(':',1);alternative_id=digest([id,alternative])
    db.execute('insert or ignore into relations values(?,?,?,?,?,?,?,?)',(run,'equivalent_solution_group',group,namespace,source_id,'verified_alternative',alternative_id,json.dumps({'first_move':alternative['first_move'],'source_proof_job':id,'certificate_replayed':True,'educational_merge_allowed':False,'scope':'Proved alternative first move for the same source task and modeled mate horizon'})))
  last_group=None;anchor=None
  for group,id in db.execute('select group_id,id from proof_candidates order by group_id,id'):
   if group!=last_group:last_group=group;anchor=id;continue
   db.execute('insert or ignore into relations values(?,?,?,?,?,?,?,?)',(run,'equivalent_solution_group',group,*anchor.split(':',1),*id.split(':',1),json.dumps({'certificate_verified':True,'scope':'same modeled mate objective and full FEN','educational_merge_allowed':False})))
  proofs.close();db.execute('update runs set complete=?,updated_at=? where id=?',(int(not blocked and scanned>=max_id),now(),run));db.commit()
  counts=[list(x) for x in db.execute('select relation,count(distinct group_id),count(*) from relations where run=? group by relation',(run,))]
  atomic(ROOT/'reports/r2-cross-source.json',{'generated_at':now(),'run':run,'r1_max_id':max_id,'r1_scanned_through':scanned,'r1_start_checkpoint':last,'active_r2_targets':count,'relation_counts':counts,'blocked_storage':blocked,'seconds':time.monotonic()-start,'scope':'Committed normalized R1 plus current active R2 targets; not raw unnormalized records','similarity_limitations':'Single SimHash prefix and 64-prior-candidate bound are incomplete candidate generation, not exhaustive near-position equivalence','rights_review':'RIGHTS_REVIEW_PENDING'});print(counts,flush=True)
 finally:legacy.close();source.close();db.execute('pragma wal_checkpoint(TRUNCATE)');db.close()
if __name__=='__main__':run()
