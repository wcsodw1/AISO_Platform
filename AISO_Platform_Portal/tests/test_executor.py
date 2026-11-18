import sys
from pathlib import Path as _P

sys.path.insert(0, str(_P(__file__).resolve().parent.parent))
import json
import subprocess
import unittest

from benchmark import executor as ex
from benchmark.run_auth import is_run_request


def fake(rules, sent=None):
    def run(argv, capture_output=True, text=True, timeout=0, input=None):
        cmd = argv[-1]
        if "[ -e" in cmd:           # the model-file check of the static lists: every listed file "exists" unless the test says otherwise (answered by its number)
            import re as _re
            return subprocess.CompletedProcess(argv, 0, "\n".join(_re.findall(r"echo (\d+)", cmd)), "")
        if input is not None:      # deploy of the runner: answer like sha256sum would
            import hashlib
            sent is not None and sent.append("DEPLOY")
            return subprocess.CompletedProcess(argv, 0, (hashlib.sha256(input).hexdigest() + "  file\n").encode(), b"")
        if sent is not None:
            sent.append(cmd)
        for key, (rc, out) in rules.items():
            if key in cmd:
                return subprocess.CompletedProcess(argv, rc, out, "")
        return subprocess.CompletedProcess(argv, 1, "", "")
    return run


