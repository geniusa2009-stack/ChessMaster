import copy,unittest
import chess
from mate_proof_r2 import prove,check_certificate
class ProofTests(unittest.TestCase):
 def test_exact_mate_and_certificate(self):
  fen='7k/8/5KQ1/8/8/8/8/8 w - - 0 1';r=prove(fen,'g6g7',1)
  self.assertTrue(r['objective_verified']);self.assertTrue(check_certificate(fen,r['certificate'],1));self.assertEqual(r['status'],'unique_solution_verified')
 def test_all_proved_alternative_keys_are_preserved(self):
  fen='k7/2Q5/1K6/8/8/8/8/8 w - - 0 1';r=prove(fen,'c7c8',1)
  self.assertTrue(r['objective_verified']);self.assertFalse(r['unique_solution_verified']);self.assertTrue(r['alternative_first_move_proofs'])
  for certificate in r['alternative_first_move_proofs']:self.assertTrue(check_certificate(fen,certificate,1))
 def test_nonmate_does_not_promote(self):
  r=prove(chess.STARTING_FEN,'e2e4',1);self.assertFalse(r['objective_verified'])
 def test_budget_never_means_verified(self):
  r=prove(chess.STARTING_FEN,'e2e4',3,node_budget=0);self.assertFalse(r['objective_verified']);self.assertEqual(r['status'],'verification_incomplete')
 def test_missing_defender_reply_invalidates_certificate(self):
  # First obtain a genuine multi-reply proof from a legal low-material mate.
  fen='7k/8/5K2/8/8/8/8/6Q1 w - - 0 1';b=chess.Board(fen)
  for m in list(b.legal_moves):
   r=prove(fen,m.uci(),3,seconds=.5,unique=False)
   if r['objective_verified'] and 'all_defender_replies' in r['certificate']['continuation']:
    self.assertTrue(check_certificate(fen,r['certificate'],3));bad=copy.deepcopy(r['certificate']);bad['continuation']['all_defender_replies'].pop();self.assertFalse(check_certificate(fen,bad,3));return
  self.fail('Fixture must have a full-width mate-in-two certificate')
if __name__=='__main__':unittest.main()
