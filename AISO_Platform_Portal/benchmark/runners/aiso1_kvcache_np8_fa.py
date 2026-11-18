#!/usr/bin/env python3
"""Separate NP8 campaign with Flash Attention ON: f16 (baseline) vs q8_0 (int8) vs q4_0 (int4).

Platform-owned wrapper (2026-11-18). It loads David's NP1 runner unchanged (sha256-locked
in the manifest) and only overrides what this campaign is about:
  * NPS = (8,), own folder kv_cache_B1024_np8fa -> own campaign AISO1_llamacpp_KV_B1024_NP8_<time>
  * candidate KV types f16 / q8_0 / q4_0 (llama.cpp needs FA for a quantized V cache)
  * --flash-attn on for EVERY type, f16 included, so all three share one condition.
    These numbers are therefore NOT comparable 1:1 with the FA=off NP1 / original F16 results.
  * per-wave wall cap 3600 s (8 concurrent 16384-token prompts on the 31B can pass 1800 s)
Everything else (models, inputs, output 1024, 3 repeats, slots, context, batch, threads,
checkpoints, validation) is the NP1 runner's own code.
"""
import hashlib
import importlib.util
import sys
from pathlib import Path

home = Path.home() / 'aiso1_benchmark'
source = home / 'kv_cache_B1024_np1/AISO1_KVCache_Matrix_B1024.py'
if not source.is_file():
    raise SystemExit('Install the NP1 runner first: '+str(source))
spec = importlib.util.spec_from_file_location('aiso1_kv_np1_core', source)
core = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = core
spec.loader.exec_module(core)

FA = 'on'
SELF_SHA = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()

core.NPS = (8,)
core.CANDIDATES = ('f16', 'q8_0', 'q4_0')
core.WALL_LIMIT = 3600
core.HERE = home / 'kv_cache_B1024_np8fa'
core.STATE = core.HERE / 'campaign.json'

_preflight, _campaign = core.preflight, core.campaign


def preflight(r):
    # The NP1 preflight writes flash_attention='off' as a literal into the profile; record the
    # value this campaign really uses, plus this wrapper's own sha256. Only during preflight.
    def record(**kw):
        if kw.get('flash_attention') == 'off':
            kw['flash_attention'] = FA
        if 'wrapper_sha256' in kw:
            kw['variant'] = dict(name='NP8_FA_ON', sha256=SELF_SHA)
        return dict(**kw)
    core.dict = record
    try:
        return _preflight(r)
    finally:
        del core.dict


def campaign(r):
    root, prof = _campaign(r)
    if (prof.get('variant') or {}).get('sha256') != SELF_SHA or prof['workload'].get('flash_attention') != FA:
        raise RuntimeError('NP8 FA wrapper changed since preflight; preserve existing results')
    return root, prof


def server_for(r, prof, model, np, kv, dest):
    plan = r.load_plan()
    server = r.Server(plan, model, np, dest, core.PORT)
    command = server.command
    for flag in ('--cache-type-k', '--cache-type-v'):
        command[command.index(flag)+1] = kv
    i = command.index('--flash-attn')
    if command[i+1] != 'off':
        raise RuntimeError('Base runner FlashAttention is not the expected off; refusing to guess')
    command[i+1] = FA
    core.atomic(dest/'kv_command_manifest.json', dict(kv_cache_k=kv, kv_cache_v=kv, flash_attn=FA,
        command=command, profile_sha256=r.b.hash_obj(prof)))
    return server


core.preflight, core.campaign, core.server_for = preflight, campaign, server_for
core.main()
