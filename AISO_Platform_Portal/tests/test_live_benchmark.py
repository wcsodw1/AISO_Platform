import json
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from benchmark.live import LiveJobs, service_target
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
