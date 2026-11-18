"""The NP8 Flash-Attention-on wrapper, run against a FAKE NP1 core in a temporary HOME (no machine, no GPU)."""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

WRAPPER = Path(__file__).resolve().parent.parent / "benchmark" / "runners" / "aiso1_kvcache_np8_fa.py"
# Mimics the parts of the NP1 runner the wrapper touches: preflight builds the profile with dict(...)
# and a literal flash_attention='off'; server_for / campaign are looked up as module globals by main().
CORE = r'''
import json, sys
from pathlib import Path
NPS=(1,); CANDIDATES=('f16','bf16','q8_0','q4_0'); WALL_LIMIT=1800; PORT=1; HERE=None; STATE=None
def atomic(p,obj): Path(p).parent.mkdir(parents=True,exist_ok=True); Path(p).write_text(json.dumps(obj))
def preflight(r):
    w=dict(np=list(NPS),flash_attention='off',limit=WALL_LIMIT,kv=list(CANDIDATES))
    prof=dict(wrapper_sha256='core',workload=w)
    atomic(HERE/'profile.json',prof); return prof
def campaign(r): return HERE, json.loads((HERE/'profile.json').read_text())
def server_for(r,prof,model,np,kv,dest): raise SystemExit('core server_for must not be used')
class S:
    def __init__(s,*a): s.command=['llama-server','--cache-type-k','f16','--cache-type-v','f16','--flash-attn','off']
class R:
    b=type('B',(),{'hash_obj':staticmethod(lambda o:'h')})
    def load_plan(s): return {}
    Server=S
def main():
    r=R(); preflight(r); root,prof=campaign(r)
    s=server_for(r,prof,'gemma26',8,'q4_0',HERE/'load')
    print(json.dumps(dict(prof=prof,cmd=s.command,check=dict(probe=1))))
'''


class Np8FaTest(unittest.TestCase):
    def run_wrapper(self):
        home = tempfile.mkdtemp()
        d = Path(home) / "aiso1_benchmark" / "kv_cache_B1024_np1"
        d.mkdir(parents=True)
        (d / "AISO1_KVCache_Matrix_B1024.py").write_text(CORE)
        w = Path(home) / "wrapper.py"
        shutil.copy(WRAPPER, w)
        p = subprocess.run([sys.executable, str(w)], env={**os.environ, "HOME": home}, capture_output=True, text=True, timeout=60)
        self.assertEqual(p.returncode, 0, p.stdout + p.stderr)
        return json.loads(p.stdout.strip().splitlines()[-1]), Path(home)

    def test_profile_records_fa_on_np8_and_only_f16_q8_q4(self):
        out, home = self.run_wrapper()
        w = out["prof"]["workload"]
        self.assertEqual(w["flash_attention"], "on")
        self.assertEqual(w["np"], [8])
        self.assertEqual(w["kv"], ["f16", "q8_0", "q4_0"])
        self.assertEqual(w["limit"], 3600)
        self.assertEqual(out["prof"]["variant"]["name"], "NP8_FA_ON")
        self.assertEqual(out["check"], {"probe": 1}, "the dict shim is removed after preflight")

    def test_server_gets_flash_attn_on_and_the_kv_type(self):
        out, home = self.run_wrapper()
        self.assertEqual(out["cmd"], ["llama-server", "--cache-type-k", "q4_0", "--cache-type-v", "q4_0", "--flash-attn", "on"])
        m = json.loads((home / "aiso1_benchmark" / "kv_cache_B1024_np8fa" / "load" / "kv_command_manifest.json").read_text())
        self.assertEqual(m["flash_attn"], "on")


if __name__ == "__main__":
    unittest.main()
