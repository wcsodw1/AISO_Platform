import csv
import json
import unittest
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data" / "benchmark-v2"
MODES = ("baseline", "aidaptiv", "lmcache")
METRICS = {"output_tps": True, "ttft_median_ms": False, "tpot_median_ms": False}  # True = higher is better


def gain(value, base, higher_is_better):
    return (value / base - 1) * 100 if higher_is_better else (1 - value / base) * 100


class BenchmarkV2ReportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = json.loads((DATA / "AISO_BenchmarkV2_20000.json").read_text(encoding="utf-8"))

    def test_counts_and_exclusion(self):
        r = self.report
        self.assertEqual(len(r["batchDetail72"]), 72)
        self.assertEqual(len(r["scenarioComparison"]), 8)
        self.assertEqual(len(r["scenarioMetricsLong"]), 24)
        self.assertEqual(len(r["excluded"]), 9)
        self.assertEqual(r["displayExclusions"], [{"inputTokens": 15950, "concurrency": 5}])
        for section in ("batchDetail72", "scenarioComparison", "scenarioMetricsLong"):
            for row in r[section]:
                self.assertNotEqual((row["input_tokens"], row["concurrency"]), (15950, 5), section)
        self.assertTrue(all(x["input_tokens"] == 15950 and x["concurrency"] == 5 for x in r["excluded"]))
        self.assertTrue(all(row["status"] == "PASS" for row in r["batchDetail72"]))

    def test_csv_files_match_json(self):
        for name, key, size in (("AISO_Benchmark_Valid72.csv", "batchDetail72", 72), ("AISO_Scenario_Comparison_8.csv", "scenarioComparison", 8),
                                ("AISO_Scenario_Metrics_Long24.csv", "scenarioMetricsLong", 24), ("AISO_Excluded9.csv", "excluded", 9)):
            with (DATA / name).open(encoding="utf-8-sig", newline="") as handle:
                self.assertEqual(len(list(csv.DictReader(handle))), size, name)
            self.assertEqual(len(self.report[key]), size)

    def test_scenario_means_follow_the_three_run_rows(self):
        rows = self.report["batchDetail72"]
        for scenario in self.report["scenarioComparison"]:
            for mode in MODES:
                runs = [r for r in rows if r["mode"] == mode and r["input_tokens"] == scenario["input_tokens"] and r["concurrency"] == scenario["concurrency"]]
                self.assertEqual(sorted(r["repetition"] for r in runs), [1, 2, 3])
                for metric in METRICS:
                    mean = sum(r[metric] for r in runs) / 3
                    self.assertAlmostEqual(mean, scenario[f"{mode}_{metric}"], delta=0.011, msg=(mode, metric, scenario["input_tokens"], scenario["concurrency"]))

    def test_improvement_formula_and_headline(self):
        for scenario in self.report["scenarioComparison"]:
            for mode in ("aidaptiv", "lmcache"):
                for metric, higher in METRICS.items():
                    expected = gain(scenario[f"{mode}_{metric}"], scenario[f"baseline_{metric}"], higher)
                    # printed gains come from full-precision server values; the 2dp metrics here only reproduce them within rounding
                    self.assertAlmostEqual(expected, scenario[f"{mode}_{metric}_improvement_pct"], delta=0.3)
        headline = self.report["headlineImprovementPct"]
        for mode in ("aidaptiv", "lmcache"):
            for metric in METRICS:
                avg = sum(s[f"{mode}_{metric}_improvement_pct"] for s in self.report["scenarioComparison"]) / 8
                key = f"{mode}_{metric}_average_improvement_pct"
                self.assertAlmostEqual(avg, headline[key], delta=0.1, msg=key)
                self.assertLess(headline[key], 0)  # honest conclusion: every headline regressed



