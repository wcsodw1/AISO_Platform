import json
import subprocess
import sys
import unittest
from pathlib import Path as _P

sys.path.insert(0, str(_P(__file__).resolve().parent.parent))
from benchmark import gb10_matrix as gm

SHA = json.loads((_P(__file__).resolve().parent.parent / "benchmark/manifests/gb10_matrix.manifest.json").read_text())["runner_sha256"]
LOG = """starting vLLM (own container sb-gb10-vllm) ...
KV cache capacity: 227404 tokens
CASE NP1 input 65536 output 256
  PASS NP1 in65536 out256  TTFT mean 20.5s max 20.5s  TPOT 80.1 ms  TPS agg 10.1 / norm 10.1
CASE NP1 input 65536 output 512
  FAIL NP1 in65536 out512 0/1 ok; ['timeout']
CASE NP3 input 131072 output 256  KV_TIGHT need 1 > 2, sending anyway
"""


def fake(matrix=0, plat=0, queue=0, sha=SHA, busy="0", log=LOG, logname="ryan_wfp8pre.log", sent=None):
    def run(argv, capture_output=True, text=True, timeout=0, input=None):
        cmd = argv[-1]
        sent is not None and sent.append(cmd)
        if "MATRIX" in cmd:
            body = f"MATRIX {matrix}\nPLAT {plat}\nQUEUE {queue}\nSHA {sha}\nLOG {logname}\n---TAIL---\n{log}"
            return subprocess.CompletedProcess(argv, 0, body, "")
        if "docker ps" in cmd:
            return subprocess.CompletedProcess(argv, 0, busy + "\n", "")
        if "started" in cmd:
            return subprocess.CompletedProcess(argv, 0, "started\n", "")
        if "pkill" in cmd:
            return subprocess.CompletedProcess(argv, 0, "stopped\n", "")
        return subprocess.CompletedProcess(argv, 1, "", "")
    return run


class Gb10MatrixTest(unittest.TestCase):
    def test_manifest_matches_the_script_copy(self):
        import hashlib
        self.assertEqual(hashlib.sha256((_P(__file__).resolve().parent.parent / "benchmark/runners/gb10_vllm_matrix.py").read_bytes()).hexdigest(), SHA)

    def test_parse_cases_now_and_done(self):
        p = gm.parse(LOG.splitlines() + ["DONE x"])
        self.assertEqual([c["status"] for c in p["cases"]], ["PASS", "FAIL"])
        self.assertEqual(p["cases"][0]["ttft_s"], 20.5)
        self.assertEqual(p["cases"][0]["agg"], 10.1)
        self.assertEqual(p["now"], {"np": 3, "input": 131072, "output": 256})
        self.assertTrue(p["done"])

    def test_status_follows_a_hand_started_run_and_says_whose_it_is(self):
        r = gm.status(fake(matrix=1, queue=1))
        self.assertTrue(r["ok"] and r["busy"] and r["running"])
        self.assertFalse(r["ours"], "a run started by hand is not ours: stop is never offered for it")
        self.assertEqual(r["weights"], "fp8pre")
        self.assertEqual(len(r["cases"]), 2)
        self.assertEqual(r["total"], 12)
        self.assertTrue(r["script_ok"])

    def test_weights_from_the_log_name(self):
        self.assertEqual(gm.weights_of("ryan_wint4b.log"), "int4")
        self.assertEqual(gm.weights_of("ryan_plat_fp8_20261118_140000.log"), "fp8")
        self.assertEqual(gm.weights_of("ryan_wfp8pre.log"), "fp8pre")
        self.assertEqual(gm.weights_of("other.log"), "")

    def test_a_finished_run_is_not_hidden_by_a_newer_failed_attempt(self):
        st = [{"log": "ryan_plat_bf16_20261118_145125.log", "pass": 0, "fail": 0, "done": False, "error": "ValueError: boom"},
              {"log": "ryan_matrix.log", "pass": 12, "fail": 0, "done": True, "error": ""}]
        by = gm.by_weights(st, running=False, current="bf16")
        self.assertEqual((by["bf16"]["state"], by["bf16"]["pass"], by["bf16"]["log"]), ("done", 12, "ryan_matrix.log"))
        self.assertEqual(len(by["bf16"]["attempts"]), 2, "the failed attempt is still listed")

    def test_state_running_only_for_the_weights_that_runs_now(self):
        st = [{"log": "ryan_wint4.log", "pass": 0, "fail": 0, "done": False, "error": "ValueError: no memory"}, {"log": "ryan_wfp8.log", "pass": 5, "fail": 0, "done": False, "error": ""}]
        by = gm.by_weights(st, running=False, current="int4")
        self.assertEqual(by["int4"]["state"], "failed")
        self.assertEqual(by["int4"]["error"], "ValueError: no memory")
        self.assertEqual(by["fp8"]["state"], "stopped")
        by = gm.by_weights(st, running=True, current="fp8")
        self.assertEqual(by["fp8"]["state"], "running")
        self.assertNotEqual(by["int4"]["state"], "running")

    def test_hand_started_first_run_log_is_the_bf16_baseline(self):
        self.assertEqual(gm.weights_of("ryan_matrix.log"), "bf16")

    def test_start_uses_only_the_whitelist(self):
        sent = []
        for bad in ("rm -rf", "bf16; reboot", "", "FP8"):
            self.assertFalse(gm.start(bad, fake(sent=sent))["ok"], bad)
        self.assertFalse(any("started" in c for c in sent))

    def test_start_runs_the_fixed_matrix_with_the_chosen_weights_and_a_platform_tag(self):
        sent = []
        r = gm.start("int4", fake(sent=sent))
        self.assertTrue(r["ok"], r)
        cmd = [c for c in sent if "started" in c][0]
        self.assertIn("--nps 1,3,5 --inputs 65536,131072 --outputs 256,512 --tag ryan_plat_int4", cmd)
        self.assertIn('MODEL="cyankiwi/gemma-4-26B-A4B-it-AWQ-4bit"', cmd)
        self.assertIn('EXTRA_VLLM_ARGS="--enforce-eager"', cmd)
        self.assertIn("GPU_MEM_UTIL=0.70", cmd)
        r2 = gm.start("fp8", fake(sent=sent))
        self.assertIn("--quantization fp8", [c for c in sent if "started" in c][-1])

    def test_a_busy_machine_or_the_queue_refuses_to_start(self):
        for kw in ({"queue": 1}, {"matrix": 1}, {"busy": "2"}):
            sent = []
            r = gm.start("bf16", fake(sent=sent, **kw))
            self.assertFalse(r["ok"], kw)
            self.assertFalse(any("started" in c for c in sent), kw)

    def test_a_changed_script_on_the_machine_is_not_started(self):
        sent = []
        r = gm.start("bf16", fake(sha="0" * 64, sent=sent))
        self.assertFalse(r["ok"])
        self.assertIn("manifest", r["error"])
        self.assertFalse(any("started" in c for c in sent))

    def test_stop_only_matches_the_platform_tag_and_uses_sigint(self):
        sent = []
        self.assertTrue(gm.stop(fake(sent=sent))["ok"])
        self.assertIn("pkill -INT -f '[G]B10_vllm_gemma26_matrix\\.py.*--tag ryan_plat_'", sent[0])
        self.assertNotIn("run_quant_queue", sent[0])


if __name__ == "__main__":
    unittest.main()
