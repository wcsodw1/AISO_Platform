import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from benchmark.preflight import run_preflight  # noqa: E402
from benchmark.vendors import VendorError, resolve  # noqa: E402
from benchmark.watchdog import CHOICES, Watchdog, verdict  # noqa: E402

GB = 1 << 30
CMD = {n: ["--batch-size", "1024", "--ubatch-size", "512", "--parallel", "10", "--kv-unified-per-slot", "18432", "--ctx-size", str(n * 18432), "--cache-type-k", "f16"] for n in (1, 2)}
SPEC = {"vendor": "intel", "framework": "llamacpp", "models": ["gemma26"], "np": [1, 2], "gpus_used": 2, "gpu_model": "Arc Pro B70", "runner": "B70_V4_B1024_llamacpp.py", "command_plan": CMD}
REG = {"models": {"gemma26": {"sha256": "aa", "source": "google/gemma-4-26B-A4B-it-qat-q4_0-gguf"}}, "runners": {"B70_V4_B1024_llamacpp.py": {"sha256": "bb"}}, "artifacts": {"intel:llamacpp": {"sha256": "cc"}}}
PROBE = {"ssh": {"batch_ok": True}, "devices": [{"id": "SYCL0", "name": "Intel(R) Arc(TM) Pro B70 Graphics"}, {"id": "SYCL1", "name": "Intel(R) Arc(TM) Pro B70 Graphics"}],
         "processes": [], "models": {"gemma26": {"exists": True, "bytes": 14 * GB, "sha256": "aa"}}, "runner": {"exists": True, "sha256": "bb"}, "artifact": {"sha256": "cc"},
         "vram_free_mib": 32000, "disk_free_gb": 400, "ram_gb": 256, "state_file_exists": False, "manifest_dir_writable": True,
         "snapshot": {"driver": "x", "os": "y", "gpu": "z", "ram_gb": 256}}


def check(spec=None, probe=None, reg=None):
    return run_preflight(spec or SPEC, probe or PROBE, reg or REG)


def status(res, cid):
    return next(r["status"] for r in res["results"] if r["id"] == cid)


class VendorTest(unittest.TestCase):
    def test_devices_assigned_per_vendor(self):
        self.assertEqual(resolve("intel", "llamacpp", 2)["device_list"], "SYCL0,SYCL1")
        self.assertEqual(resolve("amd", "llamacpp", 1)["device_list"], "Vulkan0")
        self.assertEqual(resolve("nvidia", "llamacpp", 2)["device_list"], "CUDA0,CUDA1")

    def test_only_observed_settings_are_verified(self):
        self.assertTrue(resolve("intel", "vllm")["verified"])
        self.assertTrue(resolve("amd", "llamacpp")["verified"])
        self.assertFalse(resolve("amd", "vllm")["verified"])
        self.assertFalse(resolve("nvidia", "vllm")["verified"])
        self.assertIn("smoke test is mandatory", " ".join(resolve("nvidia", "vllm")["caveats"]))

    def test_unknown_inputs_rejected(self):
        for args in (("apple", "llamacpp"), ("intel", "tensorrt"), ("intel", "llamacpp", 0), ("intel", "llamacpp", True)):
            with self.assertRaises(VendorError):
                resolve(*args)


class PreflightTest(unittest.TestCase):
    def test_all_good(self):
        r = check()
        self.assertTrue(r["ok"], r["blocking"])
        self.assertEqual(len(r["results"]), 15)      # E00-E15 (16 checks) minus E09, which only applies to frameworks whose pre-check needs a device

    def mutate(self, fn, expect_id, expect="FAIL", spec=None, reg=None):
        p = copy.deepcopy(PROBE)
        fn(p)
        r = check(spec, p, reg)
        self.assertEqual(status(r, expect_id), expect, expect_id)
        return r

    def test_each_known_bug_is_caught(self):
        self.assertFalse(self.mutate(lambda p: p["ssh"].update(batch_ok=False), "E01")["ok"])
        self.mutate(lambda p: p["devices"].__setitem__(slice(None), [{"id": "SYCL0", "name": "Intel(R) Arc(TM) Pro B60 Graphics"}, {"id": "SYCL1", "name": "Intel(R) Arc(TM) Pro B60 Graphics"}]), "E02")   # card swap
        self.mutate(lambda p: p["devices"].pop(), "E03")                                          # only one of the two cards visible
        self.mutate(lambda p: p["processes"].append("llama-server pid 123"), "E04")
        self.mutate(lambda p: p["models"]["gemma26"].update(exists=False), "E05")
        self.mutate(lambda p: p["models"]["gemma26"].update(sha256="zz"), "E06")
        self.mutate(lambda p: p["runner"].update(sha256="changed"), "E07")
        self.mutate(lambda p: p["artifact"].update(sha256="other-image"), "E08")
        self.mutate(lambda p: p.update(vram_free_mib=233), "E10")                                 # the Nemotron OOM case
        self.mutate(lambda p: p.update(disk_free_gb=1), "E11")
        self.mutate(lambda p: p.update(state_file_exists=True), "E12")
        self.mutate(lambda p: p.update(manifest_dir_writable=False), "E14")

    def test_unverified_model_source_blocks(self):
        reg = copy.deepcopy(REG)
        reg["models"]["gemma26"]["source"] = "UNVERIFIED_LOCAL_SMOKE_ONLY"
        self.mutate(lambda p: None, "E06", reg=reg)

    def test_resume_allows_existing_state(self):
        spec = dict(SPEC, resume=True)
        self.mutate(lambda p: p.update(state_file_exists=True), "E12", expect="PASS", spec=spec)

    def test_protocol_deviation_is_caught(self):
        spec = copy.deepcopy(SPEC)
        spec["command_plan"][1] = [("4096" if x == "1024" else x) for x in spec["command_plan"][1]]      # B60 style batch 4096
        r = check(spec)
        self.assertEqual(status(r, "E13"), "FAIL")
        spec2 = copy.deepcopy(SPEC)
        spec2["command_plan"][2][spec2["command_plan"][2].index("--ctx-size") + 1] = "18432"             # ctx must be NP x 18432
        self.assertEqual(status(check(spec2), "E13"), "FAIL")

    def test_help_check_needs_device_for_vllm(self):
        reg = copy.deepcopy(REG)
        reg["artifacts"]["intel:vllm"] = {"sha256": "cc"}
        spec = dict(SPEC, framework="vllm")
        p = copy.deepcopy(PROBE)
        p["help_check"] = {"with_device": False, "exit_code": 1}
        self.assertEqual(status(check(spec, p, reg), "E09"), "FAIL")
        p["help_check"] = {"with_device": True, "exit_code": 0}
        self.assertEqual(status(check(spec, p, reg), "E09"), "PASS")

    def test_unverified_vendor_warns_and_unknown_fails(self):
        r = check(dict(SPEC, vendor="nvidia", gpu_model="H200"), PROBE)
        self.assertEqual(status(r, "E00"), "WARN")
        self.assertFalse(check(dict(SPEC, vendor="apple"))["ok"])


