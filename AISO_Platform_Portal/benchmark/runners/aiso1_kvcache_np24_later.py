#!/usr/bin/env python3
"""Separate future NP2/NP4 campaign. Run only after reviewing NP1 CSV."""
import importlib.util
import sys
from pathlib import Path

home = Path.home() / 'aiso1_benchmark'
source = home / 'kv_cache_B1024_np1/AISO1_KVCache_Matrix_B1024.py'
if not source.is_file():
    raise SystemExit('Install and complete the NP1 runner first: '+str(source))
spec = importlib.util.spec_from_file_location('aiso1_kv_np1_core', source)
core = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = core
spec.loader.exec_module(core)
core.NPS = (2, 4)
core.HERE = home / 'kv_cache_B1024_np24'
core.STATE = core.HERE / 'campaign.json'
core.main()
