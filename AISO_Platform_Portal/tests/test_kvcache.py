import hashlib
import json
import subprocess
import sys
import unittest
from pathlib import Path as _P

sys.path.insert(0, str(_P(__file__).resolve().parent.parent))
from benchmark import kvcache as kv

ROOT = _P(__file__).resolve().parent.parent
M = json.loads((ROOT / "benchmark/manifests/aiso1_kvcache.manifest.json").read_text())


def stage(installed=True, campaign=None):
    return {"installed_sha256": None, "campaign": campaign}


def state(np1=None, np24=None, ours=False, tail=None, installed=True, chain=False, np8fa=None):
    d = {"stages": {"np1": {"installed_sha256": M["scripts"]["np1"]["runner_sha256"] if installed else "x", "campaign": np1},
                    "np24": {"installed_sha256": M["scripts"]["np24"]["runner_sha256"] if installed else "x", "campaign": np24},
                    "np8fa": {"installed_sha256": M["scripts"]["np8fa"]["runner_sha256"] if installed else "x", "campaign": np8fa}},
         "log": "platform_kvcache_np1_smoke_20261118_100000.log", "tail": tail or []}
    return ("2\n" if ours else "0\n") + ("1\n" if chain else "0\n") + json.dumps(d)


CAMP_PRE = {"name": "AISO1_llamacpp_KV_B1024_NP1_x", "kv_types": ["f16", "q8_0"], "version": "v", "smoke": None, "stages": {"np1": None, "np2": None, "np4": None}, "results": {}, "vs_original": None}
CAMP_SMOKE = {**CAMP_PRE, "smoke": [{"kv_cache_k": "f16", "model": "gemma26", "status": "PASS", "reason": ""}]}
CAMP_DONE = {**CAMP_SMOKE, "stages": {"np1": {"status": "COMPLETE"}, "np2": None, "np4": None}}


def fake(status_out, busy="0", sent=None):
    """Answers like the machine: the status script, the busy check, the deploy (sha256sum) and the start."""
    def run(argv, capture_output=True, text=True, timeout=0, input=None):
        cmd = argv[-1]
        if input is not None:
            sent is not None and sent.append("DEPLOY")
            return subprocess.CompletedProcess(argv, 0, (hashlib.sha256(input).hexdigest() + "  f\n").encode(), b"")
        sent is not None and sent.append(cmd)
        if "STAGES" in cmd or "csv, hashlib" in cmd:
            return subprocess.CompletedProcess(argv, 0, status_out, "")
        if "llama-server" in cmd:                       # executor.busy
            return subprocess.CompletedProcess(argv, 0, busy + "\n", "")
        if "started" in cmd:
            return subprocess.CompletedProcess(argv, 0, "started\n", "")
        if "pkill" in cmd:
            return subprocess.CompletedProcess(argv, 0, "stopped\n", "")
        return subprocess.CompletedProcess(argv, 1, "", "")
    return run


