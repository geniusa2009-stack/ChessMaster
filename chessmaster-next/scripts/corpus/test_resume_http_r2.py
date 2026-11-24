import json,tempfile,unittest
from pathlib import Path
from http_resume_r2 import final_headers,validator,safe_partial,prefix_sha,validate_range
class ResumeTests(unittest.TestCase):
 def test_final_redirect_validator_only(self):
  r=final_headers('HTTP/1.1 302 Found\r\nETag: "redirect"\r\n\r\nHTTP/2 200\r\nETag: "payload"\r\nContent-Length: 10\r\n\r\n')
  self.assertEqual(validator(r['headers']),('"payload"','etag'))
 def test_changed_prefix_and_validator_refused(self):
  with tempfile.TemporaryDirectory() as t:
   p=Path(t)/'x.part';p.write_bytes(b'abc');s=Path(t)/'state.json';s.write_text(json.dumps({'url':'https://e/x','validator':'"v1"','validator_type':'etag','resume_safe':True,'partial_bytes':3,'partial_sha256':prefix_sha(p)}))
   self.assertTrue(safe_partial(p,s,'https://e/x',{'headers':{'etag':'"v1"'}})[0]);self.assertFalse(safe_partial(p,s,'https://e/x',{'headers':{'etag':'"v2"'}})[0]);p.write_bytes(b'abd');self.assertFalse(safe_partial(p,s,'https://e/x',{'headers':{'etag':'"v1"'}})[0])
 def test_range_must_start_at_verified_byte(self):
  validate_range({'status':206,'headers':{'content-range':'bytes 3-9/10'}},3,10)
  for response in [{'status':200,'headers':{}},{'status':206,'headers':{'content-range':'bytes 0-9/10'}}]:
   with self.assertRaises(ValueError):validate_range(response,3,10)
 def test_weak_etag_is_not_if_range_validator(self):
  self.assertEqual(validator({'etag':'W/"weak"'}),(None,None))
if __name__=='__main__':unittest.main()
