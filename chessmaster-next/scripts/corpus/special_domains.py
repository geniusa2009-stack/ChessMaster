"""Preserve composition genres and Chinese source analysis without claiming local proof."""
import hashlib,json,sqlite3,zlib
from pathlib import Path
import chess
from acquire import ROOT,now,atomic
from domains import dbopen,key

def run():
 db=dbopen();processed=0;new=0
 for source in ['arcade','chessdb-brilliancies']:
  for receipt in sorted((ROOT/'raw'/source).glob('*.receipt.json')):
   rec=json.loads(receipt.read_text())
   if rec.get('status')!='complete':continue
   path=ROOT/rec['path'];d=json.loads(path.read_text())
   if source=='arcade':items=d.get('problems',[])
   else:items=list(d.get('items',{}).values())
   if not items:continue
   db.execute('begin')
   for ordinal,row in enumerate(items,1):
    id=str(row.get('id',ordinal));fen=row.get('fen') if source=='arcade' else row.get('position',{}).get('fenBefore')
    genre=row.get('genre','brilliancy');domain='endgame_studies' if genre=='study' else 'compositions' if source=='arcade' else 'brilliancies'
    stipulation=row.get('stipulation')
    canonical=key([source,id,genre,stipulation])
    status='specialized_verification_pending' if source=='arcade' else 'local_verification_pending'
    payload={'source_id':id,'genre':genre,'stipulation':stipulation,'original_fen':fen,'solution_text':row.get('solutionText'),'solution_text_status':'present' if row.get('solutionText') else 'not_in_list_endpoint','source_verification':row.get('verification'),'original_metadata':row,'verification':status,'objective_verified':False,'rights_review':'RIGHTS_REVIEW_PENDING'}
    # Validation of diagram syntax is separate from stipulation-specific legality.
    if fen:
     try:board=chess.Board(fen);payload['fen_syntax_valid']=True;payload['orthodox_position_valid']=board.is_valid()
     except ValueError:payload['fen_syntax_valid']=False
    pos=key(fen.split()[:4]) if fen else None
    created=db.execute('insert or ignore into records values(?,?,?,?,?)',(canonical,domain,pos,status,zlib.compress(json.dumps(payload,ensure_ascii=False).encode(),3))).rowcount
    db.execute('insert or ignore into sources values(?,?,?,?,?,?,?)',(canonical,source,rec['path'],rec['sha256'],path.name,ordinal,zlib.compress(json.dumps(row,ensure_ascii=False).encode(),3)))
    new+=created;processed+=1
   db.commit()
 stats={domain:n for domain,n in db.execute('select domain,count(*) from records group by domain')}
 atomic(ROOT/'reports/special-domains.json',{'processed_this_run':processed,'new_unique_records':new,'unique_records_by_domain':stats,'objective_verified':0,'updated_at':now()})
 db.execute('pragma wal_checkpoint(TRUNCATE)');db.close();print(stats)
if __name__=='__main__':run()
