#!/usr/bin/env python3
"""One manifest, framework adapters, and validated streaming measurements.

Attaches to existing services; never launches remote shell commands or downloads models.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
import re
import threading
import time
import urllib.request
import urllib.parse
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
import yaml
try:
    from .adapters import ADAPTERS
except ImportError:
    from adapters import ADAPTERS

BASE = Path(__file__).resolve().parent
DEFAULT = yaml.safe_load((BASE / 'mini_workstation_benchmark.yaml').read_text())
PLATFORMS = ['intel_b70', 'amd_aiso1', 'nvidia']
MODELS = ['gemma26', 'gemma31', 'nemotron', 'laguna']
MODES = ['formal', 'production-cache']


def validate(config):
    if not isinstance(config, dict) or config.get('schema_version') != 1:
        raise ValueError('Unsupported manifest schema.')
    run, workload = config.get('run', {}), config.get('workload', {})
    for key, allowed in [('platform', PLATFORMS), ('framework', ADAPTERS), ('model', MODELS), ('mode', MODES)]:
        if run.get(key) not in allowed:
            raise ValueError(f'Invalid run.{key}')
    if run['model'] == 'laguna' and run['framework'] == 'vllm' and run['platform'] in PLATFORMS[:2]:
        raise ValueError('Laguna excluded from Intel/AMD vLLM formal set; no validated result.')
    for key, value in DEFAULT['workload'].items():
        expected = run['mode'] == 'production-cache' if key == 'prefix_cache' else value
        if workload.get(key) != expected or type(workload.get(key)) is not type(expected):
            raise ValueError(f'workload.{key} must be {expected}')
    return config


def target_path():
    return Path(os.environ.get('AISO_BENCHMARK_TARGETS', str(Path.home() / '.aiso/benchmark-targets.json'))).expanduser()


def prepare(config, targets_file=None):
    validate(config)
    path = Path(targets_file) if targets_file else target_path()
    if not path.is_file():
        raise ValueError('尚未設定本機 benchmark-targets.json；請依 targets.example.json 填入服務與證據。')
    targets = json.loads(path.read_text())['targets']
    target = next((t for t in targets if all(t.get(k) == v for k, v in config['run'].items())), None)
    if target is None:
        raise ValueError('此 Platform / Framework / Model / Profile 尚未設定服務。')
    if target.get('verified') is not True:
        raise ValueError('Target 尚未完成服務與啟動參數驗證。')
    for key in ['served_model', 'runtime', 'format', 'framework_version', 'repository', 'revision', 'machine']:
        if not isinstance(target.get(key), str) or not target[key].strip():
            raise ValueError(f'Target 缺少 {key}')
    if not re.fullmatch('[a-fA-F0-9]{64}', target.get('model_sha256', '')):
        raise ValueError('Target 缺少 model_sha256（模型或模型檔案 manifest SHA256）')
    endpoint = urllib.parse.urlparse(target.get('endpoint', ''))
    if endpoint.scheme not in {'http', 'https'} or not endpoint.hostname or endpoint.username or endpoint.password or endpoint.query or endpoint.fragment:
        raise ValueError('Invalid configured service endpoint.')
    for key in ['prefix_cache', 'max_model_len', 'max_batched_tokens', 'gpu_memory_utilization']:
        if target.get('server_settings', {}).get(key) != config['workload'][key]:
            raise ValueError(f'伺服器 {key} 與 manifest 不一致；必須先調整服務端。')
    prompts = {}
    for tokens in config['workload']['input_tokens']:
        prompt_path = Path(target.get('prompts', {}).get(str(tokens), '')).expanduser()
        if not prompt_path.is_file():
            raise ValueError(f'缺少 {tokens} tokens 的固定 Prompt 檔案')
        prompt = prompt_path.read_text()
        if not prompt.strip():
            raise ValueError(f'{tokens} tokens 的 Prompt 不可空白')
        prompts[tokens] = prompt
    return target, prompts


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('Service redirects are not allowed.')


def measure(target, config, prompt, expected_input, stop):
    payload = dict(model=target['served_model'], prompt=prompt, max_tokens=config['workload']['output_tokens'],
                   temperature=0, stream=True, stream_options={'include_usage': True})
    payload.update(ADAPTERS[config['run']['framework']].parameters())
    if config['run']['framework'] == 'llamacpp':
        payload['cache_prompt'] = config['workload']['prefix_cache']
    headers = {'Content-Type': 'application/json'}
    key = os.environ.get(target.get('api_key_env', ''), '')
    if key:
        headers['Authorization'] = 'Bearer ' + key
    request = urllib.request.Request(target['endpoint'].rstrip('/') + '/completions', json.dumps(payload).encode(), headers)
    started = time.perf_counter()
    first = last = None
    usage = {}
    done = False
    finish = None
    with urllib.request.build_opener(NoRedirect).open(request, timeout=min(600, max(1, target.get('timeout_seconds', 300)))) as response:
        for line in response:
            if stop.is_set():
                raise ValueError('Cancelled')
            if time.perf_counter() - started > 1800:
                raise ValueError('Request exceeded 1800 seconds')
            if not line.startswith(b'data:'):
                continue
            data = line[5:].strip()
            if data == b'[DONE]':
                done = True
                break
            if not data:
                continue
            event = json.loads(data)
            if 'error' in event:
                raise ValueError('Model service returned an error')
            if event.get('usage'):
                usage = event['usage']
            for choice in event.get('choices', []):
                if choice.get('text'):
                    last = time.perf_counter()
                    if first is None:
                        first = last
                if choice.get('finish_reason'):
                    finish = choice['finish_reason']
    elapsed = time.perf_counter() - started
    output = usage.get('completion_tokens')
    actual_input = usage.get('prompt_tokens')
    valid = (done and first is not None and actual_input == expected_input
             and output == config['workload']['output_tokens'] and finish == 'length')
    # Client-observed stream timing; chunks may contain multiple tokens.
    decode = last - first if first is not None else 0
    return {'valid': valid, 'input_tokens_actual': actual_input, 'output_tokens_actual': output,
            'ttft_ms': (first - started) * 1000 if first is not None else None,
            'tpot_ms': decode * 1000 / (output - 1) if decode > 0 and isinstance(output, int) and output > 1 else None,
            'decode_tps': (output - 1) / decode if decode > 0 and isinstance(output, int) and output > 1 else None,
            'e2e_s': elapsed, 'finish_reason': finish,
            'error': None if valid else 'Full validation failed: require exact prompt/output usage, length finish and DONE.'}


def execute(config, target, prompts, stop, report):
    rows = []
    for np in config['workload']['np']:
        for tokens in config['workload']['input_tokens']:
            for repeat in range(1, config['workload']['repeat'] + 1):
                if stop.is_set():
                    return rows
                barrier = threading.Barrier(np)
                def one(index):
                    barrier.wait(timeout=30)
                    try:
                        result = measure(target, config, prompts[tokens], tokens, stop)
                    except Exception as exc:
                        result = {'valid': False, 'error': f'{type(exc).__name__}: request failed or cancelled'}
                    return dict(result, np=np, input_tokens=tokens, repeat=repeat, request=index,
                                prompt_sha256=hashlib.sha256(prompts[tokens].encode()).hexdigest())
                started = time.perf_counter()
                with ThreadPoolExecutor(max_workers=np) as pool:
                    batch = list(pool.map(one, range(1, np + 1)))
                duration = time.perf_counter() - started
                aggregate = sum(r['output_tokens_actual'] for r in batch) / duration if all(r['valid'] for r in batch) else None
                for row in batch:
                    row.update(batch_wall_s=duration, aggregate_tps=aggregate)
                rows.extend(batch)
                report(rows)
                # Stop invalid workloads early; never label partial data as formal completion.
                if not all(r['valid'] for r in batch):
                    return rows
    return rows


class JobManager:
    def __init__(self, root=None, targets_file=None):
        self.root = Path(root or os.environ.get('AISO_BENCHMARK_RESULTS', str(Path.home() / '.aiso/benchmark-results')))
        self.targets_file = targets_file
        self.lock = threading.RLock()
        self.active = None
        self.stop = threading.Event()

    def snapshot(self):
        with self.lock:
            jobs = []
            if self.root.exists():
                for file in sorted(self.root.glob('*.json'), reverse=True)[:20]:
                    job = json.loads(file.read_text())
                    if job['status'] == 'running' and job['id'] != self.active:
                        job['status'] = 'interrupted'
                    jobs.append(job)
            return {'jobs': jobs, 'active': self.active}

    def start(self, config):
        config = json.loads(json.dumps(config))
        target, prompts = prepare(config, self.targets_file)
        with self.lock:
            if self.active:
                raise ValueError('已有 Benchmark 執行中；請等待或停止。')
            self.root.mkdir(parents=True, exist_ok=True)
            job_id = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S') + '-' + uuid.uuid4().hex[:8]
            job = {'id': job_id, 'status': 'running', 'config': config, 'rows': [],
                   'evidence': {k: target[k] for k in ['runtime', 'format', 'framework_version', 'repository', 'revision', 'model_sha256', 'machine', 'server_settings']},
                   'settings_source': 'operator-attested; not automatically inspected',
                   'timing': 'client-observed streaming; TPOT/decode approximate when chunks contain multiple tokens',
                   'total_requests': sum(config['workload']['np']) * len(prompts) * config['workload']['repeat']}
            self.active = job_id
            self.stop = threading.Event()
            def save(rows):
                with self.lock:
                    job['rows'] = rows
                    path = self.root / (job_id + '.json')
                    temporary = path.with_suffix('.tmp')
                    temporary.write_text(json.dumps(job, ensure_ascii=False, indent=2))
                    temporary.replace(path)
            save([])
            def work():
                try:
                    rows = execute(config, target, prompts, self.stop, save)
                    job['status'] = 'cancelled' if self.stop.is_set() else ('completed' if len(rows) == job['total_requests'] and all(r['valid'] for r in rows) else 'failed')
                except Exception:
                    job['status'] = 'failed'
                finally:
                    with self.lock:
                        save(job['rows'])
                        self.active = None
            threading.Thread(target=work, daemon=True).start()
            return {'id': job_id}

    def cancel(self):
        with self.lock:
            if not self.active:
                raise ValueError('沒有執行中的 Benchmark')
            self.stop.set()
            return {'ok': True, 'message': '停止排程；進行中的連線將於回應或 timeout 後結束。'}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', required=True)
    parser.add_argument('--targets')
    parser.add_argument('--output')
    parser.add_argument('--validate-only', action='store_true')
    args = parser.parse_args()
    config = validate(yaml.safe_load(Path(args.config).read_text()))
    if args.validate_only:
        print('Manifest syntax and policy OK; target/service not checked.')
        return
    manager = JobManager(args.output, args.targets)
    job_id = manager.start(config)['id']
    try:
        while manager.active:
            time.sleep(.2)
    except KeyboardInterrupt:
        manager.cancel()
        while manager.active:
            time.sleep(.2)
    job = next(j for j in manager.snapshot()['jobs'] if j['id'] == job_id)
    print(json.dumps(job, ensure_ascii=False, indent=2))
    raise SystemExit(0 if job['status'] == 'completed' else 1)

if __name__ == '__main__':
    main()
