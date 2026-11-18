#!/usr/bin/env python3
"""AISO1 KV-cache dtype study; separate campaign, V4 client SSE metrics.

preflight -> smoke -> run -> audit. Never imports old scores as KV results.
"""
import argparse
import csv
import datetime as dt
import fcntl
import hashlib
import importlib.util
import json
import math
import multiprocessing as mp
import os
import re
import statistics
import sys
import traceback
from pathlib import Path

ROOT = Path.home() / 'aiso1_benchmark'
SOURCE = ROOT / 'retest_B1024_20261110/AISO1_B1024.py'
HERE = ROOT / 'kv_cache_B1024_np1'
STATE = HERE / 'campaign.json'
MODELS = ('gemma26', 'gemma31', 'laguna', 'nemotron')
NPS = (1,)
INPUTS = (4096, 8192, 16384)
REPEATS = (1, 2, 3)
# These are candidates, NOT a claim that the installed Vulkan binary supports each.
CANDIDATES = ('f16', 'bf16', 'f32', 'f8_e4m3',
              'q8_0', 'q5_0', 'q5_1', 'q4_0', 'q4_1', 'iq4_nl')
WALL_LIMIT = 1800  # Hard per-wave wall cap; timeout is a failure, never PASS.
PORT = 18082


def sha(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for chunk in iter(lambda: f.read(8 * 1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def read(p):
    return json.loads(Path(p).read_text())


def atomic(p, obj):
    p = Path(p)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_name(p.name + '.tmp.' + str(os.getpid()))
    with tmp.open('x') as f:
        json.dump(obj, f, indent=2, ensure_ascii=False)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, p)
    fd = os.open(p.parent, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def stamp():
    return dt.datetime.now().strftime('%Y%m%d_%H%M%S_%f')


def base():
    spec = importlib.util.spec_from_file_location('aiso1_b1024', SOURCE)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module  # Required by the original runner.
    spec.loader.exec_module(module)
    return module


def choices(helptext, flag):
    # Restrict to the values printed for this flag, not the latest online docs.
    match = re.search(r'(?m)^.*?' + re.escape(flag) + r'\s+TYPE\b([^\n]*)', helptext)
    if not match:
        raise RuntimeError('Installed binary lacks ' + flag)
    start = match.start()
    area = helptext[start:start + 1200]
    # Never borrow a nearby option's allowed list.
    lines = area.splitlines()
    option = re.compile(r'^\s*(?:-[\w-]+,\s*)?--[\w-]+\b')
    area = '\n'.join(lines[:next((i for i in range(1,len(lines))
                                  if option.search(lines[i])),len(lines))])
    line = re.search(r'allowed values:\s*([^\n]+)', area, re.I)
    if not line:
        raise RuntimeError('Cannot parse installed binary choices for ' + flag)
    return {x.lower() for x in re.findall(r'\b(?:f32|f16|bf16|f8_e4m3|q8_0|q5_0|q5_1|q4_0|q4_1|iq4_nl)\b', line.group(1), re.I)}


def preflight(r):
    r.identity()
    plan = r.load_plan()  # Validates existing base runner, binary, file stat.
    if plan.get('errors') or set(MODELS) - set(plan['models']):
        raise RuntimeError('Four verified GGUF models required; base preflight incomplete')
    helptext = r.runtext([plan['binary'], '--help'])
    supported = sorted(set(CANDIDATES) & choices(helptext, '--cache-type-k')
                       & choices(helptext, '--cache-type-v'), key=CANDIDATES.index)
    if not supported or 'f16' not in supported:
        raise RuntimeError('Cannot verify common K/V types in installed binary')
    verified_models = {}
    for key in MODELS:
        m = plan['models'][key]
        print('HASHING', key, flush=True)
        if sha(m['path']) != m['sha256']:
            raise RuntimeError('Model SHA mismatch: ' + key)
        verified_models[key] = m
    if sha(SOURCE) != plan['code_hash']:
        raise RuntimeError('Base runner changed during preflight')
    workload = dict(np=list(NPS), input=list(INPUTS), output=1024, repeat=3,
                    slots=10, context_per_request=18432,
                    total_kv={str(n): n * 18432 for n in NPS},
                    batch=1024, ubatch=512, cpu_threads=20, batch_threads=20,
                    flash_attention='off', cache_prompt=False, cache_ram=0,
                    context_shift=False, fit=False, backend='Vulkan',
                    kv_pairs=[{'k': t, 'v': t} for t in supported],
                    per_wave_wall_limit_s=WALL_LIMIT)
    prof = dict(identity=plan['identity'], binary=plan['binary'],
                binary_sha256=plan['binary_sha256'], version=plan['version'],
                device=plan['device'], base_runner_sha256=sha(SOURCE),
                wrapper_sha256=sha(__file__), metric_source_sha256=plan['metric_source_sha256'],
                metrics=plan['metrics'], models=verified_models, workload=workload,
                note='K=V only; each dtype is a separate experiment; smoke excluded')
    if STATE.exists():
        old = Path(read(STATE)['folder'])
        if read(old/'profile.json') != prof:
            raise RuntimeError('Existing campaign profile differs; preserve existing results')
    else:
        old = ROOT/'campaigns'/('AISO1_llamacpp_KV_B1024_NP'+''.join(map(str,NPS))+'_'+stamp())
        atomic(old/'profile.json', prof)
        atomic(STATE, {'folder': str(old)})
    print('PREFLIGHT_OK', old, 'KV_TYPES', supported, flush=True)


def campaign(r):
    r.identity()
    plan = r.load_plan()
    if not STATE.exists():
        raise RuntimeError('Run preflight first')
    root = Path(read(STATE)['folder']).resolve()
    if root.parent != (ROOT/'campaigns').resolve():
        raise RuntimeError('Invalid campaign path')
    prof = read(root/'profile.json')
    if (prof['base_runner_sha256'] != sha(SOURCE)
            or prof['wrapper_sha256'] != sha(__file__)
            or prof['binary_sha256'] != sha(plan['binary'])
            or prof['models'] != plan['models']):
        raise RuntimeError('Runner, binary or model manifest changed')
    return root, prof


def case_dir(root, kv, model, np, inp):
    return root/('kv_'+kv)/model/f'np{np}_input{inp}'


def valid(p, np, inp, rep, prompt_sha, profile_sha):
    try:
        x = read(p)
        w, rows = x['wave'], x['requests']
        assert x['scope'] == 'FORMAL' and x['np'] == np and x['input_tokens'] == inp
        assert x['repeat'] == rep and x['profile_sha256'] == profile_sha
        assert x['prompt_sha256'] == prompt_sha
        assert w['status'] == 'PASS' and w['repeat'] == rep
        assert w['successful_requests'] == np and len(rows) == np
        assert {int(a['request']) for a in rows} == set(range(1, np+1))
        for a in rows:
            assert a['status'] == 'PASS' and a['repeat'] == rep
            assert a['input_tokens'] == inp and a['output_tokens'] == 1024
            assert a['prompt_sha256'] == prompt_sha and a['np'] == np
            s, f, d = (a[k] for k in ('start_s','first_content_s','stream_done_s'))
            assert all(math.isfinite(v) for v in (s,f,d)) and s <= f < d
            assert math.isclose(a['ttft_s'], f-s, rel_tol=1e-8, abs_tol=1e-6)
            assert math.isclose(a['tpot_ms'], 1000*(d-f)/1023, rel_tol=1e-8, abs_tol=1e-5)
        elapsed = max(a['stream_done_s'] for a in rows)-min(a['start_s'] for a in rows)
        assert elapsed > 0
        assert math.isclose(w['tps_aggregate'],np*1024/elapsed,rel_tol=1e-8)
        assert math.isclose(w['tps_normalized'],w['tps_aggregate']/np,rel_tol=1e-8)
        return x
    except (OSError, KeyError, ValueError, TypeError, AssertionError, ZeroDivisionError):
        return None


def proofs(d, np, inp, prof_hash):
    prompt = d/'prompt.json'
    if not prompt.is_file():
        return []
    h = hashlib.sha256(json.dumps(read(prompt),sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
    found = []
    for rep in REPEATS:
        p = d/f'repeat_{rep}.json'
        if valid(p,np,inp,rep,h,prof_hash):
            found.append(dict(repeat=rep,path=str(p),sha256=sha(p),
                              completed_requests=np,prompt_sha256=h))
        elif p.exists():
            raise RuntimeError('Invalid saved repeat preserved: '+str(p))
    return found


def checkpoint(d, prof, kv, model, np, inp, status, b):
    ph = b.hash_obj(prof)
    rows = proofs(d,np,inp,ph)
    out = dict(status='PASS' if len(rows)==3 else status,
               kv_cache={'k':kv,'v':kv}, model=model, np=np, input_tokens=inp,
               output_tokens=1024, repeat_target=3,
               completed_repeats=[a['repeat'] for a in rows],
               completed_requests=np*len(rows), expected_requests=3*np,
               proofs=rows, profile_sha256=ph,
               model_provenance=prof['models'][model],parameters=prof['workload'],
               metric_source_sha256=prof['metric_source_sha256'],
               updated_at=dt.datetime.now().isoformat())
    atomic(d/'checkpoint_manifest.json',out)
    return out


def worker_wave(r, server, ids, np, rep, path):
    try:
        data,w = r.b.wave(server,ids,np,rep,WALL_LIMIT)
        atomic(path,{'requests':data,'wave':w})
    except BaseException:
        atomic(path,{'error':traceback.format_exc()})


def bounded_wave(r, server, ids, np, rep, dest):
    p = dest/('worker_'+stamp()+'.json')
    worker = mp.get_context('fork').Process(target=worker_wave,args=(r,server,ids,np,rep,p))
    worker.start()
    worker.join(WALL_LIMIT)
    if worker.is_alive():
        worker.terminate();worker.join(10)
        if worker.is_alive():
            worker.kill();worker.join()
        return {'status':'TIMEOUT','error':f'Hard wave wall limit {WALL_LIMIT}s exceeded'}
    if not p.exists():
        return {'status':'FAIL','error':f'Wave worker exit {worker.exitcode}; no result'}
    out = read(p)
    return {'status':out['wave']['status'],**out} if 'wave' in out else {'status':'FAIL',**out}


def summarize(d, np, inp, prof, kv, model, b):
    ph = b.hash_obj(prof)
    rows = proofs(d,np,inp,ph)
    if len(rows) != 3:
        return False
    waves = [read(d/f'repeat_{rep}.json') for rep in REPEATS]
    req = [a for wave in waves for a in wave['requests']]
    atomic(d/'result.json',dict(status='PASS',kv_cache={'k':kv,'v':kv},
        model=model,np=np,input_tokens=inp,output_tokens=1024,repeats=3,
        expected_requests=3*np,successful_requests=3*np,
        profile_sha256=ph,prompt_sha256=waves[0]['prompt_sha256'],
        ttft_ms=1000*statistics.mean(a['ttft_s'] for a in req),
        tpot_ms=statistics.mean(a['tpot_ms'] for a in req),
        tps_aggregate=statistics.mean(w['wave']['tps_aggregate'] for w in waves),
        tps_normalized=statistics.mean(w['wave']['tps_normalized'] for w in waves),
        model_provenance=prof['models'][model],parameters=prof['workload']))
    checkpoint(d,prof,kv,model,np,inp,'PASS',b)
    return True


KPI = ('ttft_ms','tpot_ms','tps_aggregate','tps_normalized')


def baseline(r, prof, model, inp):
    """Find one verified original AISO1 B1024 F16 NP1 case, never Smoke."""
    candidates = sorted((ROOT/'campaigns').glob('AISO1_llamacpp_B1024_*/profile.json'),
                        key=lambda p:p.parent.stat().st_mtime_ns, reverse=True)
    failures = []
    for p in candidates:
        try:
            old = read(p)
            work = old['workload']
            expected = dict(batch=1024,ubatch=512,slots=10,
                            context_per_request=18432,flash_attention='off',
                            cache_prompt=False,backend='Vulkan',
                            cpu_threads=20,batch_threads=20,split='layer',
                            output=1024,repeat=3)
            if any(work.get(k)!=v for k,v in expected.items()):
                continue
            if work.get('kv')!='f16' or work.get('total_kv',{}).get('1')!=18432:
                continue
            if old['metric_source_sha256']!=prof['metric_source_sha256'] or old['metrics']!=prof['metrics']:
                continue
            if (old['models'][model]['sha256']!=prof['models'][model]['sha256']
                    or old['models'][model].get('quant')!=prof['models'][model].get('quant')):
                continue
            # Runtime binary is held fixed for an attributable KV-format experiment.
            if old.get('binary_sha256')!=prof['binary_sha256']:
                failures.append(str(p.parent)+': binary SHA differs')
                continue
            first=p.parent/model/f'np1_input{inp}'
            dirs=[first]+sorted(first.parent.glob(first.name+'_retry_*'),reverse=True)
            for d in dirs:
                result=r.b.reusable(d,r.b.hash_obj(old),1,inp)
                if result and result['status']=='PASS':
                    return dict(result=result,path=str(d/'result.json'),
                                sha256=sha(d/'result.json'),
                                prompt_sha256=result['prompt_sha256'])
        except (OSError,KeyError,ValueError,TypeError):
            continue
    return dict(error='No verified original F16/NP1/3-repeat case with identical '
                'model, binary, metrics and workload; '+('; '.join(failures[:2]) if failures else 'not found'))


def compare_np1(root,prof,r):
    """Write four-KPI paired comparison; absent/mismatched evidence remains blank."""
    data=[]
    for model in MODELS:
        for inp in INPUTS:
            old=baseline(r,prof,model,inp)
            for kv in (x['k'] for x in prof['workload']['kv_pairs']):
                d=case_dir(root,kv,model,1,inp)
                # Reconstruct summary only from validated, complete formal waves.
                complete=len(proofs(d,1,inp,r.b.hash_obj(prof)))==3
                if complete:
                    summarize(d,1,inp,prof,kv,model,r.b)
                new=read(d/'result.json') if complete else None
                status='PENDING';reason='New NP1 formal 3/3 not complete'
                if new and new.get('status')=='PASS':
                    if 'result' not in old:
                        status='BASELINE_UNVERIFIED';reason=old['error']
                    elif new['prompt_sha256']!=old['prompt_sha256']:
                        status='PROMPT_MISMATCH';reason='Old and new prompt token SHA differ'
                    elif not all(math.isfinite(float(new[k])) and math.isfinite(float(old['result'][k]))
                                 and float(old['result'][k])>0 for k in KPI):
                        status='METRIC_INVALID';reason='Missing/non-finite/zero KPI'
                    else:
                        status='COMPARABLE';reason=''
                row=dict(model=model,kv_cache_k=kv,kv_cache_v=kv,np=1,
                         input_tokens=inp,status=status,reason=reason,
                         baseline_result=old.get('path'),baseline_sha256=old.get('sha256'),
                         new_result=str(d/'result.json') if new else None,
                         baseline_prompt_sha256=old.get('prompt_sha256'),
                         new_prompt_sha256=new.get('prompt_sha256') if new else None)
                for k in KPI:
                    row[k+'_baseline']=float(old['result'][k]) if status=='COMPARABLE' else None
                    row[k+'_new']=float(new[k]) if status=='COMPARABLE' else None
                    row[k+'_delta_pct']=None
                    if status=='COMPARABLE':
                        a,b=float(old['result'][k]),float(new[k])
                        row[k+'_delta_pct']=100*((a-b)/a if k in ('ttft_ms','tpot_ms') else (b-a)/a)
                if status=='COMPARABLE' and not math.isclose(float(new['tps_aggregate']),float(new['tps_normalized']),rel_tol=1e-8):
                    row['status']='METRIC_INVALID';row['reason']='NP1 Aggregate != Normalized'
                    for k in KPI:
                        row[k+'_baseline']=row[k+'_new']=row[k+'_delta_pct']=None
                data.append(row)
    atomic(root/'np1_vs_original.json',dict(
        interpretation='Positive delta means lower latency or higher throughput; '
                       'both TPS columns are separately reported but identical at NP1.',
        rows=data))
    with (root/'np1_vs_original.csv').open('w',newline='') as f:
        w=csv.DictWriter(f,fieldnames=list(data[0]))
        w.writeheader();w.writerows(data)
    print('NP1_COMPARABLE',sum(x['status']=='COMPARABLE' for x in data),'/',len(data),
          'REPORT',root/'np1_vs_original.csv',flush=True)


def audit(root,prof,r):
    total = 0
    for kv in (x['k'] for x in prof['workload']['kv_pairs']):
        for model in MODELS:
            for np in NPS:
                for inp in INPUTS:
                    d=case_dir(root,kv,model,np,inp)
                    reps=[a['repeat'] for a in proofs(d,np,inp,r.b.hash_obj(prof))]
                    total += len(reps)==3
                    print(kv,model,'NP',np,'INPUT',inp,'VERIFIED_REPEATS',reps,flush=True)
    target=len(prof['workload']['kv_pairs'])*len(MODELS)*len(NPS)*len(INPUTS)
    print('KV_VERIFIED_COMPLETE_CASES',total,'/',target,flush=True)
    if 1 in NPS:
        compare_np1(root,prof,r)


def server_for(r,prof,model,np,kv,dest):
    plan=r.load_plan()
    server=r.Server(plan,model,np,dest,PORT)
    command=server.command
    for flag in ('--cache-type-k','--cache-type-v'):
        command[command.index(flag)+1]=kv
    # F16 and quantized dtypes use the same FA=off baseline. Unsupported
    # combinations fail smoke; never silently change another benchmark parameter.
    if command[command.index('--flash-attn')+1]!='off':
        raise RuntimeError('FlashAttention differs from baseline')
    atomic(dest/'kv_command_manifest.json',dict(kv_cache_k=kv,kv_cache_v=kv,
        command=command,profile_sha256=r.b.hash_obj(prof)))
    return server


def smoke(root,prof,r):
    for kv in (x['k'] for x in prof['workload']['kv_pairs']):
        for model in MODELS:
            p=root/('kv_'+kv)/model/'smoke.json'
            if p.exists() and read(p).get('status')=='PASS':
                continue
            server=None
            d=root/('kv_'+kv)/model/'smoke_load'/stamp()
            try:
                server=server_for(r,prof,model,1,kv,d)
                server.start()
                x=bounded_wave(r,server,server.tokens(4096),1,0,d)
                status=x['status']
                if status=='PASS' and (x['wave']['successful_requests']!=1
                                      or x['requests'][0]['output_tokens']!=1024):
                    status='FAIL'
                atomic(p,dict(status=status,scope='SMOKE_ONLY_NOT_FORMAL',
                              kv_cache={'k':kv,'v':kv},result=x,load_dir=str(d)))
            except Exception:
                atomic(p,dict(status='FAIL',scope='SMOKE_ONLY_NOT_FORMAL',
                              error=traceback.format_exc(),load_dir=str(d)))
            finally:
                if server is not None:
                    server.close()
            print('KV_SMOKE',kv,model,read(p)['status'],flush=True)
    export_smoke(root,prof)


def export_smoke(root,prof):
    """Show both unsupported flag values and observed Vulkan smoke outcomes."""
    supported={x['k'] for x in prof['workload']['kv_pairs']}
    fields=['kv_cache_k','kv_cache_v','model','status','reason','evidence_path']
    rows=[]
    for kv in CANDIDATES:
        for model in MODELS:
            p=root/('kv_'+kv)/model/'smoke.json'
            x=read(p) if kv in supported and p.is_file() else {}
            status='UNSUPPORTED_FLAGS' if kv not in supported else x.get('status','PENDING')
            reason='Not in installed binary K/V --help intersection' if kv not in supported else (
                str(x.get('error') or x.get('result',{}).get('error') or '')[:400])
            rows.append(dict(kv_cache_k=kv,kv_cache_v=kv,model=model,status=status,
                             reason=reason,evidence_path=str(p) if x else ''))
    path=root/'kv_smoke_matrix.csv'
    tmp=path.with_name(path.name+'.tmp.'+str(os.getpid()))
    with tmp.open('x',newline='') as f:
        w=csv.DictWriter(f,fieldnames=fields);w.writeheader();w.writerows(rows)
        f.flush();os.fsync(f.fileno())
    os.replace(tmp,path)
    print('KV_SMOKE_CSV',path,flush=True)


def export_np(root,prof,r,np):
    """Reviewable CSV for this NP, including gaps and provenance, saved atomically."""
    fields=['kv_cache_k','kv_cache_v','model','model_sha256','np','input_tokens',
            'output_tokens','target_repeats','verified_repeats','status',
            'ttft_ms','tpot_ms','tps_aggregate','tps_normalized',
            'result_path','checkpoint_path','profile_sha256']
    rows=[]
    ph=r.b.hash_obj(prof)
    for kv in (x['k'] for x in prof['workload']['kv_pairs']):
        for model in MODELS:
            smoke=root/('kv_'+kv)/model/'smoke.json'
            smoke_pass=smoke.is_file() and read(smoke).get('status')=='PASS'
            for inp in INPUTS:
                d=case_dir(root,kv,model,np,inp)
                reps=proofs(d,np,inp,ph)
                complete=len(reps)==3
                result=read(d/'result.json') if complete and (d/'result.json').is_file() else {}
                cp=read(d/'checkpoint_manifest.json') if (d/'checkpoint_manifest.json').is_file() else {}
                status='PASS' if complete and result.get('status')=='PASS' else (
                    'SMOKE_NOT_PASS' if not smoke_pass else cp.get('status','PENDING'))
                rows.append(dict(kv_cache_k=kv,kv_cache_v=kv,model=model,
                    model_sha256=prof['models'][model]['sha256'],np=np,input_tokens=inp,
                    output_tokens=1024,target_repeats=3,
                    verified_repeats=','.join(str(x['repeat']) for x in reps),status=status,
                    ttft_ms=result.get('ttft_ms') if status=='PASS' else None,
                    tpot_ms=result.get('tpot_ms') if status=='PASS' else None,
                    tps_aggregate=result.get('tps_aggregate') if status=='PASS' else None,
                    tps_normalized=result.get('tps_normalized') if status=='PASS' else None,
                    result_path=str(d/'result.json') if status=='PASS' else '',
                    checkpoint_path=str(d/'checkpoint_manifest.json') if cp else '',
                    profile_sha256=ph))
    path=root/f'np{np}_results.csv'
    tmp=path.with_name(path.name+'.tmp.'+str(os.getpid()))
    with tmp.open('x',newline='') as f:
        w=csv.DictWriter(f,fieldnames=fields)
        w.writeheader();w.writerows(rows);f.flush();os.fsync(f.fileno())
    os.replace(tmp,path)
    fd=os.open(root,os.O_RDONLY)
    try:os.fsync(fd)
    finally:os.close(fd)
    complete=sum(x['status']=='PASS' for x in rows)
    atomic(root/f'np{np}_stage.json',dict(np=np,status='COMPLETE' if complete==len(rows) else 'WITH_GAPS',
        completed_cases=complete,total_cases=len(rows),csv_path=str(path),
        updated_at=dt.datetime.now().isoformat()))
    print('NP_STAGE',np,complete,'/',len(rows),'CSV',path,flush=True)


def run(root,prof,r,only_np=None):
    print('CAMPAIGN',root,flush=True)
    if len(NPS)>1 and only_np is None:
        raise RuntimeError('Choose one NP at a time: run --np 2, then inspect CSV before run --np 4')
    if only_np is not None and only_np not in NPS:
        raise RuntimeError('NP not in this campaign: '+str(only_np))
    if only_np==4 and 2 in NPS and not (root/'np2_stage.json').is_file():
        raise RuntimeError('Run NP2 and review np2_results.csv before NP4')
    for np in ((only_np,) if only_np is not None else NPS):
      try:
        for kv in (x['k'] for x in prof['workload']['kv_pairs']):
          for model in MODELS:
            smoke_path=root/('kv_'+kv)/model/'smoke.json'
            if not smoke_path.exists() or read(smoke_path)['status']!='PASS':
                print('SKIP_SMOKE_NOT_PASS',kv,model,flush=True)
                continue
            try:
                if all(summarize(case_dir(root,kv,model,np,i),np,i,prof,kv,model,r.b) for i in INPUTS):
                    continue
                load=root/('kv_'+kv)/model/('load_np'+str(np))/stamp()
                server=None
                try:
                    server=server_for(r,prof,model,np,kv,load)
                    server.start()
                    warm=bounded_wave(r,server,server.tokens(4096),1,0,load)
                    atomic(load/'warmup.json',dict(scope='WARMUP_EXCLUDED',result=warm))
                    if warm['status']!='PASS':
                        raise RuntimeError('Warmup failed: '+str(warm.get('error',warm)))
                    for inp in INPUTS:
                        d=case_dir(root,kv,model,np,inp)
                        if summarize(d,np,inp,prof,kv,model,r.b):
                            continue
                        ids=server.tokens(inp)
                        prompt=d/'prompt.json'
                        if prompt.exists() and read(prompt)!=ids:
                            raise RuntimeError('Saved prompt differs: '+str(prompt))
                        if not prompt.exists():
                            atomic(prompt,ids)
                        prompt_sha=r.b.hash_obj(ids)
                        checkpoint(d,prof,kv,model,np,inp,'IN_PROGRESS',r.b)
                        for rep in REPEATS:
                            if valid(d/f'repeat_{rep}.json',np,inp,rep,prompt_sha,r.b.hash_obj(prof)):
                                continue
                            if (d/f'repeat_{rep}.json').exists():
                                raise RuntimeError('Invalid previous repeat; preserved')
                            x=bounded_wave(r,server,ids,np,rep,d)
                            if x['status']!='PASS':
                                atomic(d/'failed_attempts'/('repeat_'+str(rep)+'_'+stamp()+'.json'),x)
                                checkpoint(d,prof,kv,model,np,inp,x['status'],r.b)
                                print('FORMAL_'+x['status'],kv,model,np,inp,rep,flush=True)
                                if x['status']=='TIMEOUT':
                                    raise RuntimeError('Hard wave timeout; close this server')
                                break
                            for a in x['requests']:
                                a.update(prompt_sha256=prompt_sha,np=np,repeat=rep)
                            record=dict(scope='FORMAL',kv_cache={'k':kv,'v':kv},
                                model=model,np=np,input_tokens=inp,output_tokens=1024,
                                repeat=rep,profile_sha256=r.b.hash_obj(prof),
                                prompt_sha256=prompt_sha,parameters=prof['workload'],
                                model_provenance=prof['models'][model],
                                wave=x['wave'],requests=x['requests'])
                            # Persist PASS only after validating the entire wave.
                            tmp=d/('candidate_'+stamp()+'.json')
                            atomic(tmp,record)
                            if not valid(tmp,np,inp,rep,prompt_sha,r.b.hash_obj(prof)):
                                atomic(d/'failed_attempts'/('invalid_'+stamp()+'.json'),record)
                                tmp.unlink()
                                checkpoint(d,prof,kv,model,np,inp,'FAIL',r.b)
                                break
                            os.replace(tmp,d/f'repeat_{rep}.json')
                            checkpoint(d,prof,kv,model,np,inp,'IN_PROGRESS',r.b)
                            print('FORMAL_PASS',kv,model,np,inp,rep,flush=True)
                        summarize(d,np,inp,prof,kv,model,r.b)
                except Exception:
                    atomic(load/'error.json',dict(error=traceback.format_exc()))
                    print('LOAD_OR_WAVE_FAIL',kv,model,np,load/'error.json',flush=True)
                finally:
                    if server is not None:
                        server.close() # Never overlap a lingering inference server.
            finally:
                export_np(root,prof,r,np) # Also save partial NP review after interruption.
      finally:
        export_np(root,prof,r,np)
      if np==1:
        compare_np1(root,prof,r)
    audit(root,prof,r)


def main():
    p=argparse.ArgumentParser()
    p.add_argument('mode',choices=('preflight','smoke','run','audit'))
    p.add_argument('--np',type=int,choices=(1,2,4),help='Formal run of only this NP')
    args=p.parse_args()
    mode=args.mode
    if args.np is not None and mode!='run':
        p.error('--np applies only to run')
    HERE.mkdir(parents=True,exist_ok=True)
    r=base()
    if mode=='audit':
        root,prof=campaign(r)
        audit(root,prof,r)
        return
    with (ROOT/'benchmark_retest_v4.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        if mode=='preflight':
            preflight(r)
            return
        root,prof=campaign(r)
        r.idle()
        if mode=='smoke':
            smoke(root,prof,r)
        else:
            run(root,prof,r,args.np)


if __name__=='__main__':
    main()
