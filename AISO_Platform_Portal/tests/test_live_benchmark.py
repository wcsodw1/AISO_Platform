import json
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from benchmark import live
from benchmark.live import LiveJobs, service_target, build_ids, summarize
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

    def run_sweep(self, config=None, slots=5, tokens_ok=True, slot_ctx=18432):
        used = []
        def fake_measure(target, ids, slot_id, output_tokens, stop):
            used.append(slot_id)
            return {'valid': tokens_ok, 'stream_complete': True, 'ttft_ms': 2000, 'tpot_ms': 50.0, 'decode_tps': 20.0,
                    'input_tokens_actual': len(ids) if tokens_ok else len(ids) + 1, 'output_tokens_actual': output_tokens,
                    'finish_reason': 'length', 't_start': 100.0, 't_end': 120.0}
        slot_list = [{'id': 10 + i, 'n_ctx': slot_ctx} for i in range(slots)]
        with tempfile.TemporaryDirectory() as root:
            manager = LiveJobs(root)
            with patch('benchmark.live.discover', return_value=[{'id': 'm'}]), patch('benchmark.live.v4_measure', side_effect=fake_measure), \
                 patch('benchmark.live.server_props', return_value={'build_info': 'b'}), patch('benchmark.live.server_slots', return_value=slot_list), \
                 patch('benchmark.live.build_ids', side_effect=lambda t, n: list(range(n))):
                manager.start(self.machine, 'llamacpp', config or self.config)
                deadline = time.monotonic() + 5
                while manager.active and time.monotonic() < deadline:
                    time.sleep(.01)
                self.assertIsNone(manager.active)
                self.used_slots = used
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
        self.assertEqual(len(job['server_props']['slots']), 5)
        self.assertEqual(set(self.used_slots), {10, 11})  # request i is pinned to slot i
        self.assertEqual(set(job['prompt_sha256_by_input']), {'4096', '8192'})

    def test_wrong_input_token_count_fails_the_batch(self):
        job = self.run_sweep(tokens_ok=False)
        self.assertEqual(job['status'], 'failed')
        self.assertEqual(len(job['rows']), 1)
        self.assertIsNone(job['rows'][0]['aggregate_tps'])
        self.assertEqual(job['summary'][0]['status'], 'FAIL')

    def test_rejects_too_few_slots_and_bad_lists_before_running(self):
        with self.assertRaises(ValueError):
            self.run_sweep(dict(self.config, nps=[1, 5]), slots=4)
        with self.assertRaises(ValueError):
            self.run_sweep(dict(self.config, inputs=[16384]), slot_ctx=16000)
        for key, value in [('inputs', [1000]), ('nps', [3]), ('nps', []), ('inputs', [4096, 4096]), ('repeat', 4)]:
            with self.assertRaises(ValueError), patch('benchmark.live.discover') as network:
                LiveJobs().start(self.machine, 'llamacpp', dict(self.config, **{key: value}))
            network.assert_not_called()
        with self.assertRaises(ValueError):
            LiveJobs().start(self.machine, 'vllm', self.config)

    def _session(self, manager, measure, build_info='b', slots=5):
        slot_list = [{'id': 10 + i, 'n_ctx': 18432} for i in range(slots)]
        return [patch('benchmark.live.discover', return_value=[{'id': 'm'}]), patch('benchmark.live.v4_measure', side_effect=measure),
                patch('benchmark.live.server_props', return_value={'build_info': build_info}), patch('benchmark.live.server_slots', return_value=slot_list),
                patch('benchmark.live.build_ids', side_effect=lambda t, n: list(range(n)))]

    def _wait(self, manager):
        deadline = time.monotonic() + 5
        while manager.active and time.monotonic() < deadline:
            time.sleep(.01)
        self.assertIsNone(manager.active)
        return manager.snapshot()['jobs'][0]

    def test_resume_continues_from_the_first_unfinished_round_and_keeps_evidence(self):
        calls = []
        def measure(bad_at):
            def fake(target, ids, slot_id, output_tokens, stop):
                calls.append(slot_id)
                ok = len(calls) != bad_at
                return {'valid': True, 'stream_complete': True, 'ttft_ms': 2000, 'tpot_ms': 50.0, 'decode_tps': 20.0,
                        'input_tokens_actual': len(ids) if ok else len(ids) + 1, 'output_tokens_actual': output_tokens,
                        'finish_reason': 'length', 't_start': 100.0, 't_end': 120.0}
            return fake
        with tempfile.TemporaryDirectory() as root:
            manager = LiveJobs(root)
            ps = self._session(manager, measure(4))
            for p in ps: p.start()
            try:
                manager.start(self.machine, 'llamacpp', self.config)
                first = self._wait(manager)
                self.assertEqual(first['status'], 'failed')
                self.assertEqual(first['progress']['rounds_done'], 3)      # saved after every round
                self.assertEqual(first['progress']['next_round'], [1, 8192, 2])
                self.assertEqual(len(calls), 4)
            finally:
                for p in ps: p.stop()
            calls.clear()
            ps = self._session(manager, measure(0))
            for p in ps: p.start()
            try:
                manager.start(self.machine, 'llamacpp', {'resume_job': first['id']})
                job = self._wait(manager)
            finally:
                for p in ps: p.stop()
            self.assertEqual(job['id'], first['id'])
            self.assertEqual(job['status'], 'completed')
            self.assertEqual(len(job['rows']), 12)
            self.assertEqual(len(calls), 1 + 2 * 4)                         # round 4 again, then NP2 x 4 rounds; finished rounds not rerun
            self.assertEqual(len(job['discarded_rows']), 1)                 # the invalid round is kept as evidence, not mixed in
            self.assertEqual(job['resumes'][0]['rounds_kept'], 3)
            self.assertEqual(sum(1 for r in job['rows'] if r.get('resumed')), 9)
            self.assertEqual(job['progress']['next_round'], None)
            self.assertEqual(job['progress']['rounds_done'], 8)

    def test_resume_refuses_changed_server_wrong_state_and_wrong_machine(self):
        def fake(target, ids, slot_id, output_tokens, stop):
            return {'valid': True, 'stream_complete': True, 'ttft_ms': 1, 'tpot_ms': 1, 'decode_tps': 1, 'input_tokens_actual': len(ids) + 1,
                    'output_tokens_actual': output_tokens, 'finish_reason': 'length', 't_start': 1.0, 't_end': 2.0}
        with tempfile.TemporaryDirectory() as root:
            manager = LiveJobs(root)
            ps = self._session(manager, fake)
            for p in ps: p.start()
            try:
                manager.start(self.machine, 'llamacpp', self.config)
                failed = self._wait(manager)
            finally:
                for p in ps: p.stop()
            self.assertEqual(failed['status'], 'failed')
            ps = self._session(manager, fake, build_info='other-build')
            for p in ps: p.start()
            try:
                with self.assertRaisesRegex(ValueError, 'build_info differs'):
                    manager.start(self.machine, 'llamacpp', {'resume_job': failed['id']})
                with self.assertRaisesRegex(ValueError, 'Invalid job id'):
                    manager.start(self.machine, 'llamacpp', {'resume_job': '../etc/passwd'})
                with self.assertRaisesRegex(ValueError, 'Job not found'):
                    manager.start(self.machine, 'llamacpp', {'resume_job': 'a' * 32})
                with self.assertRaisesRegex(ValueError, 'different machine'):
                    manager.start(dict(self.machine, machine_id='someone-else'), 'llamacpp', {'resume_job': failed['id']})
            finally:
                for p in ps: p.stop()
            path = manager.root / (failed['id'] + '.json')
            done = json.loads(path.read_text()); done['status'] = 'completed'; path.write_text(json.dumps(done))
            with self.assertRaisesRegex(ValueError, 'cannot be resumed'):
                manager.start(self.machine, 'llamacpp', {'resume_job': failed['id']})

    def test_build_ids_matches_b60_v4_prompt(self):
        seen = {}
        def tokenize(target, path, payload=None, timeout=30):
            seen.update(path=path, payload=payload)
            return {'tokens': list(range(100000))}
        with patch('benchmark.live._call', side_effect=tokenize):
            ids = build_ids({'endpoint': 'http://x/v1'}, 4096)
        self.assertEqual(ids, list(range(4096)))
        self.assertEqual(seen['path'], '/tokenize')
        self.assertTrue(seen['payload']['add_special'])
        self.assertTrue(seen['payload']['content'].startswith('Mini workstation inference benchmark.'))
        with patch('benchmark.live._call', return_value={'tokens': [1, 2]}), self.assertRaises(ValueError):
            build_ids({'endpoint': 'http://x/v1'}, 4096)
