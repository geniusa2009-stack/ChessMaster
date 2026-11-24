"""Exhaustive orthodox mate-in-N proofs. Budgets yield incomplete, never a false proof.
A certificate covers every defender reply, with one winning continuation per attacker node.
Uniqueness means unique first move for the explicitly modeled mate horizon only.
"""
import hashlib,json,time
import chess
VERSION='orthodox-mate-proof-1.1'
class BudgetExceeded(Exception):pass

def prove(fen,first_move,plies,node_budget=100000,seconds=3,unique=True):
 if plies<1 or plies%2!=1:raise ValueError('Mate horizon must be a positive odd number of plies')
 board=chess.Board(fen)
 if not board.is_valid():raise ValueError('Invalid orthodox position')
 attacker=board.turn;start=time.monotonic();nodes=0
 def visit(b,remaining):
  nonlocal nodes
  nodes+=1
  if nodes>node_budget or (seconds and time.monotonic()-start>seconds):raise BudgetExceeded()
  if b.is_checkmate():return {'terminal':'checkmate','fen':b.fen()} if b.turn!=attacker else None
  if remaining<=0 or b.is_stalemate() or b.is_insufficient_material() or b.is_seventyfive_moves() or b.is_fivefold_repetition():return None
  # Claims are defensive resources, even if the defender can choose not to claim.
  if b.turn!=attacker and (b.can_claim_fifty_moves() or b.can_claim_threefold_repetition()):return None
  moves=list(b.legal_moves)
  if b.turn==attacker:
   # Check ordering speeds search but never removes quiet or non-forcing moves.
   moves.sort(key=lambda m:not b.gives_check(m))
   for move in moves:
    b.push(move)
    try:child=visit(b,remaining-1)
    finally:b.pop()
    if child is not None:return {'move':move.uci(),'child':child}
   return None
  replies=[]
  for move in moves:
   b.push(move)
   try:child=visit(b,remaining-1)
   finally:b.pop()
   if child is None:return None
   replies.append({'move':move.uci(),'child':child})
  return {'all_defender_replies':replies}
 def root(move):
  board.push(move)
  try:return visit(board,plies-1)
  finally:board.pop()
 result={'status':'verification_incomplete','objective':{'type':'forced_mate_within','plies':plies},'objective_verified':False,'unique_solution_verified':False,'uniqueness_scope':'first move within this exact mate horizon','verifier':VERSION,'history_scope':'FEN plus generated continuation; pre-FEN repetition history is not available'}
 try:
  move=board.parse_uci(first_move);certificate=root(move)
  if certificate is None:
   result['reason']='Intended first move does not force mate within the modeled horizon';return result
  result.update(status='objective_verified',objective_verified=True,certificate={'first_move':first_move,'continuation':certificate})
  if unique:
   alternatives=[];result['alternative_first_move_proofs']=alternatives
   try:
    for other in list(board.legal_moves):
     if other==move:continue
     proof=root(other)
     if proof is not None:alternatives.append({'first_move':other.uci(),'continuation':proof})
    result['alternative_first_move_proofs']=alternatives;result['uniqueness_complete']=True
    if not alternatives:result.update(status='unique_solution_verified',unique_solution_verified=True)
   except BudgetExceeded:result['uniqueness_complete']=False
 except BudgetExceeded:result['reason']='Proof search budget exhausted; no objective promotion'
 finally:
  result['nodes']=nodes;result['seconds']=round(time.monotonic()-start,6)
  if result.get('certificate'):result['certificate_sha256']=hashlib.sha256(json.dumps(result['certificate'],sort_keys=True,separators=(',',':')).encode()).hexdigest()
 return result

def check_certificate(fen,proof,plies):
 """Independently replay the witness and require exact defender move coverage."""
 b=chess.Board(fen);attacker=b.turn
 def walk(node,remaining):
  if node.get('terminal')=='checkmate':return b.is_checkmate() and b.turn!=attacker and node.get('fen')==b.fen()
  if remaining<=0 or b.is_stalemate() or b.is_insufficient_material() or b.is_seventyfive_moves() or b.is_fivefold_repetition():return False
  if b.turn!=attacker and (b.can_claim_fifty_moves() or b.can_claim_threefold_repetition()):return False
  if b.turn==attacker:
   try:m=b.parse_uci(node['move'])
   except (ValueError,KeyError):return False
   b.push(m)
   try:return walk(node['child'],remaining-1)
   finally:b.pop()
  replies=node.get('all_defender_replies',[]);moves=[x.get('move') for x in replies]
  if len(moves)!=len(set(moves)) or set(moves)!={m.uci() for m in b.legal_moves}:return False
  for item in replies:
   b.push_uci(item['move'])
   try:
    if not walk(item['child'],remaining-1):return False
   finally:b.pop()
  return True
 try:first=b.parse_uci(proof['first_move'])
 except (ValueError,KeyError):return False
 b.push(first)
 try:return walk(proof['continuation'],plies-1)
 finally:b.pop()