class ExecutorTest(unittest.TestCase):
    def test_models(self):
        out = json.dumps({"models": {"gemma26": {"quant": "Q4_0", "repo": "r/x"}}, "version": "version: 0.6.0-dev (build 1, commit e937b17)", "device": "Vulkan0"})
        r = ex.models("aiso1", fake({"python3 -": (0, out)}))
        self.assertTrue(r["ok"])
        self.assertEqual(r["models"][0]["id"], "gemma26")

    def test_unknown_machine(self):
        with self.assertRaises(KeyError):
            ex.status("b70")

    MODELS_OUT = json.dumps({"models": {"gemma26": {"quant": "Q4_0", "repo": "r/x"}, "laguna": {"quant": "Q4_K_M", "repo": "r/y"}}, "version": "v", "device": "d"})

    def test_start_refused_while_busy(self):
        sent = []
        r = ex.start_smoke("aiso1", ["all"], None, fake({"<<'PY'": (0, self.MODELS_OUT), "pgrep": (0, "2\n")}, sent))
        self.assertFalse(r["ok"])
        self.assertFalse(any("nohup" in c or c == "DEPLOY" for c in sent), "must not copy or start anything while busy")

    def test_unknown_model_is_refused(self):
        sent = []
        r = ex.start_smoke("aiso1", ["nope"], None, fake({"<<'PY'": (0, self.MODELS_OUT), "pgrep": (0, "0\n")}, sent))
        self.assertFalse(r["ok"])
        self.assertNotIn("DEPLOY", sent)

    def test_start_one_model_deploys_the_checked_runner(self):
        sent = []
        r = ex.start_smoke("aiso1", ["laguna"], None, fake({"<<'PY'": (0, self.MODELS_OUT), "pgrep": (0, "0\n"), "nohup": (0, "started\n")}, sent))
        self.assertTrue(r["ok"], r)
        self.assertEqual(r["models"], ["laguna"])
        self.assertIn("DEPLOY", sent)
        starts = [c for c in sent if "nohup" in c]
        self.assertEqual(len(starts), 1)
        self.assertIn("--models laguna", starts[0])
        self.assertIn("(setsid nohup", starts[0])      # backgrounded inside a subshell: the SSH session closes at once

    def test_start_all_models(self):
        sent = []
        r = ex.start_smoke("aiso1", ["all"], None, fake({"<<'PY'": (0, self.MODELS_OUT), "pgrep": (0, "0\n"), "nohup": (0, "started\n")}, sent))
        self.assertTrue(r["ok"])
        self.assertEqual(r["models"], ["gemma26", "laguna"])
        self.assertIn("--models all", [c for c in sent if "nohup" in c][0])

    def test_manifest_matches_the_runner_file(self):
        import hashlib
        m = ex.manifest("aiso1")
        src = ex.BASE.parent / m["runner_file"]
        self.assertEqual(hashlib.sha256(src.read_bytes()).hexdigest(), m["runner_sha256"], "rebuild the manifest after editing the runner")

    def test_deploy_refuses_a_changed_runner(self):
        import json as _j
        from unittest import mock
        m = ex.manifest("aiso1"); m["runner_sha256"] = "0" * 64
        with mock.patch.object(ex, "manifest", return_value=m):
            ok, why = ex.deploy_runner("aiso1", fake({}))
        self.assertFalse(ok)

    def test_status_reports_the_models_of_the_run(self):
        out = "LOG platform_smoke_1.log\nMODELS gemma31\nLOADING: gemma31\n"
        r = ex.status("aiso1", fake({"tail -n": (0, "OURS 1\n" + out), "pgrep": (0, "1\n")}))
        self.assertTrue(r["busy"])
        self.assertFalse(r["external"])
        self.assertEqual(r["run_models"], ["gemma31"])
        self.assertEqual(r["progress"]["gemma31"]["state"], "loading")

    def test_gpu_held_by_other_work_is_not_our_run(self):
        # the machine is busy (GPU in use) but none of OUR runners is running: not shown as "Benchmarking"
        out = "OURS 0\nLOG platform_smoke_1.log\nSMOKE_STATUS: {\"gemma26\": \"PASS\"}\n"
        r = ex.status("pro6000", fake({"tail -n": (0, out), "nvidia-smi": (0, "1\n")}))
        self.assertFalse(r["busy"])
        self.assertTrue(r["external"])

    def test_parse_progress(self):
        lines = ["LOADING: gemma26 LOG: x", "llamacpp/gemma26 NP=1 input=4096 R=1 PASS agg=25.56 norm=25.56", "LOADING: gemma31 LOG: y"]
        p = ex.parse_progress(lines)
        self.assertEqual(p["gemma26"], {"state": "pass", "agg": 25.56})
        self.assertEqual(p["gemma31"]["state"], "loading")

    def test_status_cleans_paths_and_ips(self):
        out = "LOG platform_smoke_1.log\nLOADING: x LOG: /home/xyzx/aiso1_benchmark/server.log host 198.51.100.3\nSMOKE_STATUS: {\"gemma26\": \"PASS\"}\n"
        r = ex.status("aiso1", fake({"tail -n": (0, "OURS 0\n" + out), "pgrep": (0, "0\n")}))
        text = json.dumps(r)
        self.assertNotIn("/home/xyzx", text)
        self.assertNotRegex(text, r"\d+\.\d+\.\d+\.\d+")
        self.assertIn("SMOKE_STATUS", r["result"])
        self.assertFalse(r["busy"])

    # ---- PRO6000: shared host, GPU 1 only ----
    def test_pro6000_manifest_matches_the_runner_file(self):
        import hashlib
        m = ex.manifest("pro6000")
        src = ex.BASE.parent / m["runner_file"]
        self.assertEqual(hashlib.sha256(src.read_bytes()).hexdigest(), m["runner_sha256"], "rebuild the pro6000 manifest after editing the runner")
        self.assertEqual(m["params"]["gpu"], "1 only")

    def test_pro6000_models_are_the_one_gpu_models(self):
        r = ex.models("pro6000", fake({"true": (0, "")}))
        self.assertTrue(r["ok"])
        self.assertEqual([m["id"] for m in r["models"]], ["GPT-OSS-20B"])
        self.assertIn("vLLM", r["version"])

    def test_pro6000_busy_when_gpu1_is_used_or_unreadable(self):
        self.assertFalse(ex.busy("pro6000", fake({"nvidia-smi": (0, "0\n")})))
        self.assertTrue(ex.busy("pro6000", fake({"nvidia-smi": (0, "1\n")})))
        self.assertTrue(ex.busy("pro6000", fake({"nvidia-smi": (1, "")})), "no answer must never count as free")

    def test_pro6000_start_is_refused_when_gpu1_is_not_free(self):
        sent = []
        r = ex.start_smoke("pro6000", ["GPT-OSS-20B"], None, fake({"nvidia-smi": (0, "1\n"), "true": (0, "")}, sent))
        self.assertFalse(r["ok"])
        self.assertNotIn("DEPLOY", sent)
        self.assertFalse(any("nohup" in c for c in sent))

    def test_pro6000_start_deploys_and_starts_the_checked_runner(self):
        sent = []
        r = ex.start_smoke("pro6000", ["all"], None, fake({"nvidia-smi": (0, "0\n"), "nohup": (0, "started\n"), "true": (0, "")}, sent))
        self.assertTrue(r["ok"], r)
        self.assertEqual(r["models"], ["GPT-OSS-20B"])
        self.assertIn("DEPLOY", sent)
        start = [c for c in sent if "nohup" in c][0]
        self.assertIn("pro6000_platform_smoke.py", start)
        self.assertIn("--models all", start)

    def test_unknown_model_is_refused_on_pro6000(self):
        r = ex.start_smoke("pro6000", ["Llama-3.3-70B-Instruct"], None, fake({"nvidia-smi": (0, "0\n"), "true": (0, "")}))
        self.assertFalse(r["ok"])

    def test_parse_progress_vllm_names_with_hyphens(self):
        p = ex.parse_progress(["LOADING: GPT-OSS-20B", "vllm/GPT-OSS-20B NP=1 input=4000 R=1 PASS agg=181.40 ttft_ms=212"])
        self.assertEqual(p["GPT-OSS-20B"], {"state": "pass", "agg": 181.4})

    def test_last_result_of_every_model_over_all_runs(self):
        out = json.dumps({"gemma26": {"status": "PASS", "agg": 25.89, "run": "smoke_1"}, "laguna": {"status": "PASS", "agg": 29.52, "run": "smoke_2"}})
        r = ex.status("aiso1", fake({"<<'PY'": (0, out), "tail -n": (0, "OURS 0\nLOG platform_smoke_2.log\n"), "pgrep": (0, "0\n")}))
        self.assertEqual(r["last"]["gemma26"]["status"], "PASS")     # tested in an earlier run, still counted
        self.assertEqual(r["last"]["laguna"]["agg"], 29.52)

    def test_pro6000_runner_reads_the_benchmark_serving_table(self):
        import importlib.util
        spec = importlib.util.spec_from_file_location("pro6000_smoke", ex.BASE / "runners" / "pro6000_platform_smoke.py")
        mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
        table = ("============ Serving Benchmark Result ============\nSuccessful requests:                     1         \nBenchmark duration (s):                  1.19      \n"
                 "Output token throughput (tok/s):         167.92    \nMean TTFT (ms):                          154.56    \nMean TPOT (ms):                          5.20      \n")
        self.assertEqual(mod.parse_result(table), (True, 167.92, 154.56, 5.20))
        self.assertFalse(mod.parse_result(table.replace("requests:                     1", "requests:                     0"))[0])
        self.assertEqual(mod.parse_result("no table here"), (False, 0.0, 0.0, 0.0))
        self.assertEqual(mod.parse_result("{'Successful requests': 1, 'Mean Output throughput (tok/s)': 10.0, 'Mean TTFT (ms)': 5.0, 'Mean TPOT (ms)': 2.0}"), (True, 10.0, 5.0, 2.0))

    # ---- adjustable parameters: a default for each, manual values inside the limits ----
    def test_defaults_and_limits_are_sent_to_the_page(self):
        r = ex.models("pro6000", fake({"true": (0, "")}))
        self.assertEqual(r["params"]["np"]["default"], 1)
        self.assertTrue(r["params"]["repeat"]["fixed"])
        a = ex.models("aiso1", fake({"python3 -": (0, self.MODELS_OUT)}))
        self.assertTrue(a["params"]["output"]["fixed"], "AISO1 output tokens come from the machine's own B1024 protocol")

    def test_params_inside_the_limits_reach_the_runner_as_numbers(self):
        sent = []
        r = ex.start_smoke("aiso1", ["laguna"], {"np": 2, "input": 8192, "repeat": 2}, fake({"<<'PY'": (0, self.MODELS_OUT), "pgrep": (0, "0\n"), "nohup": (0, "started\n")}, sent))
        self.assertTrue(r["ok"], r)
        cmd = [c for c in sent if "nohup" in c][0]
        self.assertIn("--np 2 --input 8192 --repeat 2", cmd)

    def test_params_outside_the_limits_or_not_numbers_are_refused(self):
        for machine, bad in (("aiso1", {"np": 5}), ("aiso1", {"input": 100}), ("aiso1", {"input": "4096; rm -rf ~"}), ("aiso1", {"output": 512}), ("aiso1", {"colour": 1}),
                             ("pro6000", {"np": 0}), ("pro6000", {"repeat": 3}), ("pro6000", {"np": True})):
            ok, why = ex.check_params(machine, bad)
            self.assertFalse(ok, (machine, bad))
        sent = []
        r = ex.start_smoke("aiso1", ["laguna"], {"np": 99}, fake({"<<'PY'": (0, self.MODELS_OUT), "pgrep": (0, "0\n")}, sent))
        self.assertFalse(r["ok"]); self.assertEqual(sent, [], "nothing is contacted for a bad parameter")

    def test_default_run_sends_no_extra_arguments(self):
        sent = []
        ex.start_smoke("aiso1", ["laguna"], {}, fake({"<<'PY'": (0, self.MODELS_OUT), "pgrep": (0, "0\n"), "nohup": (0, "started\n")}, sent))
        self.assertNotIn("--np", [c for c in sent if "nohup" in c][0])

    # ---- standard test ----
    STD_LINES = ["STANDARD_PLAN: {\"models\": [\"gemma26\"], \"inputs\": [4096, 8192], \"nps\": [1, 2], \"repeats\": 1, \"cases\": 4}", "LOADING: gemma26",
                 "llamacpp/gemma26 NP=1 input=4096 R=1 PASS agg=25.50 ttft_ms=900.10 tpot_ms=39.20", "llamacpp/gemma26 NP=1 input=8192 R=1 FAIL"]

    def test_standard_lines_and_progress(self):
        plan, cases, current = ex.parse_standard(self.STD_LINES)
        self.assertEqual(plan["cases"], 4)
        self.assertEqual(len(cases), 2)
        self.assertEqual(cases[0]["ttft_ms"], 900.10)
        self.assertIsNone(cases[1]["agg"])
        p = ex.standard_progress(plan, cases, current, True)
        self.assertEqual((p["gemma26"]["state"], p["gemma26"]["done"], p["gemma26"]["total"]), ("loading", 2, 4))
        self.assertEqual(ex.standard_progress(plan, cases, current, False)["gemma26"]["state"], "fail", "an ended run with missing cases is never shown as passed")

    def test_standard_params_are_checked(self):
        ok, v = ex.check_standard("aiso1", {"inputs": [4096], "nps": [1, 2], "repeats": 2}, 2)
        self.assertTrue(ok); self.assertEqual(v, {"inputs": [4096], "nps": [1, 2], "repeats": 2})
        for bad in ({"nps": [5]}, {"inputs": [100]}, {"inputs": 4096}, {"inputs": [4096, 4096]}, {"repeats": 9}, {"output": 512}, {"x": 1}, {"nps": [1, 2, 3, 4, 1]}):
            self.assertFalse(ex.check_standard("aiso1", bad, 1)[0], bad)
        self.assertFalse(ex.check_standard("aiso1", {"inputs": [4096, 8192, 16384, 256], "nps": [1, 2, 3, 4], "repeats": 3}, 4)[0], "more than 120 cases")
        self.assertTrue(ex.check_standard("pro6000", {"output": 512}, 1)[0])

    def test_standard_start_passes_the_lists_to_the_runner(self):
        sent = []
        r = ex.start_run("aiso1", ["laguna"], {"inputs": [4096, 8192], "nps": [1, 2], "repeats": 2}, "standard", fake({"<<'PY'": (0, self.MODELS_OUT), "pgrep": (0, "0\n"), "nohup": (0, "started\n")}, sent))
        self.assertTrue(r["ok"], r)
        cmd = [c for c in sent if "nohup" in c][0]
        self.assertIn("platform_standard_", cmd)
        self.assertIn("--mode standard --inputs 4096,8192 --nps 1,2 --repeats 2", cmd)
        self.assertNotIn("--output", cmd, "AISO1 output tokens are fixed by the machine's protocol")

    def test_standard_with_a_bad_value_contacts_nothing(self):
        sent = []
        r = ex.start_run("aiso1", ["laguna"], {"nps": [9]}, "standard", fake({"<<'PY'": (0, self.MODELS_OUT), "pgrep": (0, "0\n")}, sent))
        self.assertFalse(r["ok"]); self.assertFalse(any("nohup" in c or c == "DEPLOY" for c in sent))

    def test_stop_only_touches_the_platform_runner(self):
        sent = []
        self.assertTrue(ex.stop("pro6000", fake({"pkill": (0, "stopped\n")}, sent))["ok"])
        self.assertIn("[p]ro6000_platform_smoke", sent[0])
        self.assertIn("name=aiso_platform_smoke_", sent[0])
        self.assertTrue(is_run_request("POST", "/api/benchmark/executor/stop"), "stopping needs the test password too")

    def test_every_machine_gets_its_scale_default_inside_its_own_limits(self):
        for m, c in ex.CFG.items():
            self.assertIn(c["tier"], ex.TIER_DEFAULTS, m)
            for k, x in {**c["params"], **(c["standard"] or {})}.items():
                self.assertIn("default", x, (m, k))
                if not x.get("fixed"):
                    vals = x["default"] if isinstance(x["default"], list) else [x["default"]]
                    self.assertTrue(all(x["min"] <= v <= x["max"] for v in vals), (m, k))
            self.assertTrue(ex.check_params(m, {})[0], f"{m}: the defaults themselves must be accepted")
            self.assertEqual(ex.check_standard(m, {}, 1)[0], bool(c["standard"]), m)

    def test_llamacpp_on_pro6000_is_smoke_only_and_uses_its_own_runner(self):
        import hashlib
        m = ex.manifest("pro6000_llamacpp")
        self.assertEqual(hashlib.sha256((ex.BASE.parent / m["runner_file"]).read_bytes()).hexdigest(), m["runner_sha256"], "rebuild the llama.cpp manifest after editing the runner")
        self.assertNotEqual(ex.CFG["pro6000_llamacpp"]["root"], ex.CFG["pro6000"]["root"], "logs and runs of the two engines never mix")
        sent = []
        r = ex.start_run("pro6000_llamacpp", ["gemma26"], {}, "standard", fake({"nvidia-smi": (0, "0\n"), "true": (0, "")}, sent))
        self.assertFalse(r["ok"]); self.assertFalse(any("nohup" in c or c == "DEPLOY" for c in sent))
        sent = []
        r = ex.start_run("pro6000_llamacpp", ["gemma26"], {"np": 2, "input": 2048, "output": 64}, "smoke", fake({"nvidia-smi": (0, "0\n"), "nohup": (0, "started\n"), "true": (0, "")}, sent))
        self.assertTrue(r["ok"], r)
        self.assertIn("--np 2 --input 2048 --output 64", [c for c in sent if "nohup" in c][0])
        self.assertEqual([m["id"] for m in ex.models("pro6000_llamacpp", fake({"true": (0, "")}))["models"]], ["gemma26"])

    def test_a_listed_model_is_only_offered_when_its_file_is_on_the_machine(self):
        def none_found(argv, capture_output=True, text=True, timeout=0, input=None):
            return subprocess.CompletedProcess(argv, 0, "", "")
        r = ex.models("pro6000", none_found)
        self.assertFalse(r["ok"])
        self.assertIn("none of the configured models", r["error"])
        full = ex.models("pro6000", fake({}))
        self.assertTrue(full["ok"]); self.assertNotIn("path", full["models"][0], "host paths are never sent to the page")

    def test_smoke_start_needs_the_test_password(self):
        self.assertTrue(is_run_request("POST", "/api/benchmark/executor/smoke"))
        self.assertFalse(is_run_request("GET", "/api/benchmark/executor/status"))


if __name__ == "__main__":
    unittest.main()
