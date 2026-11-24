"""Resumable opening-prefix graph derived from actual legally replayed paths/games.
Names stay linked to complete source paths. Prefixes derived from games are unnamed.
"""
import argparse,json,shutil,sqlite3,time,fcntl
import chess
from acquire import ROOT,atomic,now
from normalize_r2 import connection,digest,unpack,RESERVE

def run(game_limit=0):
 locks=ROOT/'checkpoints/normalization-locks';locks.mkdir(parents=True,exist_ok=True)
 with (locks/'r2-maintenance.lock').open('a') as maintenance:
  fcntl.flock(maintenance,fcntl.LOCK_EX)
  return _run_claimed(game_limit)

def _run_claimed(game_limit=0):
 db=connection();db.executescript('''create table if not exists graph_nodes(id text primary key,fen text not null);
 create table if not exists graph_paths(id text primary key,initial_fen text not null,moves text not null,final_position text not null);
 create table if not exists graph_edges(path_id text,ply integer,from_position text,move text,to_position text,primary key(path_id,ply));
 create index if not exists graph_to on graph_edges(to_position);
 create table if not exists graph_sources(path_id text,entity_id text,source_db text,domain text,name text,eco text,primary key(path_id,entity_id,source_db));
 create table if not exists graph_done(entity_id text,source_db text,primary key(entity_id,source_db));
 create view if not exists graph_relation_groups as
 select 'transposition_group' as relation,final_position as group_id,count(*) as members
 from graph_paths group by final_position having count(*)>1
 union all
 select 'same_game_position',p.final_position,count(distinct s.source_db||':'||s.entity_id)
 from graph_sources s join graph_paths p on p.id=s.path_id where s.domain='games'
 group by p.final_position having count(distinct s.source_db||':'||s.entity_id)>1;''')
 start=time.monotonic();processed=games=0;blocked=False
 legacy=sqlite3.connect((ROOT/'consolidated/domains.sqlite').as_uri()+'?mode=ro',uri=True);legacy.execute('pragma cache_size=-65536')
 try:
  for source_db,cursor in [('r1',legacy.execute("select canonical_id,domain from records where domain in ('openings','games') order by domain desc,canonical_id")),('r2',db.execute("select id,domain from entities where domain in ('openings','games') and id in (select entity_id from normalization_outputs where adapter=(select adapter from normalization_outputs order by rowid desc limit 1)) order by domain desc,id"))]:
   for id,domain in cursor:
    if db.execute('select 1 from graph_done where entity_id=? and source_db=?',(id,source_db)).fetchone():continue
    if domain=='games' and game_limit and games>=game_limit:continue
    if shutil.disk_usage(ROOT).free<RESERVE+20*1024**2:blocked=True;break
    blob=(legacy.execute('select payload from records where canonical_id=?',(id,)).fetchone()[0] if source_db=='r1' else db.execute('select payload from entities where id=?',(id,)).fetchone()[0])
    payload=unpack(blob);moves=payload.get('moves') or payload.get('uci');initial=payload.get('initial_fen',chess.STARTING_FEN)
    if not moves:continue
    if domain=='games' and payload.get('variant','Standard') not in ['Standard','Chess']:continue
    board=chess.Board(initial);moves=moves[:20] if domain=='games' else moves
    positions=[digest([board.uci_variant,board.fen(en_passant='legal').split()[:4]])];fens=[board.fen(en_passant='legal')]
    try:
     for move in moves:board.push_uci(move);positions.append(digest([board.uci_variant,board.fen(en_passant='legal').split()[:4]]));fens.append(board.fen(en_passant='legal'))
    except ValueError:continue
    db.execute('begin immediate')
    try:
     for pos,fen in zip(positions,fens):db.execute('insert or ignore into graph_nodes values(?,?)',(pos,fen))
     for length in range(1,len(moves)+1):
      path=digest([initial,moves[:length]])
      db.execute('insert or ignore into graph_paths values(?,?,?,?)',(path,initial,json.dumps(moves[:length]),positions[length]))
      db.execute('insert or ignore into graph_edges values(?,?,?,?,?)',(path,length,positions[length-1],moves[length-1],positions[length]))
      db.execute('insert or ignore into graph_sources values(?,?,?,?,?,?)',(path,id,source_db,domain,payload.get('name') if domain=='openings' and length==len(moves) else None,payload.get('eco') if domain=='openings' and length==len(moves) else None))
     db.execute('insert into graph_done values(?,?)',(id,source_db));db.commit()
    except BaseException:db.rollback();raise
    processed+=1;games+=domain=='games'
   if blocked:break
  counts={t:db.execute('select count(*) from '+t).fetchone()[0] for t in ['graph_nodes','graph_paths','graph_edges','graph_sources','graph_done']}
  trans=db.execute('select count(*) from (select final_position from graph_paths group by final_position having count(*)>1)').fetchone()[0]
  atomic(ROOT/'reports/r2-graph.json',{'generated_at':now(),'counts':counts,'transposition_groups':trans,'position_relation_groups':[list(x) for x in db.execute('select relation,count(*),sum(members) from graph_relation_groups group by relation')],'processed_this_run':processed,'game_paths_this_run':games,'blocked_storage':blocked,'seconds':time.monotonic()-start,'scope':'All imported named paths plus first 20 plies of each processed standard game. Prefix counts are not named-variation counts.','rights_review':'RIGHTS_REVIEW_PENDING'})
  print(counts,trans,flush=True)
 finally:legacy.close();db.execute('pragma wal_checkpoint(TRUNCATE)');db.close()
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--game-limit',type=int,default=0);a=p.parse_args();run(a.game_limit)