class FirstVsRepeatedTests(unittest.TestCase):
    PHASES = {"first_observed_r1": [1], "repeated_observed_r2_r3": [2, 3]}
    KEYS = {"tps": ("output_tps", True), "ttft_ms": ("ttft_median_ms", False), "tpot_ms": ("tpot_median_ms", False)}

    @classmethod
    def setUpClass(cls):
        cls.fr = json.loads((DATA / "AISO_BenchmarkV2_First_vs_Repeated.json").read_text(encoding="utf-8"))
        cls.raw = json.loads((DATA / "AISO_BenchmarkV2_20000.json").read_text(encoding="utf-8"))["batchDetail72"]

    def test_counts_exclusion_and_no_ssd_claim(self):
        f = self.fr
        self.assertEqual((len(f["phase_comparison"]), len(f["within_mode"]), len(f["raw_runs"]), len(f["headline"])), (48, 24, 72, 7))
        for section in ("phase_comparison", "within_mode", "raw_runs"):
            self.assertFalse([r for r in f[section] if (int(r["input_tokens"]), int(r["concurrency"])) == (15950, 5)], section)
        self.assertFalse(any(r["ssd_reuse_verified"] for r in f["phase_comparison"]))
        self.assertFalse(f["aiDAPTIV_evidence"]["verified_benchmark_retrieve"])
        self.assertFalse(f["aiDAPTIV_evidence"]["verified_benchmark_external_cache_hit"])

    def test_phase_values_follow_raw_runs(self):
        for row in self.fr["phase_comparison"]:
            runs = [r for r in self.raw if r["mode"] == row["mode"] and r["input_tokens"] == row["input_tokens"] and r["concurrency"] == row["concurrency"] and r["repetition"] in self.PHASES[row["phase"]]]
            self.assertEqual(len(runs), len(self.PHASES[row["phase"]]))
            for key, (raw_key, higher) in self.KEYS.items():
                self.assertAlmostEqual(sum(r[raw_key] for r in runs) / len(runs), row[key], delta=0.0051, msg=(row["phase"], row["mode"], key))
                base = next(b for b in self.fr["phase_comparison"] if b["phase"] == row["phase"] and b["mode"] == "baseline" and b["input_tokens"] == row["input_tokens"] and b["concurrency"] == row["concurrency"])
                self.assertAlmostEqual(gain(row[key], base[key], higher), row[f"{key.split('_')[0]}_improvement_vs_baseline_pct"], delta=0.01)

    def test_headlines_and_within_mode(self):
        rows = self.fr["phase_comparison"]
        for h in self.fr["headline"]:
            if h["phase"] == "repeat_vs_own_first":
                items = [w for w in self.fr["within_mode"] if w["mode"] == h["mode"]]
                for key, col in (("tps", "tps_gain_pct"), ("ttft", "ttft_gain_pct"), ("tpot", "tpot_gain_pct")):
                    self.assertAlmostEqual(sum(w[col] for w in items) / 8, h[f"{key}_vs_baseline_pct"], delta=0.01)
                continue
            items = [r for r in rows if r["phase"] == h["phase"] and r["mode"] == h["mode"]]
            self.assertEqual(len(items), 8)
            for key in ("tps", "ttft", "tpot"):
                avg = sum(r[f"{key}_improvement_vs_baseline_pct"] for r in items) / 8
                self.assertAlmostEqual(avg, h[f"{key}_vs_baseline_pct"], delta=0.01)
                self.assertLess(h[f"{key}_vs_baseline_pct"], 0)  # both phases regress against same-phase Baseline



class ColdVsReuseEvidenceTests(unittest.TestCase):
    def test_reported_percentages_follow_the_values(self):
        data = json.loads((DATA / "AISO_BenchmarkV2_Cold_vs_Reuse_Evidence.json").read_text(encoding="utf-8"))
        for mode, reported in data["reported_improvement_pct"].items():
            cold, reuse = data["modes"][mode]["cold"], data["modes"][mode]["reuse_avg"]
            self.assertAlmostEqual(gain(reuse["ttft_ms"], cold["ttft_ms"], False), reported["ttft"], delta=0.06)
            self.assertAlmostEqual(gain(reuse["output_tps"], cold["output_tps"], True), reported["tps"], delta=0.06)
            self.assertEqual(data["modes"][mode]["cache"]["gpu_prefix_cache_hits_tokens"], 0)
            self.assertGreater(data["modes"][mode]["cache"]["external_prefix_cache_hits_tokens_cumulative"], 0)
            self.assertEqual(data["modes"][mode]["cache"]["ssd_actual_read_write"], "unverified")


if __name__ == "__main__":
    unittest.main()
