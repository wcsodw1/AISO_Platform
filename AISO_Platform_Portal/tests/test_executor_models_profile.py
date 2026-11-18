import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path as _P

sys.path.insert(0, str(_P(__file__).resolve().parent.parent))
from benchmark import executor as ex


class ModelsProfileTest(unittest.TestCase):
    def run_script(self, home):
        code = ex.MODELS_PY.format(root="aiso1_benchmark")
        return subprocess.run([sys.executable, "-c", code], env={**os.environ, "HOME": str(home)}, capture_output=True, text=True)

    def campaign(self, home, name, models, age):
        d = _P(home) / "aiso1_benchmark" / "campaigns" / name
        d.mkdir(parents=True)
        (d / "profile.json").write_text(json.dumps({"models": models, "version": "v1\nx", "device_description": "gpu"}))
        t = time.time() - age
        os.utime(d / "profile.json", (t, t))

    def test_a_newer_profile_with_a_model_list_does_not_hide_the_verified_model_table(self):
        with tempfile.TemporaryDirectory() as home:
            self.campaign(home, "AISO1_llamacpp_B1024_x", {"gemma26": {"quant": "Q4", "repo": "r", "bytes": 1}}, 1000)
            self.campaign(home, "AISO1_UX_latency_x", [{"name": "something else"}], 10)      # newest, but not a model table
            p = self.run_script(home)
            self.assertEqual(p.returncode, 0, p.stderr)
            self.assertEqual(list(json.loads(p.stdout)["models"]), ["gemma26"])


if __name__ == "__main__":
    unittest.main()
