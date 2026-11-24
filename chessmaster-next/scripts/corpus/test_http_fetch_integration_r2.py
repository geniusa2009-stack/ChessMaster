"""Opt-in loopback HTTP tests: no external service or corpus content."""
import hashlib,json,os,tempfile,threading,unittest
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
import acquire
from http_resume_r2 import prefix_sha

@unittest.skipUnless(os.environ.get('CHESSMASTER_TEST_LOCAL_HTTP')=='1','Loopback HTTP fixtures are opt-in')
class FetchIntegrationTests(unittest.TestCase):
 def fixture(self,old_token,unknown_length=False,short_response=False):
  body=b'generated resume fixture\n'*1024;requests=[]
  class Handler(BaseHTTPRequestHandler):
   def log_message(self,*args):pass
   def do_HEAD(self):
    self.send_response(200)
    if not unknown_length:self.send_header('Content-Length',str(len(body)))
    self.send_header('ETag','"current"');self.end_headers()
   def do_GET(self):
    value=self.headers.get('Range');requests.append(value);start=int(value.split('=')[1].split('-')[0]) if value else 0
    end=start+9 if short_response else len(body)-1
    self.send_response(206 if value else 200);self.send_header('ETag','"current"');self.send_header('Content-Length',str(end-start+1))
    if value:self.send_header('Content-Range',f'bytes {start}-{end}/{len(body)}')
    self.end_headers();self.wfile.write(body[start:end+1])
  server=ThreadingHTTPServer(('127.0.0.1',0),Handler);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start();self.addCleanup(server.server_close);self.addCleanup(server.shutdown)
  temp=tempfile.TemporaryDirectory();self.addCleanup(temp.cleanup);root=Path(temp.name);folder=root/'raw/fixture';folder.mkdir(parents=True);partial=folder/'data.bin.part';prefix=body[:137];partial.write_bytes(prefix);url=f'http://127.0.0.1:{server.server_port}/data.bin'
  (folder/'data.bin.resume.json').write_text(json.dumps({'url':url,'validator':old_token,'validator_type':'etag','resume_safe':True,'partial_bytes':len(prefix),'partial_sha256':prefix_sha(partial)}))
  return root,body,prefix,url,requests
 def test_verified_prefix_resumes_and_completed_file_is_not_downloaded_again(self):
  root,body,prefix,url,requests=self.fixture('"current"')
  with patch.object(acquire,'ROOT',root):
   result=acquire.fetch('fixture',url,'data.bin',reserve=0);self.assertEqual(result['status'],'complete');self.assertEqual(requests,['bytes=137-']);self.assertEqual((root/result['path']).read_bytes(),body)
   self.assertEqual(result['sha256'],hashlib.sha256(body).hexdigest());acquire.fetch('fixture',url,'data.bin',reserve=0);self.assertEqual(len(requests),1)
 def test_changed_source_preserves_old_prefix_before_restart(self):
  root,body,prefix,url,requests=self.fixture('"older"')
  with patch.object(acquire,'ROOT',root):result=acquire.fetch('fixture',url,'data.bin',reserve=0)
  self.assertEqual(result['status'],'complete');self.assertEqual(requests,[None]);self.assertEqual((root/result['preserved_partial']['path']).read_bytes(),prefix);self.assertEqual((root/result['path']).read_bytes(),body)
 def test_resume_learns_total_when_head_omits_length(self):
  root,body,prefix,url,requests=self.fixture('"current"',unknown_length=True)
  with patch.object(acquire,'ROOT',root):result=acquire.fetch('fixture',url,'data.bin',reserve=0)
  self.assertEqual(result['status'],'complete');self.assertEqual(result['advertised_bytes'],len(body));self.assertEqual((root/result['path']).read_bytes(),body)
 def test_truncated_range_without_head_size_never_becomes_complete(self):
  root,body,prefix,url,requests=self.fixture('"current"',unknown_length=True,short_response=True)
  with patch.object(acquire,'ROOT',root):result=acquire.fetch('fixture',url,'data.bin',reserve=0)
  self.assertEqual(result['status'],'failed');self.assertFalse((root/'raw/fixture/data.bin').exists());self.assertTrue((root/'raw/fixture/data.bin.part').exists())
if __name__=='__main__':unittest.main()
