import json
import os
import sys
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from benchmark import api, fixtures, frameworks, reports
from benchmark.jobs import JobError, JobService
from benchmark.machines import load_machines, public_profile, validate_profile
from benchmark.schema import derive_status, finalize_row, normalized, roll_up, validate_row

_SAVED_TOKEN = os.environ.pop("AISO_BENCHMARK_TOKEN", None)


def tearDownModule():
    if _SAVED_TOKEN is not None:
        os.environ["AISO_BENCHMARK_TOKEN"] = _SAVED_TOKEN


MACHINES = load_machines()
B70 = MACHINES["intel-b70"]


class StatusRules(unittest.TestCase):
    def test_recorded_pass_without_log_is_unverified(self):
        status, _ = derive_status({"source": "imported", "reported_status": "PASS"})
        self.assertEqual(status, "UNVERIFIED")

    def test_pass_needs_complete_requests_verified_tokens_and_log(self):
        row = {"source": "measured", "reported_status": "PASS", "expected_requests": 6, "successful_requests": 6,
               "log_path": "x.log", "log_verified": True, "output_tokens_verified": True}
        self.assertEqual(derive_status(row)[0], "PASS")
        self.assertEqual(derive_status(dict(row, successful_requests=5))[0], "PARTIAL")
        self.assertEqual(derive_status(dict(row, output_tokens_verified=False))[0], "UNVERIFIED")

    def test_mock_is_never_pass(self):
        row = {"source": "mock", "reported_status": "PASS", "expected_requests": 2, "successful_requests": 2,
               "log_path": "x", "log_verified": True, "output_tokens_verified": True}
        self.assertEqual(derive_status(row)[0], "UNVERIFIED")

    def test_normalized_tps_are_separate_and_missing_stays_none(self):
        self.assertEqual(normalized(40.0, 4, 2), (10.0, 20.0))
        self.assertEqual(normalized(None, 4, 2), (None, None))

    def test_roll_up_does_not_hide_failures(self):
        self.assertEqual(roll_up(["UNVERIFIED", "FAIL"]), "PARTIAL")
        self.assertEqual(roll_up(["NOT_RUN", "NOT_RUN"]), "NOT_RUN")
        self.assertEqual(roll_up(["PASS", "FAIL"]), "PARTIAL")


class B70Fixture(unittest.TestCase):
    def setUp(self):
        self.rows = reports.recorded_rows(B70, "vllm")

    def test_no_row_is_pass_and_none_is_zero_filled(self):
        self.assertEqual(len(self.rows), 40)
        self.assertNotIn("PASS", {r["status"] for r in self.rows})
        for row in self.rows:
            self.assertEqual(validate_row(row), [], row["run_id"])

    def test_gemma31_np4_64k_is_fail_without_oom_claim(self):
        row = next(r for r in self.rows if r["model"] == "gemma31" and r["np"] == 4 and r["input_tokens"] == 65536)
        self.assertEqual(row["status"], "FAIL")
        self.assertEqual(row["error_type"], "missing_first_token_or_usage")
        self.assertNotIn("oom", (row["error_type"] + row["error_message"]).lower().replace("room", ""))
        self.assertIsNone(row["aggregate_tps"])

    def test_gemma31_np4_values_and_normalization(self):
        row = next(r for r in self.rows if r["model"] == "gemma31" and r["np"] == 4 and r["input_tokens"] == 4096)
        self.assertEqual((row["ttft_s"], row["tpot_ms"], row["aggregate_tps"]), (21.693, 80.414, 39.361))
        self.assertAlmostEqual(row["norm_tps_per_request"], 39.361 / 4)
        self.assertAlmostEqual(row["norm_tps_per_gpu"], 39.361 / 2)

    def test_laguna_is_blocked_by_server_start_failure_without_a_root_cause_claim(self):
        row = next(r for r in self.rows if r["model"] == "laguna_fp8")
        self.assertEqual((row["status"], row["error_type"]), ("BLOCKED", "server_health_timeout"))
        self.assertIn("Root cause not confirmed", row["error_message"])
        self.assertNotIn("192.168", json.dumps(row))
        self.assertTrue(all(r["status"] == "BLOCKED" for r in self.rows if r["model"] == "laguna_fp8"))

    def test_gemma31_np2_and_overview_roll_up(self):
        overview = reports.overview(self.rows, reports.models_for("intel-b70", "vllm"))
        by = {m["model"]: m for m in overview["models"]}
        self.assertEqual(by["laguna_fp8"]["overall"], "BLOCKED")
        self.assertEqual(overview["totals"]["blocked"], 10)
        self.assertEqual(by["gemma31"]["np4"], "PARTIAL")
        self.assertIsNone(by["gemma31"]["max_verified_pass_input"])
        self.assertEqual(by["gemma31"]["max_recorded_ok_input"], 32768)