class WatchdogTest(unittest.TestCase):
    def test_verdicts(self):
        self.assertEqual(verdict(False, 5, True), "dead")
        self.assertEqual(verdict(True, 30, False), "running")
        self.assertEqual(verdict(True, 900, True), "quiet")           # slow round: GPU busy, no log
        self.assertEqual(verdict(True, 900, False), "stalled")

    def run_rounds(self, w, minutes, **kw):
        notice = None
        for m in range(1, minutes + 1):
            n = w.poll(1000 + 60 * m, **kw)
            notice = notice or n
        return notice

    def test_no_notice_before_30_minutes_while_healthy(self):
        w = Watchdog()
        w.start_round(1000, "laguna/NP4/4096/R1")
        self.assertIsNone(self.run_rounds(w, 29, alive=True, log_age_s=10, gpu_busy=True))

    def test_notice_after_30_minutes_with_three_choices(self):
        w = Watchdog()
        w.start_round(1000, "laguna/NP4/4096/R1")
        n = self.run_rounds(w, 30, alive=True, log_age_s=10, gpu_busy=True)
        self.assertEqual(n["kind"], "long_round")
        self.assertEqual(tuple(n["options"]), CHOICES)
        self.assertEqual(n["verdict"], "running")

    def test_slow_but_busy_round_is_not_called_stuck(self):
        w = Watchdog()
        w.start_round(1000, "gemma31/NP4/4096/R1")
        n = self.run_rounds(w, 30, alive=True, log_age_s=2000, gpu_busy=True)
        self.assertEqual(n["verdict"], "quiet")
        self.assertIn("slow, not stuck", n["message"])

    def test_stalled_for_30_polls_notifies_even_if_limit_not_reached(self):
        w = Watchdog(round_limit_s=99999)
        w.start_round(1000, "k")
        n = self.run_rounds(w, 30, alive=True, log_age_s=2000, gpu_busy=False)
        self.assertEqual(n["kind"], "stalled")

    def test_dead_process_notifies_immediately(self):
        w = Watchdog()
        w.start_round(1000, "k")
        n = w.poll(1060, alive=False)
        self.assertEqual(n["kind"], "dead")

    def test_continue_asks_again_after_another_30_minutes_and_never_kills(self):
        w = Watchdog()
        w.start_round(1000, "k")
        self.run_rounds(w, 30, alive=True, log_age_s=10, gpu_busy=True)
        self.assertEqual(w.answer("continue", 1000 + 1800)["action"], "continue")
        self.assertEqual(w.actions, [])
        self.assertIsNone(w.poll(1000 + 1800 + 60, alive=True, log_age_s=10, gpu_busy=True))
        n = None
        for m in range(2, 31):
            n = n or w.poll(1000 + 1800 + 60 * m, alive=True, log_age_s=10, gpu_busy=True)
        self.assertIsNotNone(n)

    def test_skip_choices_are_recorded_for_the_runner(self):
        w = Watchdog()
        w.start_round(1000, "laguna/NP4/4096/R1")
        self.run_rounds(w, 30, alive=True, log_age_s=10, gpu_busy=True)
        self.assertEqual(w.answer("skip_np", 3000), {"action": "skip_np", "round": "laguna/NP4/4096/R1"})
        self.assertEqual(w.actions[-1]["action"], "skip_np")
        with self.assertRaises(ValueError):
            w.answer("continue", 3001)                                  # nothing pending any more
        w.start_round(4000, "next")
        self.run_rounds(w, 30, alive=True, log_age_s=10, gpu_busy=True)
        with self.assertRaises(ValueError):
            w.answer("kill_everything", 6000)


if __name__ == "__main__":
    unittest.main()
