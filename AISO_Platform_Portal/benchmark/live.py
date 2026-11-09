"""Measured HTTP jobs against local-only configured services; never formal certification."""
from __future__ import annotations

import copy
import hashlib
import json
import os
import random
import threading
import time
import urllib.request
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlparse

from .benchmark_runner import NoRedirect, measure

SWEEP_INPUTS = (4096, 8192, 16384)
SWEEP_NPS = (1, 2, 4, 5)
_WORDS = ('river stone window garden engine paper signal harbor forest copper window market lantern violin '
          'bridge thunder pillow compass meadow anchor ribbon castle orchard saddle velvet whisper canyon '
          'marble candle island puzzle summit tunnel feather mirror harvest ladder rocket planet button '
          'blanket silver prairie journal kettle lagoon timber ceramic voyage pebble drizzle compass').split()


def _root(endpoint):
    root = endpoint.rstrip('/')
    return root[:-3] if root.endswith('/v1') else root


def _headers(target):
    headers = {'Content-Type': 'application/json'}
    if target.get('api_key_env'):
        headers['Authorization'] = 'Bearer ' + os.environ.get(target['api_key_env'], '')
    return headers


def _call(target, path, payload=None, timeout=30):
    request = urllib.request.Request(_root(target['endpoint']) + path, None if payload is None else json.dumps(payload).encode(), _headers(target))
    with urllib.request.build_opener(NoRedirect).open(request, timeout=timeout) as response:
        return json.load(response)


def server_props(target):
    """llama.cpp /props, best effort. Values are what the server itself reports, never operator-typed."""
    try:
        data = _call(target, '/props', timeout=8)
    except Exception:
        return None
    settings = data.get('default_generation_settings') or {}
    return {'total_slots': data.get('total_slots'), 'n_ctx_reported': settings.get('n_ctx'),
            'build_info': data.get('build_info'), 'model_file': Path(str(data.get('model_path') or '')).name or None,
            'source': 'llama-server /props (n_ctx may be per-slot or total depending on the build)'}


def build_prompt(target, tokens):
    """Deterministic filler text whose server-side token count (incl. special tokens) is exactly `tokens`."""
    rng = random.Random(20261109)
    text = ' '.join(rng.choice(_WORDS) for _ in range(tokens * 2))
    def count(length):
        return len(_call(target, '/tokenize', {'content': text[:length], 'add_special': True}, timeout=60)['tokens'])
    low, high = 1, len(text)
    if count(high) < tokens:
        raise ValueError('Filler text too short for the requested token count.')
    while low < high:
        mid = (low + high) // 2
        if count(mid) >= tokens:
            high = mid
        else:
            low = mid + 1
    for length in [low] + [low + d for d in (-1, 1, -2, 2, -3, 3)]:
        if 1 <= length <= len(text) and count(length) == tokens:
            return text[:length]
    raise ValueError(f'Cannot build an exact {tokens}-token prompt for this tokenizer.')