class Profiles(unittest.TestCase):
    def test_sglang_is_reserved_and_unverified(self):
        spec = B70["frameworks"]["sglang"]
        self.assertEqual(spec["status"], "runtime_unverified")
        self.assertEqual(public_profile(B70)["framework_status"]["sglang"]["label"], "Runtime Unverified")

    def test_secrets_are_rejected_and_placeholders_are_unconfigured(self):
        bad = json.loads(json.dumps(B70))
        bad["ssh"]["private_key"] = "x"
        with self.assertRaises(ValueError):
            validate_profile(bad)
        self.assertFalse(public_profile(B70)["ssh"]["configured"])
        self.assertNotIn("private_key", json.dumps(public_profile(B70)))

    def test_every_parameter_has_a_tooltip_and_framework_params_differ(self):
        for param in frameworks.PARAMS:
            self.assertTrue(param["tip"] and param["tip_zh"], param["key"])
        self.assertIn("max_num_batched_tokens", [p["key"] for p in frameworks.params_for("vllm")])
        self.assertNotIn("max_num_batched_tokens", [p["key"] for p in frameworks.params_for("llamacpp")])
        self.assertIn("ubatch_size", [p["key"] for p in frameworks.params_for("llamacpp")])


class MockJobs(unittest.TestCase):
    def wait(self, service, job_id):
        for _ in range(200):
            if service.get(job_id)["state"] != "running":
                return service.get(job_id)
            time.sleep(0.02)
        self.fail("job did not finish")

    def test_mock_job_runs_fails_and_retries_without_pass(self):
        service = JobService(delay=0.005)
        job = service.start(B70, "vllm", {"model": "gemma31", "test_mode": "smoke", "mock_fail_cells": [[2, 4096]]})
        done = self.wait(service, job["job_id"])
        self.assertEqual((done["state"], done["result_status"], done["exit_code"]), ("failed", "FAIL", 1))
        retry = service.retry_failed(job["job_id"], B70)
        self.assertEqual(retry["retry_of"], job["job_id"])
        self.assertNotIn("PASS", {r["status"] for j in service.jobs.values() for r in j["rows"]})
        self.assertTrue(all(r["source"] == "mock" for r in service.rows("intel-b70", "vllm")))

    def test_running_job_is_never_interrupted_and_unverified_framework_is_blocked(self):
        service = JobService(delay=0.05)
        first = service.start(B70, "vllm", {"model": "gemma26", "test_mode": "smoke"})
        with self.assertRaises(JobError) as ctx:
            service.start(B70, "vllm", {"model": "gemma31", "test_mode": "smoke"})
        self.assertEqual(ctx.exception.status, 409)
        self.assertEqual(service.get(first["job_id"])["state"], "running")
        self.wait(service, first["job_id"])
        with self.assertRaises(JobError):
            service.start(B70, "sglang", {"model": "gemma31"})

    def test_input_validation(self):
        service = JobService()
        for bad in ({"model": "nope"}, {"model": "gemma31", "np": [0]}, {"model": "gemma31", "shell": "rm -rf /"},
                    {"model": "gemma31", "tp": 8}, {"model": "gemma31", "max_model_len": 1024}):
            with self.assertRaises(JobError, msg=str(bad)):
                service.start(B70, "vllm", bad)

    def test_stop_marks_remaining_not_run(self):
        service = JobService(delay=0.05)
        job = service.start(B70, "vllm", {"model": "gemma26", "test_mode": "custom", "input_tokens": [4096, 8192], "np": [2]})
        service.stop(job["job_id"])
        done = self.wait(service, job["job_id"])
        self.assertEqual(done["state"], "stopped")


class Api(unittest.TestCase):
    def test_routes_and_exports(self):
        service = JobService(delay=0.005)
        get = lambda path: api.handle("GET", api.PREFIX + path, machines=MACHINES, service=service)
        self.assertEqual(get("/status").status, 200)
        overview = get("/reports/overview?machine=intel-b70&framework=vllm")
        self.assertEqual(overview.body["totals"]["pass"], 0)
        report = get("/reports/model?machine=intel-b70&framework=vllm&model=gemma31")
        self.assertEqual(len(report.body["series"]), 6)
        self.assertEqual(get("/reports/model?machine=intel-b70&framework=vllm&model=zzz").status, 404)
        csv = get("/exports/csv?machine=intel-b70&framework=vllm")
        self.assertTrue(csv.body.decode().startswith("run_id,"))
        self.assertEqual(get("/machines/none").status, 404)

    def test_bearer_token_is_enforced_when_configured(self):
        os.environ["AISO_BENCHMARK_TOKEN"] = "s3cret"
        try:
            self.assertEqual(api.handle("GET", api.PREFIX + "/status", machines=MACHINES).status, 401)
            self.assertEqual(api.handle("GET", api.PREFIX + "/status", authorization="Bearer wrong", machines=MACHINES).status, 401)
            self.assertEqual(api.handle("GET", api.PREFIX + "/status", authorization="Bearer s3cret", machines=MACHINES).status, 200)
        finally:
            del os.environ["AISO_BENCHMARK_TOKEN"]

    def test_preflight_is_labelled_simulated(self):
        result = api.handle("POST", api.PREFIX + "/machines/intel-b70/preflight", {"framework": "vllm"}, machines=MACHINES)
        self.assertTrue(result.body["mock"])
        self.assertTrue(all(c["status"] == "SIMULATED" for c in result.body["checks"]))