class KvcacheTest(unittest.TestCase):
    def test_manifest_matches_the_script_files_and_they_are_the_downloaded_ones_unchanged(self):
        for k, v in M["scripts"].items():
            self.assertEqual(hashlib.sha256((ROOT / v["runner_file"]).read_bytes()).hexdigest(), v["runner_sha256"], k)

    def test_status_reads_the_campaign_and_marks_the_installed_scripts(self):
        r = kv.status(fake(state(np1=CAMP_SMOKE)))
        self.assertTrue(r["ok"])
        self.assertTrue(r["stages"]["np1"]["installed_ok"])
        self.assertEqual(r["stages"]["np1"]["campaign"]["kv_types"], ["f16", "q8_0"])
        self.assertFalse(r["busy"])
        r2 = kv.status(fake(state(installed=False)))
        self.assertFalse(r2["stages"]["np1"]["installed_ok"], "a changed script on the machine is not trusted")

    def test_status_never_returns_ips_or_home_paths(self):
        camp = {**CAMP_PRE, "version": "llama.cpp at 198.51.100.3 /home/someone/x"}
        r = kv.status(fake(state(np1=camp)))
        text = json.dumps(r)
        self.assertNotIn("198.51.100.3", text)
        self.assertNotIn("/home/someone/", text)

    def test_progress_from_the_log(self):
        tail = ["KV_SMOKE f16 gemma26 PASS", "KV_SMOKE q8_0 gemma26 FAIL", "FORMAL_PASS f16 gemma26 1 4096 2", "NP_STAGE 1 3 / 120"]
        p = kv.progress(tail)
        self.assertEqual([s["status"] for s in p["smoke"]], ["PASS", "FAIL"])
        self.assertEqual(p["formal"][0], {"status": "PASS", "kv": "f16", "model": "gemma26", "np": 1, "input": 4096, "repeat": 2})
        self.assertEqual(p["stage"], {"np": 1, "done": 3, "total": 120})

    def test_order_is_enforced_and_nothing_is_started(self):
        sent = []
        self.assertIn("preflight", kv.start("np1", "smoke", fake(state(), sent=sent))["error"].lower())
        self.assertIn("smoke", kv.start("np1", "run", fake(state(np1=CAMP_PRE)))["error"].lower())
        self.assertIn("NP1", kv.start("np24", "preflight", fake(state(np1=CAMP_SMOKE)))["error"])
        self.assertIn("NP2", kv.start("np24", "run_np4", fake(state(np1=CAMP_DONE, np24=CAMP_SMOKE)))["error"])
        self.assertFalse(any("started" in c or c == "DEPLOY" for c in sent))

    def test_unknown_stage_or_step_is_refused(self):
        for a, b in (("np5", "run"), ("np1", "run_np2"), ("np1", "rm -rf"), ("np24", "run")):
            self.assertFalse(kv.start(a, b, fake(state()))["ok"], (a, b))

    def test_a_running_step_or_a_busy_machine_refuses_to_start(self):
        self.assertIn("already running", kv.start("np1", "preflight", fake(state(ours=True)))["error"])
        sent = []
        r = kv.start("np1", "preflight", fake(state(), busy="3", sent=sent))
        self.assertIn("busy", r["error"])
        self.assertFalse(any("started" in c or c == "DEPLOY" for c in sent), "a busy machine is never touched")

    def test_preflight_deploys_the_checked_script_and_starts_it_in_the_background(self):
        sent = []
        r = kv.start("np1", "preflight", fake(state(), sent=sent))
        self.assertTrue(r["ok"], r)
        self.assertEqual(sent.count("DEPLOY"), 1)
        cmd = [c for c in sent if "started" in c][0]
        self.assertIn("setsid nohup python3 -u $HOME/aiso1_benchmark/kv_cache_B1024_np1/AISO1_KVCache_Matrix_B1024.py preflight", cmd)
        self.assertIn("platform_kvcache_np1_preflight_", cmd)

    def test_np2_run_deploys_both_scripts_and_passes_only_the_np(self):
        sent = []
        r = kv.start("np24", "run_np2", fake(state(np1=CAMP_DONE, np24=CAMP_SMOKE), sent=sent))
        self.assertTrue(r["ok"], r)
        self.assertEqual(sent.count("DEPLOY"), 2, "the wrapper loads the NP1 script, so both are copied")
        cmd = [c for c in sent if "started" in c][0]
        self.assertIn("kv_cache_B1024_np24/AISO1_KVCache_NP24_later.py run --np 2", cmd)

    def test_np8fa_one_click_needs_no_np1_and_deploys_np1_wrapper_and_chain(self):
        sent = []
        r = kv.start("np8fa", "all", fake(state(np1=CAMP_SMOKE), sent=sent))
        self.assertTrue(r["ok"], r)
        self.assertEqual(sent.count("DEPLOY"), 3, "the NP1 script it loads, the NP8 FA wrapper and the chain")
        cmd = [c for c in sent if "started" in c][0]
        self.assertIn("AISO1_KVCache_chain.sh np8fa", cmd)
        self.assertIn("platform_kvcache_np8fa_all_", cmd)

    def test_np8fa_run_starts_the_wrapper_without_an_np_flag(self):
        sent = []
        r = kv.start("np8fa", "run", fake(state(np8fa=CAMP_SMOKE), sent=sent))
        self.assertTrue(r["ok"], r)
        cmd = [c for c in sent if "started" in c][0]
        self.assertIn("kv_cache_B1024_np8fa/AISO1_KVCache_NP8_FA.py run >", cmd)

    def test_audit_only_reads_so_it_may_run_on_a_busy_machine(self):
        r = kv.start("np1", "audit", fake(state(np1=CAMP_SMOKE), busy="2"))
        self.assertTrue(r["ok"], r)

    def test_a_changed_script_file_is_not_deployed(self):
        p = ROOT / M["scripts"]["np1"]["runner_file"]
        orig = p.read_bytes()
        try:
            p.write_bytes(orig + b"\n# changed\n")
            self.assertIn("manifest", kv.start("np1", "preflight", fake(state()))["error"])
        finally:
            p.write_bytes(orig)

    def test_one_click_deploys_the_chain_and_starts_every_step(self):
        sent = []
        r = kv.start("np1", "all", fake(state(), sent=sent))
        self.assertTrue(r["ok"], r)
        self.assertEqual(sent.count("DEPLOY"), 2, "the NP1 script and the chain script")
        cmd = [c for c in sent if "started" in c][0]
        self.assertIn("setsid nohup bash $HOME/aiso1_benchmark/kv_cache_B1024_np1/AISO1_KVCache_chain.sh np1", cmd)
        self.assertIn("platform_kvcache_np1_all_", cmd)

    def test_one_click_while_a_single_step_runs_is_allowed_the_chain_waits(self):
        r = kv.start("np1", "all", fake(state(np1=CAMP_SMOKE, ours=True), busy="3"))
        self.assertTrue(r["ok"], r)

    def test_one_click_twice_is_refused(self):
        self.assertIn("already going", kv.start("np1", "all", fake(state(ours=True, chain=True)))["error"])

    def test_one_click_on_a_machine_used_by_others_is_refused(self):
        sent = []
        self.assertIn("busy", kv.start("np1", "all", fake(state(), busy="4", sent=sent))["error"])
        self.assertFalse(any("started" in c or c == "DEPLOY" for c in sent))

    def test_one_click_np24_needs_np1_first(self):
        self.assertIn("NP1", kv.start("np24", "all", fake(state(np1=CAMP_SMOKE)))["error"])

    def test_status_says_when_the_chain_runs_and_counts_log_lines(self):
        r = kv.status(fake(state(ours=True, chain=True)))
        self.assertTrue(r["chain"])
        self.assertTrue(r["busy"])

    def test_stop_sends_sigint_so_the_script_can_close_its_server(self):
        sent = []
        self.assertTrue(kv.stop(fake(state(), sent=sent))["ok"])
        self.assertIn("pkill -INT -f '[A]ISO1_KVCache_'", sent[0])
        self.assertNotIn("-TERM", sent[0])
        self.assertNotIn("-KILL", sent[0])


if __name__ == "__main__":
    unittest.main()
