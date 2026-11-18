import sys
from pathlib import Path as _P

sys.path.insert(0, str(_P(__file__).resolve().parent.parent))
import json
import subprocess
import tempfile
import unittest
from pathlib import Path

from benchmark import workflow as wf

ROOT = Path(__file__).resolve().parent.parent


def fake(responses):
    """responses: {substring of the remote command: (returncode, stdout)}; anything else answers rc 1."""
    def run(argv, capture_output=True, text=True, timeout=0):
        cmd = argv[-1]
        for key, (rc, out) in responses.items():
            if key in cmd:
                return subprocess.CompletedProcess(argv, rc, out, "")
        return subprocess.CompletedProcess(argv, 1, "", "")
    return run


class WorkflowTest(unittest.TestCase):
    def test_gpu_parser(self):
        total, free = wf.parse_gpus("0, 61747, 97887\n1, 19, 97887\n2, 96187, 97887\n")
        self.assertEqual((total, free), (3, [1]))

    def test_pro6000_connected_one_gpu_free(self):
        r = wf.check("pro6000", ROOT, fake({"true": (0, ""), "hostname": (0, "pro6000-host\n"), "nvidia-smi": (0, "0, 61747, 97887\n1, 19, 97887\n")}))
        by = {s["id"]: s for s in r["steps"]}
        self.assertEqual(by["connect"]["status"], "ok")
        self.assertEqual(by["command"]["status"], "ok")
        self.assertEqual(by["gpus"]["status"], "warn")          # shared host: only some GPUs free
        self.assertIn("1 of 2 free", by["gpus"]["detail"])
        self.assertEqual(by["smoke"]["status"], "ok")           # the platform smoke PASS is recorded in data/workflow/pro6000.json
        self.assertIn("PASS", by["smoke"]["detail"])
        self.assertEqual([g["id"] for g in r["groups"]], ["terminal", "benchmark", "data"])

    def test_smoke_is_todo_without_a_record(self):
        with tempfile.TemporaryDirectory() as tmp:             # this module never starts a smoke test itself
            self.assertEqual(wf._smoke_step("pro6000", Path(tmp))["status"], "todo")

    def test_aiso1_key_refused_blocks_the_rest(self):
        r = wf.check("aiso1", ROOT, fake({"true": (255, "xyzx@198.51.100.5: Permission denied (publickey,password).")}))
        by = {s["id"]: s for s in r["steps"]}
        self.assertEqual(by["connect"]["status"], "fail")
        self.assertIn("password", by["connect"]["detail"])
        for sid in ("command", "gpus", "smoke"):
            self.assertEqual(by[sid]["status"], "blocked")
        g = {x["id"]: x for x in r["groups"]}
        self.assertEqual(g["terminal"]["status"], "fail")
        self.assertEqual(g["benchmark"]["status"], "blocked")

    def test_no_ip_address_leaks(self):
        r = wf.check("aiso1", ROOT, fake({"true": (255, "xyzx@198.51.100.40: Permission denied")}))
        self.assertNotRegex(json.dumps(r), r"\d+\.\d+\.\d+\.\d+")

    def test_only_read_only_commands(self):
        sent = []

        def run(argv, **kw):
            sent.append(argv[-1])
            return subprocess.CompletedProcess(argv, 0, "x\n", "")
        wf.check("pro6000", ROOT, run)
        for cmd in sent:
            self.assertRegex(cmd, r"^(true|hostname|nvidia-smi --query-gpu=[a-z.,_]+ --format=csv,noheader,nounits)$")

    def test_rollup(self):
        self.assertEqual(wf.rollup(["ok", "ok"]), "ok")
        self.assertEqual(wf.rollup(["ok", "warn"]), "warn")
        self.assertEqual(wf.rollup(["ok", "fail", "warn"]), "fail")
        self.assertEqual(wf.rollup(["todo", "ok"]), "todo")

    def test_unknown_machine(self):
        with self.assertRaises(KeyError):
            wf.check("nope", ROOT)


if __name__ == "__main__":
    unittest.main()
