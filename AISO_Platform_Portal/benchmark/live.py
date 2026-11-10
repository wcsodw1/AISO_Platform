"""Measured HTTP jobs against local-only configured services; never formal certification."""
from __future__ import annotations

import copy
import datetime
import hashlib
import json
import os
import random
import re
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
# Same fixed text as B60_Benchmark_matrix_v4_261104.py (UNIT) so token ids match the B60 runs.
UNIT = ('Mini workstation inference benchmark. Measure latency throughput '
        'scheduling memory correctness and repeatability.')


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


def server_slots(target):
    """llama-server /slots: per-slot id and n_ctx as the server itself reports them."""
    try:
        data = _call(target, '/slots', timeout=8)
    except Exception:
        return None
    return sorted(({'id': int(x['id']), 'n_ctx': int(x.get('n_ctx', 0))} for x in data), key=lambda x: x['id']) if isinstance(data, list) else None


def build_ids(target, tokens):
    """B60 V4 prompt: tokenize repeated UNIT text (add_special=True) and keep the first `tokens` ids."""
    text = UNIT * max(128, tokens // 10)
    ids = _call(target, '/tokenize', {'content': text, 'add_special': True}, timeout=60).get('tokens')
    if not isinstance(ids, list) or len(ids) < tokens or any(type(t) is not int for t in ids[:tokens]):
        raise ValueError('Tokenization insufficient for the requested input length.')
    return ids[:tokens]


def v4_measure(target, ids, slot_id, output_tokens, stop):
    """One request exactly like the B60 V4 script: native /completion, token-id prompt, pinned slot, cache off."""
    payload = dict(prompt=ids, id_slot=slot_id, n_predict=output_tokens, stream=True, cache_prompt=False,
                   ignore_eos=True, temperature=0, seed=42)
    request = urllib.request.Request(_root(target['endpoint']) + '/completion', json.dumps(payload).encode(), _headers(target))
    started = time.perf_counter()
    first = None
    final = None
    with urllib.request.build_opener(NoRedirect).open(request, timeout=target.get('timeout_seconds', 600)) as response:
        for line in response:
            if stop.is_set():
                raise ValueError('Cancelled')
            if not line.startswith(b'data:'):
                continue
            data = line[5:].strip()
            if data == b'[DONE]':
                break
            event = json.loads(data)
            if event.get('error'):
                raise ValueError('Model service returned an error')
            if event.get('content') and first is None:
                first = time.perf_counter()
            if event.get('stop'):
                final = event
    done = time.perf_counter()
    if final is None or first is None or final.get('truncated'):
        return {'valid': False, 'stream_complete': final is not None, 'error': 'Missing final event / first content, or prompt truncated.'}
    timing = final.get('timings') or {}
    count = int(final.get('tokens_predicted', timing.get('predicted_n', 0)))
    prompt_n = int(timing.get('prompt_n', 0))
    cached = int(timing.get('cache_n', 0))
    ok = prompt_n == len(ids) and count == output_tokens and not cached and started <= first < done
    return {'valid': ok, 'stream_complete': True, 'input_tokens_actual': prompt_n, 'output_tokens_actual': count, 'cached_tokens': cached,
            'ttft_ms': (first - started) * 1000, 'tpot_ms': 1000 * (done - first) / (count - 1) if count > 1 else None,
            'decode_tps': (count - 1) / (done - first) if count > 1 else None, 'e2e_s': done - started,
            'finish_reason': 'length', 't_start': started, 't_end': done,
            'error': None if ok else 'Input/output token mismatch or prompt cache reuse.'}


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


def done_rounds(rows):
    """Rounds (NP, input, repeat) whose NP requests all finished valid. Only whole rounds count as done."""
    groups = {}
    for row in rows:
        groups.setdefault((row.get('np'), row.get('input_tokens'), row.get('repeat')), []).append(row)
    return {key for key, batch in groups.items() if len(batch) == key[0] and all(r.get('valid') for r in batch)}


def progress_of(rows, plan, repeats):
    """Run manifest progress: which rounds are finished and which one runs next (written after every round)."""
    done = done_rounds(rows)
    nxt = next(([np, tokens, rep] for np, tokens in plan for rep in range(1, repeats + 1) if (np, tokens, rep) not in done), None)
    return {'rounds_done': len(done), 'rounds_total': len(plan) * repeats, 'next_round': nxt,
            'updated_at': datetime.datetime.now().astimezone().isoformat(timespec='seconds')}


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
        prior = None
        if config.get('resume_job') is not None:
            prior = self._resumable(config['resume_job'], machine, framework)
            config = copy.deepcopy(prior['config'])  # the interrupted run's own settings are authoritative
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
        props = slots = None
        if sweep:
            props = server_props(target)
            slots = server_slots(target)
            need = max(config['nps'])
            if not slots:
                raise ValueError('Cannot read /slots from llama-server; start it with --slots and --parallel >= the largest NP.')
            if len(slots) < need:
                raise ValueError(f'Server has {len(slots)} slot(s) but the sweep needs NP up to {need}; restart llama-server with --parallel {need} or more.')
            required = max(config['inputs']) + config['output_tokens']
            if min(x['n_ctx'] for x in slots[:need]) < required:
                raise ValueError(f'Per-slot context is {min(x["n_ctx"] for x in slots[:need])} but {required} is needed (largest input + output).')
        if prior:
            old = prior.get('server_props') or {}
            for key in ('model_file', 'build_info'):
                if old.get(key) != (props or {}).get(key):
                    raise ValueError(f'Server {key} differs from the interrupted run ({old.get(key)!r} vs {(props or {}).get(key)!r}); start a new run instead of resuming.')
            need = max(config['nps'])
            if [x.get('n_ctx') for x in (old.get('slots') or [])[:need]] != [x['n_ctx'] for x in slots[:need]]:
                raise ValueError('Per-slot context differs from the interrupted run; start a new run instead of resuming.')
        with self.lock:
            if self.active:
                raise ValueError('A live job is already running.')
            self.root.mkdir(parents=True, exist_ok=True)
            job_id = prior['id'] if prior else uuid.uuid4().hex
            plan = ([(np, tokens) for np in config['nps'] for tokens in config['inputs']] if sweep else [(config['np'], None)])
            job = {'id': job_id, 'machine_id': machine['machine_id'], 'framework': framework,
                   'config': {k: v for k, v in config.items() if k != 'prompt'},
                   'prompt_sha256': hashlib.sha256(prompt.encode()).hexdigest(),
                   'status': 'running', 'evidence': 'MEASURED_EXPLORATORY',
                   'note': ('Follows B60_Benchmark_matrix_v4_261104.py: token-id prompt from the same UNIT text, native /completion with one pinned slot per request, cache_prompt false, seed 42; '
                            'TTFT = first non-empty content minus request start; Aggregate = total output tokens / (last stream end - first request start). Slots and context come from llama-server /slots; '
                            'the model file hash is not checked by the platform. Not a certified formal baseline.' if sweep else
                            'Actual HTTP inference; server settings and exact input-token workload are not certified. Not a formal NP2/NP4 baseline. Timing is client-observed; TPOT is approximate for multi-token chunks.'),
                   'total_requests': sum(np for np, _ in plan) * config['repeat'], 'rows': []}
            if sweep:
                job['server_props'] = dict(props or {}, slots=slots)
                job['summary'] = []
            if prior:
                done = done_rounds(prior['rows'])
                kept = [r for r in prior['rows'] if (r.get('np'), r.get('input_tokens'), r.get('repeat')) in done]
                dropped = [r for r in prior['rows'] if (r.get('np'), r.get('input_tokens'), r.get('repeat')) not in done]
                job = dict(prior, status='running', rows=kept, discarded_rows=prior.get('discarded_rows', []) + dropped)
                job.pop('error', None)
                job['summary'] = summarize(kept)
                job['resumes'] = prior.get('resumes', []) + [{
                    'at': datetime.datetime.now().astimezone().isoformat(timespec='seconds'), 'previous_status': prior['status'],
                    'rounds_kept': len(done), 'rows_discarded': len(dropped), 'server_props': dict(props or {}, slots=slots)}]
            job['progress'] = progress_of(job['rows'], plan, config['repeat'])
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
                            prompts[tokens] = build_ids(target, tokens)
                    hashes = {str(t): hashlib.sha256(json.dumps(p, separators=(',', ':')).encode()).hexdigest() for t, p in prompts.items()} if sweep else None
                    if prior and hashes and any((prior.get('prompt_sha256_by_input') or {}).get(k, v) != v for k, v in hashes.items()):
                        raise ValueError('Prompt token ids differ from the interrupted run (tokenizer or model changed); start a new run instead of resuming.')
                    job['prompt_sha256_by_input'] = hashes
                    finished = done_rounds(job['rows'])
                    for np, tokens in plan:
                        text = prompts[tokens] if sweep else prompt
                        for repeat in range(1, config['repeat'] + 1):
                            if stop.is_set():
                                break
                            if (np, tokens, repeat) in finished:
                                continue
                            barrier = threading.Barrier(np)
                            def one(index):
                                barrier.wait(timeout=30)
                                try:
                                    if sweep:
                                        row = v4_measure(target, text, slots[index - 1]['id'], config['output_tokens'], stop)
                                    else:
                                        row = measure(target, {'run': {'framework': framework}, 'workload': {'output_tokens': config['output_tokens'], 'prefix_cache': False}}, text, tokens, stop)
                                    expected = row.get('input_tokens_actual') == tokens if sweep else (type(row.get('input_tokens_actual')) is int and row['input_tokens_actual'] > 0)
                                    row['valid'] = bool(row.get('stream_complete') and row.get('ttft_ms') is not None and expected and row.get('output_tokens_actual') == config['output_tokens'] and row.get('finish_reason') == 'length' and (row['valid'] if sweep else True))
                                    row['error'] = None if row['valid'] else ('Input tokens differ from the target, or incomplete stream / unexpected output usage.' if sweep else 'Incomplete stream or unexpected token usage.')
                                except Exception:
                                    row = {'valid': False, 'error': 'Inference request failed or cancelled.'}
                                return dict(row, request=index, repeat=repeat, np=np, input_tokens=tokens, **({'resumed': True} if prior else {}))
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
                                job['progress'] = progress_of(job['rows'], plan, config['repeat'])
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

    def _resumable(self, job_id, machine, framework):
        if not isinstance(job_id, str) or not re.fullmatch(r'[0-9a-f]{32}', job_id):
            raise ValueError('Invalid job id.')
        with self.lock:
            path = self.root / (job_id + '.json')
            if not path.is_file():
                raise ValueError('Job not found.')
            job = json.loads(path.read_text())
            if self.active:
                raise ValueError('A live job is already running.')
        status = 'interrupted' if job['status'] == 'running' else job['status']
        if status not in ('interrupted', 'failed', 'cancelled'):
            raise ValueError(f'A {status} job cannot be resumed.')
        if (job.get('config') or {}).get('mode') != 'sweep':
            raise ValueError('Only V4 sweep jobs can be resumed.')
        if job.get('machine_id') != machine['machine_id'] or job.get('framework') != framework:
            raise ValueError('The job belongs to a different machine or framework.')
        job['status'] = status
        return job

    def cancel(self):
        with self.lock:
            self.stop.set()
            return {'message': 'Stop requested; in-flight requests finish at their next stream chunk or timeout.'}


SERVICE = LiveJobs()
