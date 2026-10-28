"""Measured HTTP jobs against local-only configured services; never formal certification."""
from __future__ import annotations

import copy
import hashlib
import json
import os
import threading
import time
import urllib.request
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlparse

from .benchmark_runner import NoRedirect, measure


def service_target(machine, framework, service_id):
    services = machine.get('live_services', {}).get(framework, [])
    service = next((s for s in services if s['id'] == service_id), None)
    if not service:
        raise ValueError('Service is not configured in machines.local.json.')
    endpoint = urlparse(service.get('endpoint', ''))
    if endpoint.scheme not in ('http', 'https') or not endpoint.hostname or endpoint.username or endpoint.password or endpoint.query or endpoint.fragment:
        raise ValueError('Invalid local service endpoint.')
    return service


def discover(machine, framework, service_id):
    target = service_target(machine, framework, service_id)
    headers = {}
    if target.get('api_key_env'):
        headers['Authorization'] = 'Bearer ' + os.environ.get(target['api_key_env'], '')
    req = urllib.request.Request(target['endpoint'].rstrip('/') + '/models', headers=headers)
    try:
        with urllib.request.build_opener(NoRedirect).open(req, timeout=8) as response:
            data = json.load(response)
        return [{'id': m['id'], 'max_model_len': m.get('max_model_len')} for m in data['data'] if isinstance(m.get('id'), str)]
    except Exception:
        raise ValueError('Model service is unreachable or returned an invalid model list.') from None


class LiveJobs:
    def __init__(self, root=None):
        self.root = Path(root or os.environ.get('AISO_LIVE_RESULTS', str(Path.home() / '.aiso/benchmark-live-results')))
        self.lock = threading.RLock()
        self.active = None
        self.stop = threading.Event()

    def snapshot(self):
        with self.lock:
            jobs = []
            for path in sorted(self.root.glob('*.json'), key=lambda p: p.stat().st_mtime, reverse=True)[:20]:
                job = json.loads(path.read_text())
                if job['status'] == 'running' and job['id'] != self.active:
                    job['status'] = 'interrupted'
                jobs.append(job)
            return {'jobs': jobs, 'active': self.active}

    def start(self, machine, framework, config):
        if framework not in ('vllm', 'llamacpp', 'sglang'):
            raise ValueError('Unsupported live framework.')
        config = copy.deepcopy(config)
        for key, maximum in [('np', 4), ('repeat', 3), ('output_tokens', 1024)]:
            value = config.get(key)
            if type(value) is not int or not 1 <= value <= maximum:
                raise ValueError(f'{key} must be an integer from 1 to {maximum}.')
        prompt = config.get('prompt')
        if not isinstance(prompt, str) or not prompt.strip() or len(prompt) > 8192:
            raise ValueError('Provide a nonempty prompt up to 8192 characters.')
        target = dict(service_target(machine, framework, config.get('service')))
        models = discover(machine, framework, config.get('service'))
        if config.get('model') not in [m['id'] for m in models]:
            raise ValueError('Select a model returned by this service.')
        target.update(served_model=config['model'], timeout_seconds=60)
        with self.lock:
            if self.active:
                raise ValueError('A live job is already running.')
            self.root.mkdir(parents=True, exist_ok=True)
            job_id = uuid.uuid4().hex
            job = {'id': job_id, 'machine_id': machine['machine_id'], 'framework': framework,
                   'config': {k: v for k, v in config.items() if k != 'prompt'},
                   'prompt_sha256': hashlib.sha256(prompt.encode()).hexdigest(),
                   'status': 'running', 'evidence': 'MEASURED_EXPLORATORY',
                   'note': 'Actual HTTP inference; server settings and exact input-token workload are not certified. Not a formal NP2/NP4 baseline. Timing is client-observed; TPOT is approximate for multi-token chunks.',
                   'total_requests': config['np'] * config['repeat'], 'rows': []}
            self.active = job_id
            self.stop = threading.Event()
            stop = self.stop
            def save():
                path = self.root / (job_id + '.json')
                tmp = path.with_suffix('.tmp')
                tmp.write_text(json.dumps(job, ensure_ascii=False, indent=2))
                tmp.replace(path)
            save()
            def work():
                try:
                    for repeat in range(1, config['repeat'] + 1):
                        if stop.is_set():
                            break
                        barrier = threading.Barrier(config['np'])
                        def one(index):
                            barrier.wait(timeout=10)
                            try:
                                row = measure(target, {'run': {'framework': framework}, 'workload': {'output_tokens': config['output_tokens'], 'prefix_cache': False}}, prompt, None, stop)
                                row['valid'] = bool(row.get('stream_complete') and row.get('ttft_ms') is not None and type(row.get('input_tokens_actual')) is int and row['input_tokens_actual'] > 0 and row.get('output_tokens_actual') == config['output_tokens'] and row.get('finish_reason') == 'length')
                                row['error'] = None if row['valid'] else 'Incomplete stream or unexpected token usage.'
                            except Exception:
                                row = {'valid': False, 'error': 'Inference request failed or cancelled.'}
                            return dict(row, request=index, repeat=repeat, np=config['np'])
                        started = time.perf_counter()
                        with ThreadPoolExecutor(max_workers=config['np']) as pool:
                            batch = list(pool.map(one, range(1, config['np'] + 1)))
                        duration = time.perf_counter() - started
                        valid = all(r['valid'] for r in batch)
                        for row in batch:
                            row.update(batch_wall_s=duration, aggregate_tps=sum(r['output_tokens_actual'] for r in batch) / duration if valid else None)
                        with self.lock:
                            job['rows'].extend(batch)
                            save()
                        if not valid:
                            break
                    with self.lock:
                        job['status'] = 'cancelled' if stop.is_set() else ('completed' if len(job['rows']) == job['total_requests'] and all(r['valid'] for r in job['rows']) else 'failed')
                except Exception:
                    with self.lock:
                        job['status'] = 'failed'
                finally:
                    with self.lock:
                        save()
                        self.active = None
            threading.Thread(target=work, daemon=True).start()
            return {'id': job_id}

    def cancel(self):
        with self.lock:
            self.stop.set()
            return {'message': 'Stop requested; in-flight requests finish at their next stream chunk or timeout.'}


SERVICE = LiveJobs()