def summarize(rows):
    """One entry per (NP, input): means over repeats, same field names as the registry datasets."""
    groups = {}
    for row in rows:
        groups.setdefault((row['np'], row.get('input_tokens')), {}).setdefault(row['repeat'], []).append(row)
    mean = lambda values: sum(values) / len(values) if values else None
    out = []
    for (np, tokens), repeats in sorted(groups.items(), key=lambda kv: (kv[0][0], kv[0][1] or 0)):
        ok = all(r['valid'] for batch in repeats.values() for r in batch)
        aggregates = [batch[0].get('aggregate_tps') for batch in repeats.values()]
        requests = [r for batch in repeats.values() for r in batch if r['valid']]
        pick = lambda key, scale=1: mean([r[key] / scale for r in requests if r.get(key) is not None])
        out.append({'np': np, 'input': tokens, 'status': 'PASS' if ok else 'FAIL', 'repeats_done': len(repeats),
                    'ttft_s': pick('ttft_ms', 1000), 'tpot_ms': pick('tpot_ms'), 'decode_tps': pick('decode_tps'),
                    'aggregate_tps': mean([a for a in aggregates if a is not None]) if ok else None,
                    'normalized_tps': mean([a / np for a in aggregates if a is not None]) if ok else None,
                    'repeats_aggregate_tps': [a for a in aggregates]})
    return out


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
        sweep = config.get('mode') == 'sweep'
        if sweep and framework != 'llamacpp':
            raise ValueError('V4 sweep currently supports llama.cpp services only.')
        for key, maximum in [('repeat', 3), ('output_tokens', 1024)] + ([] if sweep else [('np', 4)]):
            value = config.get(key)
            if type(value) is not int or not 1 <= value <= maximum:
                raise ValueError(f'{key} must be an integer from 1 to {maximum}.')
        if sweep:
            for key, allowed in (('inputs', SWEEP_INPUTS), ('nps', SWEEP_NPS)):
                value = config.get(key)
                if not isinstance(value, list) or not value or len(set(value)) != len(value) or any(type(v) is not int or v not in allowed for v in value):
                    raise ValueError(f'{key} must be a non-empty list drawn from {list(allowed)}.')
            prompt = 'sweep'
        else:
            prompt = config.get('prompt')
            if not isinstance(prompt, str) or not prompt.strip() or len(prompt) > 8192:
                raise ValueError('Provide a nonempty prompt up to 8192 characters.')
        target = dict(service_target(machine, framework, config.get('service')))
        models = discover(machine, framework, config.get('service'))
        if config.get('model') not in [m['id'] for m in models]:
            raise ValueError('Select a model returned by this service.')
        target.update(served_model=config['model'], timeout_seconds=600 if sweep else 60)
        props = None
        if sweep:
            props = server_props(target)
            slots = (props or {}).get('total_slots')
            if isinstance(slots, int) and slots < max(config['nps']):
                raise ValueError(f'Server has {slots} slot(s) but the sweep needs NP up to {max(config["nps"])}; restart llama-server with --parallel {max(config["nps"])} (and a context of at least {max(config["nps"])} x 17408).')
        with self.lock:
            if self.active:
                raise ValueError('A live job is already running.')
            self.root.mkdir(parents=True, exist_ok=True)
            job_id = uuid.uuid4().hex
            plan = ([(np, tokens) for np in config['nps'] for tokens in config['inputs']] if sweep else [(config['np'], None)])
            job = {'id': job_id, 'machine_id': machine['machine_id'], 'framework': framework,
                   'config': {k: v for k, v in config.items() if k != 'prompt'},
                   'prompt_sha256': hashlib.sha256(prompt.encode()).hexdigest(),
                   'status': 'running', 'evidence': 'MEASURED_EXPLORATORY',
                   'note': ('V4-style sweep over HTTP: input tokens are verified against the server-reported usage; TTFT = first non-empty text chunk minus request start; '
                            'Aggregate = total output tokens / (last stream end - first request start); prefix cache OFF. Server settings come from llama-server /props where available; '
                            'the model file hash is not checked by the platform. Not a certified formal baseline.' if sweep else
                            'Actual HTTP inference; server settings and exact input-token workload are not certified. Not a formal NP2/NP4 baseline. Timing is client-observed; TPOT is approximate for multi-token chunks.'),
                   'total_requests': sum(np for np, _ in plan) * config['repeat'], 'rows': []}
            if sweep:
                job['server_props'] = props
                job['summary'] = []
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
                    prompts = {}
                    for np, tokens in plan:
                        if tokens and tokens not in prompts and not stop.is_set():
                            prompts[tokens] = build_prompt(target, tokens)
                    job['prompt_sha256_by_input'] = {str(t): hashlib.sha256(p.encode()).hexdigest() for t, p in prompts.items()} if sweep else None
                    for np, tokens in plan:
                        text = prompts[tokens] if sweep else prompt
                        for repeat in range(1, config['repeat'] + 1):
                            if stop.is_set():
                                break
                            barrier = threading.Barrier(np)
                            def one(index):
                                barrier.wait(timeout=30)
                                try:
                                    row = measure(target, {'run': {'framework': framework}, 'workload': {'output_tokens': config['output_tokens'], 'prefix_cache': False}}, text, tokens, stop)
                                    expected = row.get('input_tokens_actual') == tokens if sweep else (type(row.get('input_tokens_actual')) is int and row['input_tokens_actual'] > 0)
                                    row['valid'] = bool(row.get('stream_complete') and row.get('ttft_ms') is not None and expected and row.get('output_tokens_actual') == config['output_tokens'] and row.get('finish_reason') == 'length')
                                    row['error'] = None if row['valid'] else ('Input tokens differ from the target, or incomplete stream / unexpected output usage.' if sweep else 'Incomplete stream or unexpected token usage.')
                                except Exception:
                                    row = {'valid': False, 'error': 'Inference request failed or cancelled.'}
                                return dict(row, request=index, repeat=repeat, np=np, input_tokens=tokens)
                            started = time.perf_counter()
                            with ThreadPoolExecutor(max_workers=np) as pool:
                                batch = list(pool.map(one, range(1, np + 1)))
                            ends = [r['t_end'] for r in batch if 't_end' in r]
                            begins = [r['t_start'] for r in batch if 't_start' in r]
                            duration = (max(ends) - min(begins)) if sweep and len(ends) == len(batch) else time.perf_counter() - started
                            valid = all(r['valid'] for r in batch)
                            for row in batch:
                                row.pop('t_start', None); row.pop('t_end', None)
                                row.update(batch_wall_s=duration, aggregate_tps=sum(r['output_tokens_actual'] for r in batch) / duration if valid else None)
                            with self.lock:
                                job['rows'].extend(batch)
                                if sweep:
                                    job['summary'] = summarize(job['rows'])
                                save()
                            if not valid:
                                break
                        else:
                            continue
                        break
                    with self.lock:
                        job['status'] = 'cancelled' if stop.is_set() else ('completed' if len(job['rows']) == job['total_requests'] and all(r['valid'] for r in job['rows']) else 'failed')
                except Exception as exc:
                    with self.lock:
                        job['status'] = 'failed'
                        job['error'] = str(exc)[:200] if isinstance(exc, ValueError) else 'Job failed before completion.'
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
