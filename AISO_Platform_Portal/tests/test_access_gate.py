import json
import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GATE = (ROOT / "access-gate.js").read_text(encoding="utf-8")


class AccessGate(unittest.TestCase):
    def test_only_a_salted_hash_is_stored(self):
        match = re.search(r'EXPECTED="([0-9a-f]{64})"', GATE)
        self.assertIsNotNone(match, "expected a 64-hex digest constant")
        self.assertNotIn("PLACEHOLDER", GATE)
        self.assertNotRegex(GATE.lower(), r"password\s*[:=]\s*[\"']")

    @unittest.skipUnless(shutil.which("node"), "node is required")
    def test_sha256_matches_node_crypto(self):
        script = (
            "const g=require('./access-gate.js'),c=require('crypto');"
            "const out=['','abc','aiso-gate-v1:X','x'.repeat(200),'中文'].map(t=>g.sha256(t)===c.createHash('sha256').update(t).digest('hex'));"
            "console.log(JSON.stringify(out))"
        )
        result = subprocess.run(["node", "-e", script], cwd=ROOT, capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout), [True] * 5)

    def test_gated_views_and_pages(self):
        app = (ROOT / "app.js").read_text(encoding="utf-8")
        for view in ("categoryView", "modelListView", "resourcesView", "deviceView", "searchView"):
            self.assertIn(f'"{view}"', app.split("GATED_VIEWS")[1].split(")")[0])
        self.assertNotIn('"homeView"', app.split("GATED_VIEWS")[1].split(")")[0])
        self.assertNotIn('"aboutView"', app.split("GATED_VIEWS")[1].split(")")[0])
        self.assertIn("data-gated", (ROOT / "benchmark.html").read_text(encoding="utf-8").split("<head>")[0])
        self.assertIn("access-gate.js", (ROOT / "index.html").read_text(encoding="utf-8"))
        self.assertIn("access-gate.js", (ROOT / "exporter.py").read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
