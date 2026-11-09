import json
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from benchmark import live
from benchmark.live import LiveJobs, service_target, build_prompt, summarize
from benchmark.machines import load_machines, public_profile


class LiveBenchmarkTests(unittest.TestCase):
    def setUp(self):
        self.machine = load_machines(local_path='/nonexistent')['pro6000-tpi']
        self.machine['live_services'] = {'vllm': [{'id': 'test', 'endpoint': 'http://localhost:9999/v1', 'api_key_env': 'PRIVATE_KEY'}]}
        self.config = {'service': 'test', 'model': 'test-model', 'prompt': 'private prompt', 'np': 2, 'repeat': 1, 'output_tokens': 16}

    def test_endpoint_not_exposed_and_service_allowlist(self):
        profile = json.dumps(public_profile(self.machine))
        self.assertNotIn('localhost:9999', profile)
        self.assertNotIn('PRIVATE_KEY', profile)
        with self.assertRaises(ValueError):
            service_target(self.machine, 'vllm', 'http://arbitrary.invalid')

    def run_job(self, row):
        with tempfile.TemporaryDirectory() as root:
            manager = LiveJobs(root)
            with patch('benchmark.live.discover', return_value=[{'id': 'test-model'}]), patch('benchmark.live.measure', return_value=row):
                manager.start(self.machine, 'vllm', self.config)
                deadline = time.monotonic() + 5
                while manager.active and time.monotonic() < deadline:
                    time.sleep(.01)
                self.assertIsNone(manager.active)
                job = manager.snapshot()['jobs'][0]
                self.assertNotIn('private prompt', json.dumps(job))
                self.assertNotIn('endpoint', json.dumps(job))
                return job

    def test_real_metrics_require_complete_usage_and_stream(self):
        row = {'stream_complete': True, 'ttft_ms': 2, 'input_tokens_actual': 4, 'output_tokens_actual': 16, 'finish_reason': 'length'}
        job = self.run_job(row)
        self.assertEqual(job['status'], 'completed')
        self.assertEqual(len(job['rows']), 2)
        self.assertGreater(job['rows'][0]['aggregate_tps'], 0)
        self.assertEqual(job['evidence'], 'MEASURED_EXPLORATORY')
        failed = self.run_job(dict(row, stream_complete=False))
        self.assertEqual(failed['status'], 'failed')
        self.assertIsNone(failed['rows'][0]['aggregate_tps'])

    def test_invalid_limits_rejected_before_network(self):
        for key, value in [('np', 5), ('repeat', 0), ('output_tokens', True), ('prompt', '')]:
            with self.assertRaises(ValueError), patch('benchmark.live.discover') as network:
                LiveJobs().start(self.machine, 'vllm', dict(self.config, **{key: value}))
            network.assert_not_called()


class SweepTests(unittest.TestCase):
    def setUp(self):
        self.machine = load_machines(local_path='/nonexistent')['aiso1-amd']
        self.machine['live_services'] = {'llamacpp': [{'id': 'g', 'endpoint': 'http://localhost:9999/v1'}]}
        self.config = {'mode': 'sweep', 'service': 'g', 'model': 'm', 'inputs': [4096, 8192], 'nps': [1, 2], 'repeat': 2, 'output_tokens': 1024}

    def run_sweep(self, config=None, slots=5, tokens_ok=True):
        def fake_measure(target, cfg, prompt, expected, stop):
            return {'stream_complete': True, 'ttft_ms': 2000, 'tpot_ms': 50.0, 'decode_tps': 20.0, 'input_tokens_actual': expected if tokens_ok else expected + 1,
                    'output_tokens_actual': 1024, 'finish_reason': 'length', 't_start': 100.0, 't_end': 120.0}
        with tempfile.TemporaryDirectory() as root:
            manager = LiveJobs(root)
            with patch('benchmark.live.discover', return_value=[{'id': 'm'}]), patch('benchmark.live.measure', side_effect=fake_measure), \
                 patch('benchmark.live.server_props', return_value={'total_slots': slots, 'n_ctx_reported': 87040}), patch('benchmark.live.build_prompt', side_effect=lambda t, n: f'prompt-{n}'):
                manager.start(self.machine, 'llamacpp', config or self.config)
                deadline = time.monotonic() + 5
                while manager.active and time.monotonic() < deadline:
                    time.sleep(.01)
                self.assertIsNone(manager.active)
                return manager.snapshot()['jobs'][0]

    def test_sweep_runs_every_np_input_repeat_and_summarizes(self):
        job = self.run_sweep()
        self.assertEqual(job['status'], 'completed')
        self.assertEqual(job['total_requests'], (1 + 2) * 2 * 2)
        self.assertEqual(len(job['rows']), 12)
        self.assertEqual([(g['np'], g['input'], g['status']) for g in job['summary']], [(1, 4096, 'PASS'), (1, 8192, 'PASS'), (2, 4096, 'PASS'), (2, 8192, 'PASS')])
        one, two = job['summary'][0], job['summary'][2]
        self.assertAlmostEqual(one['aggregate_tps'], 1024 / 20)
        self.assertAlmostEqual(two['aggregate_tps'], 2048 / 20)
        self.assertAlmostEqual(two['normalized_tps'], 1024 / 20)
        self.assertAlmostEqual(one['ttft_s'], 2.0)
        self.assertEqual(job['server_props']['total_slots'], 5)
        self.assertNotIn('prompt-4096', json.dumps(job))

    def test_wrong_input_token_count_fails_the_batch(self):
        job = self.run_sweep(tokens_ok=False)
        self.assertEqual(job['status'], 'failed')
        self.assertEqual(len(job['rows']), 1)
        self.assertIsNone(job['rows'][0]['aggregate_tps'])
        self.assertEqual(job['summary'][0]['status'], 'FAIL')

    def test_rejects_too_few_slots_and_bad_lists_before_running(self):
        with self.assertRaises(ValueError):
            self.run_sweep(dict(self.config, nps=[1, 5]), slots=4)
        for key, value in [('inputs', [1000]), ('nps', [3]), ('nps', []), ('inputs', [4096, 4096]), ('repeat', 4)]:
            with self.assertRaises(ValueError), patch('benchmark.live.discover') as network:
                LiveJobs().start(self.machine, 'llamacpp', dict(self.config, **{key: value}))
            network.assert_not_called()
        with self.assertRaises(ValueError):
            LiveJobs().start(self.machine, 'vllm', self.config)

    def test_build_prompt_hits_exact_token_count(self):
        def tokenize(target, path, payload=None, timeout=30):
            self.assertEqual(path, '/tokenize')
            return {'tokens': list(range(1 + len(payload['content']) // 4))}
        with patch('benchmark.live._call', side_effect=tokenize):
            text = build_prompt({'endpoint': 'http://x/v1'}, 4096)
        self.assertEqual(1 + len(text) // 4, 4096)
