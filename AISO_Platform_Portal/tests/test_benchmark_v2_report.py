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


if __name__ == "__main__":
    unittest.main()
