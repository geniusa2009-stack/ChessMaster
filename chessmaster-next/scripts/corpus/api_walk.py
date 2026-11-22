"""Follow published composition keyset pagination with saved receipts; no invented offsets."""
import json,time
from acquire import ROOT,fetch,atomic,now

def arcade():
 for genre in ['study','retro','help','self','direct']:
  page=0;count=0;last=None;seen=set();total=None;failure=None
  while True:
   base=f'https://arcade.chessproblem.org/api/problems?genre={genre}&pageSize=5000'
   url=base+('&page=0&sortBy=difficulty&sortOrder=asc' if last is None else f'&afterScore={last[0]}&afterId={last[1]}')
   receipt=fetch('arcade',url,f'{genre}-page-{page:04}.json')
   if receipt['status']!='complete':failure=receipt;break
   data=json.loads((ROOT/receipt['path']).read_text());problems=data.get('problems')
   if not isinstance(problems,list):failure={'error':'Response has no problem list'};break
   if total is not None and total!=data['total']:failure={'error':'Total changed during acquisition; preserve snapshots separately'};break
   total=data['total']
   if not problems:break
   for r in problems:
    if r['id'] in seen:raise ValueError('Duplicate ID across cursor pages')
    seen.add(r['id'])
   count+=len(problems);tail=problems[-1];cursor=(tail['difficultyScore'],tail['id'])
   if cursor==last:raise ValueError('Cursor did not advance')
   last=cursor
   atomic(ROOT/'checkpoints'/f'arcade-{genre}.json',{'genre':genre,'records_acquired':count,'advertised_api_total':total,'page':page,'next_cursor':last,'updated_at':now(),'solutions':'not included in list endpoint'})
   page+=1
   if count>=total:break
   time.sleep(.25)
  atomic(ROOT/'reports'/f'arcade-{genre}.json',{'genre':genre,'records_acquired':count,'api_total':total,'complete_metadata':count==total and failure is None,'solutions_complete':False,'failure':failure,'updated_at':now()})
if __name__=='__main__':arcade()
