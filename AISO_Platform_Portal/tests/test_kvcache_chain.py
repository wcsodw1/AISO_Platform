"""The one-click chain script, run against FAKE campaign scripts in a temporary HOME (no machine, no GPU)."""
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

CHAIN = Path(__file__).resolve().parent.parent / "benchmark" / "runners" / "aiso1_kvcache_chain.sh"
FAKE = r'''
import json, sys, pathlib
mode = sys.argv[1]; extra = sys.argv[2:]
b = pathlib.Path.home() / "aiso1_benchmark"; here = pathlib.Path(__file__).parent
log = b / "calls.txt"; log.open("a").write(here.name + " " + " ".join(sys.argv[1:]) + "\n")
state = here / "campaign.json"
if mode == "preflight":
    c = b / "campaigns" / ("C_" + here.name); c.mkdir(parents=True, exist_ok=True); (c / "profile.json").write_text("{}")
    state.write_text(json.dumps({"folder": str(c)})); print("PREFLIGHT_OK")
else:
    c = pathlib.Path(json.loads(state.read_text())["folder"])
    if mode == "smoke":
        (c / "kv_smoke_matrix.csv").write_text("kv_cache_k,kv_cache_v,model,status,reason,evidence_path\nf16,f16,gemma26,PASS,,x\n")
    if mode == "run":
        n = extra[1] if extra else ("8" if here.name.endswith("np8fa") else "1")
        (c / f"np{n}_stage.json").write_text(json.dumps({"status": "COMPLETE"}))
'''


class ChainTest(unittest.TestCase):
    def setUp(self):
        self.home = tempfile.mkdtemp()
        b = Path(self.home) / "aiso1_benchmark"
        for d, name in (("kv_cache_B1024_np1", "AISO1_KVCache_Matrix_B1024.py"), ("kv_cache_B1024_np24", "AISO1_KVCache_NP24_later.py"),
                        ("kv_cache_B1024_np8fa", "AISO1_KVCache_NP8_FA.py")):
            (b / d).mkdir(parents=True)
            (b / d / name).write_text(FAKE)

    def chain(self, stage):
        p = subprocess.run(["bash", str(CHAIN), stage], env={**os.environ, "HOME": self.home}, capture_output=True, text=True, timeout=60)
        calls = (Path(self.home) / "aiso1_benchmark" / "calls.txt")
        return p, calls.read_text().splitlines() if calls.exists() else []

    def test_np1_runs_every_step_once_then_skips_what_is_done(self):
        p, calls = self.chain("np1")
        self.assertEqual(p.returncode, 0, p.stdout + p.stderr)
        self.assertEqual(calls, ["kv_cache_B1024_np1 preflight", "kv_cache_B1024_np1 smoke", "kv_cache_B1024_np1 run"])
        self.assertIn("ALL_DONE", p.stdout)
        p, calls = self.chain("np1")
        self.assertEqual(len(calls), 3, "a second click starts nothing that is already done")
        for s in ("STEP_SKIP preflight", "STEP_SKIP smoke", "STEP_SKIP run"):
            self.assertIn(s, p.stdout)

    def test_np24_runs_np2_then_np4(self):
        p, calls = self.chain("np24")
        self.assertEqual(p.returncode, 0, p.stdout + p.stderr)
        self.assertEqual(calls, ["kv_cache_B1024_np24 preflight", "kv_cache_B1024_np24 smoke", "kv_cache_B1024_np24 run --np 2", "kv_cache_B1024_np24 run --np 4"])

    def test_np8fa_runs_once_and_checks_the_np8_stage_file(self):
        p, calls = self.chain("np8fa")
        self.assertEqual(p.returncode, 0, p.stdout + p.stderr)
        self.assertEqual(calls, ["kv_cache_B1024_np8fa preflight", "kv_cache_B1024_np8fa smoke", "kv_cache_B1024_np8fa run"])
        p, calls = self.chain("np8fa")
        self.assertEqual(len(calls), 3)
        self.assertIn("STEP_SKIP run", p.stdout)

    def test_a_failed_preflight_stops_the_chain(self):
        (Path(self.home) / "aiso1_benchmark" / "kv_cache_B1024_np1" / "AISO1_KVCache_Matrix_B1024.py").write_text("import sys; sys.exit(1)")
        p, _ = self.chain("np1")
        self.assertEqual(p.returncode, 1)
        self.assertIn("STEP_END preflight rc=1", p.stdout)
        self.assertNotIn("STEP_BEGIN smoke", p.stdout)


if __name__ == "__main__":
    unittest.main()