class SGLangFixture(unittest.TestCase):
    def setUp(self):
        self.rows = reports.recorded_rows(B70, "sglang")

    def test_console_pass_is_unverified_until_logs_are_imported(self):
        self.assertEqual(len(self.rows), 30)
        self.assertEqual({r["status"] for r in self.rows}, {"UNVERIFIED"})
        for row in self.rows:
            self.assertEqual(validate_row(row), [], row["run_id"])
            self.assertEqual(row["successful_requests"], row["expected_requests"])
            self.assertGreater(row["ttft_s"], 0)
            self.assertEqual(len(row["requests"]), row["np"])
            self.assertEqual(len(row["prompt_token_sha256"]), 64)

    def test_raw_and_summary_csv_are_consistent_and_hashes_recorded(self):
        report = fixtures.integrity_report()
        self.assertTrue(report["consistent"], report["problems"])
        self.assertEqual((report["raw_rows"], report["summary_rows"]), (90, 10))
        for info in report["source_files"].values():
            self.assertEqual(len(info["sha256"]), 64)

    def test_summary_values_flow_into_report_b(self):
        report = reports.model_report(self.rows, reports.models_for("intel-b70", "sglang")[0], B70, "sglang")
        cell = next(c for c in report["matrix"] if c["np"] == 4 and c["input_tokens"] == 65536)
        self.assertAlmostEqual(cell["ttft_s"], 96.81334988239298, places=6)
        self.assertAlmostEqual(cell["tpot_ms"], 132.95047868314555, places=6)
        self.assertAlmostEqual(cell["e2e_s"], 232.82168957525087, places=6)
        self.assertAlmostEqual(cell["norm_tps_per_gpu"], 8.789975501711107, places=6)
        self.assertTrue(report["integrity"]["consistent"])

    def test_raw_repeats_and_means(self):
        report = reports.model_report(self.rows, reports.models_for("intel-b70", "sglang")[0], B70, "sglang")
        cell = next(c for c in report["matrix"] if c["np"] == 4 and c["input_tokens"] == 4096)
        self.assertEqual([r["repeat"] for r in cell["raw"]], [1, 2, 3])
        self.assertAlmostEqual(cell["aggregate_tps"], (47.84426560148957 + 51.06617928983122 + 49.58441494414632) / 3)
        self.assertAlmostEqual(cell["norm_tps_per_gpu"], cell["aggregate_tps"] / 2)

    def test_sglang_stays_runtime_unverified_for_execution(self):
        self.assertEqual(B70["frameworks"]["sglang"]["status"], "runtime_unverified")
        with self.assertRaises(JobError):
            JobService().start(B70, "sglang", {"model": "gemma31"})
        self.assertEqual(api.handle("GET", api.PREFIX + "/reports/overview?machine=intel-b70&framework=sglang", machines=MACHINES).body["totals"]["pass"], 0)


class Hardening(unittest.TestCase):
    def test_malformed_requests_are_400_not_500(self):
        call = lambda m, p, body=None: api.handle(m, api.PREFIX + p, body, machines=MACHINES, service=JobService())
        self.assertEqual(call("POST", "/jobs", ["x"]).status, 400)
        self.assertEqual(call("POST", "/jobs", {"machine_id": "intel-b70", "framework": "vllm", "config": "x"}).status, 400)
        self.assertEqual(call("POST", "/jobs", {"machine_id": "nope"}).status, 404)
        service = JobService(delay=0.001)
        job = service.start(B70, "vllm", {"model": "gemma26", "test_mode": "smoke"})
        self.assertEqual(api.handle("GET", f"{api.PREFIX}/jobs/{job['job_id']}/log?from=abc", machines=MACHINES, service=service).status, 400)

    def test_only_the_untouched_full_workload_is_formal(self):
        service = JobService(delay=0.001)
        full = service.start(B70, "vllm", {"model": "gemma26", "test_mode": "full"})
        self.assertEqual(full["profile"], "formal")
        service.stop(full["job_id"])
        for _ in range(100):
            if service.get(full["job_id"])["state"] != "running":
                break
            time.sleep(0.02)
        subset = service.start(B70, "vllm", {"model": "gemma26", "test_mode": "full", "input_tokens": [4096]})
        self.assertEqual(subset["profile"], "non-formal")


if __name__ == "__main__":
    unittest.main()
