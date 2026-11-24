import unittest
from relations_r2 import position_key,similarity
from popeye_r2 import problem,keys
class RelationNativeTests(unittest.TestCase):
 def test_clocks_do_not_change_position_comparison(self):
  a='7k/8/5KQ1/8/8/8/8/8 w - - 0 1';b=a.replace('0 1','9 17');self.assertEqual(position_key(a),position_key(b))
 def test_castling_changes_position(self):
  a='r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';self.assertNotEqual(position_key(a),position_key(a.replace('KQkq','-')))
 def test_similarity_is_deterministic(self):
  fen='7k/8/5KQ1/8/8/8/8/8 w - - 0 1';self.assertEqual(similarity(fen),similarity(fen))
 def test_native_stipulation_scope(self):
  text,n=problem('7k/8/5KQ1/8/8/8/8/8 w - - 0 1','#1');self.assertIn('NoCastling',text);self.assertEqual(n,1)
  with self.assertRaises(ValueError):problem('7k/8/5KQ1/8/8/8/8/8 w - - 0 1','h#2')
 def test_native_keys_do_not_read_defender_variations(self):
  self.assertEqual(keys(' 1.Qg6-g7 # !\n 1...Kh8-h7\n 2.Kf6-f7\n'),['g6g7'])
if __name__=='__main__':unittest.main()
