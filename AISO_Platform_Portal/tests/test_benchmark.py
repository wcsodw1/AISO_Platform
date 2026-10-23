import copy
import json
import sys
import tempfile
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from benchmark import benchmark_runner as runner
from launcher import BENCHMARK_BEARER_TOKEN, Handler

class StreamHandler(BaseHTTPRequestHandler):
    short = False
    def log_message(self, *args):
        pass
    def do_POST(self):
        payload = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream')
        self.end_headers()
        self.wfile.write(b'data: {"choices":[{"text":"first"}]}\n\n')
        self.wfile.flush()
        time.sleep(.01)
        count = 12 if self.short else 1024
        event = {'choices': [{'text': 'last', 'finish_reason': 'length'}], 'usage': {'prompt_tokens': int(payload['prompt']), 'completion_tokens': count}}
        self.wfile.write(('data: '+json.dumps(event)+'\n\ndata: [DONE]\n\n').encode())

class BenchmarkTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), StreamHandler)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
    def setUp(self):
        StreamHandler.short = False
        self.config = copy.deepcopy(runner.DEFAULT)
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        prompts = {}
        for tokens in self.config['workload']['input_tokens']:
            p = self.root / str(tokens)
            p.write_text(str(tokens))
            prompts[str(tokens)] = str(p)
        self.target = dict(self.config['run'], verified=True, served_model='fixture', runtime='XPU', format='Safetensors', framework_version='test', repository='fixture', revision='test', machine='mock', model_sha256='a'*64, endpoint=f'http://127.0.0.1:{self.server.server_port}/v1', server_settings={k:self.config['workload'][k] for k in ['prefix_cache','max_model_len','max_batched_tokens','gpu_memory_utilization']}, prompts=prompts)
        self.targets = self.root/'targets.json'
        self.targets.write_text(json.dumps({'targets':[self.target]}))
    def tearDown(self):
        self.temp.cleanup()
    def test_policy_and_exclusion(self):
        runner.validate(self.config)
        self.config['run']['model']='laguna'
        with self.assertRaisesRegex(ValueError,'excluded'):
            runner.validate(self.config)
        self.config['run']['framework']='llamacpp'
        runner.validate(self.config)
        self.config['workload']['prefix_cache']=True
        with self.assertRaisesRegex(ValueError,'prefix_cache'):
            runner.validate(self.config)
        self.config['run']['mode']='production-cache'
        runner.validate(self.config)
    def test_preconditions(self):
        target,prompts=runner.prepare(self.config,self.targets)
        self.assertEqual(len(prompts),5)
        self.target['verified']=False
        self.targets.write_text(json.dumps({'targets':[self.target]}))
        with self.assertRaisesRegex(ValueError,'驗證'):
            runner.prepare(self.config,self.targets)
    def test_stream_usage_and_short_output(self):
        result=runner.measure(self.target,self.config,'4096',4096,threading.Event())
        self.assertTrue(result['valid'])
        self.assertGreater(result['ttft_ms'],0)
        self.assertGreater(result['tpot_ms'],0)
        StreamHandler.short=True
        self.assertFalse(runner.measure(self.target,self.config,'4096',4096,threading.Event())['valid'])
        self.assertFalse(runner.measure(self.target,self.config,'8192',4096,threading.Event())['valid'])
    def test_full_job_and_persisted_evidence(self):
        manager=runner.JobManager(self.root/'results',self.targets)
        result=manager.start(self.config)
        with self.assertRaisesRegex(ValueError,'執行中'):
            manager.start(self.config)
        deadline=time.monotonic()+10
        while manager.active and time.monotonic()<deadline:
            time.sleep(.02)
        self.assertIsNone(manager.active)
        job=manager.snapshot()['jobs'][0]
        self.assertEqual(job['status'],'completed')
        self.assertEqual(len(job['rows']),90)
        self.assertTrue(all(r['aggregate_tps']>0 for r in job['rows']))
        saved=(self.root/'results'/(result['id']+'.json')).read_text()
        self.assertNotIn(self.target['endpoint'],saved)
        self.assertNotIn('api_key',saved)
    def test_failed_batch_stops_and_has_no_aggregate(self):
        StreamHandler.short=True
        target,prompts=runner.prepare(self.config,self.targets)
        rows=runner.execute(self.config,target,prompts,threading.Event(),lambda _:None)
        self.assertEqual(len(rows),2)
        self.assertTrue(all(not r['valid'] and r['aggregate_tps'] is None for r in rows))
    def test_cancel_does_not_schedule(self):
        stop=threading.Event();stop.set()
        self.assertEqual(runner.execute(self.config,self.target,{},stop,lambda _:None),[])
    def test_api_access_boundary(self):
        import urllib.request
        import urllib.error
        server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
        threading.Thread(target=server.serve_forever,daemon=True).start()
        base=f'http://127.0.0.1:{server.server_port}'
        try:
            token={'Authorization':'Bearer '+BENCHMARK_BEARER_TOKEN}
            for headers,expected in [({'Content-Type':'text/plain',**token},415),({'Content-Type':'application/json','Origin':'https://evil.example',**token},403),({'Content-Type':'application/json'},401)]:
                req=urllib.request.Request(base+'/api/benchmark/start',b'{}',headers)
                with self.assertRaises(urllib.error.HTTPError) as error:
                    urllib.request.urlopen(req)
                self.assertEqual(error.exception.code,expected)
            with patch.object(Handler,'is_admin_request',return_value=False):
                with self.assertRaises(urllib.error.HTTPError) as error:
                    urllib.request.urlopen(base+'/api/benchmark/jobs')
                self.assertEqual(error.exception.code,403)
        finally:
            server.shutdown();server.server_close()


if __name__=='__main__':
    unittest.main()
