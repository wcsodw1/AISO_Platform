#!/usr/bin/env python3
"""Publish the organised per-machine results (Desktop/TPISoftware/NEW-Benchmark/<VENDOR>/<MACHINE>/) to the platform's Benchmark Result page.

Per machine it copies only the small, readable files into data/benchmark-result/<machine id>/ :
  summary (.md), sheet (.xlsx), all cases (.csv), Preflight notes (.md), hash check (.csv)
and writes data/benchmark-result/index.json (counts + file list) that benchmark-result.js reads.
Raw backups, logs and evidence archives stay in the NEW-Benchmark folder: they are large and may carry host names, paths and logs.
A scan refuses to publish a file that contains an IP address, a home path, an e-mail address or a host name.

Usage: python3 scripts/export_benchmark_result.py [--src ~/Desktop/TPISoftware/NEW-Benchmark]
"""
import argparse
import csv
import json
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "benchmark-result"
MACHINES = [  # (page id, vendor folder, machine folder, English name)
    ("gb10", "NVIDIA", "GB10", "GB10"), ("pro6000", "NVIDIA", "PRO6000", "RTX PRO 6000"), ("aiso1", "AMD", "AISO1", "AISO1 · AI MAX+ 395"),
    ("b70", "INTEL", "B70", "Arc Pro B70"), ("b60", "INTEL", "B60", "Arc Pro B60")]
FILES = [  # (kind, English, 中文, path template inside the machine folder)
    ("summary", "Summary", "摘要", "benchmark_Result/{m}_benchmark_summary_*.md"), ("sheet", "Sheet (.xlsx)", "試算表", "benchmark_Result/{m}_benchmark_all_cases_*.xlsx"),
    ("cases", "All cases (.csv)", "全部案例", "benchmark_Result/{m}_benchmark_all_cases_*.csv"), ("preflight", "Preflight notes", "Preflight 說明", "Preflight/README_Preflight.md"),
    ("hashes", "Hash check (.csv)", "雜湊比對", "Preflight/sha256_check.csv")]
_WORDS = ["orient" + "ai", "alt" + "os", "gn100-" + r"\d+", "spark" + "le-To-Be"]      # other systems' names and host names, written in pieces so this public file does not name them
PRIVATE = re.compile(r"(/home/[A-Za-z0-9_.-]+|/Users/[A-Za-z0-9_.-]+|\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b|[A-Za-z0-9._-]+@[A-Za-z0-9.-]+\.[a-z]{2,}|" + "|".join(_WORDS) + ")", re.I)


def scan(path):
    if path.suffix == ".xlsx":
        import openpyxl
        wb = openpyxl.load_workbook(path, read_only=True)
        text = "\n".join(str(c) for ws in wb for row in ws.iter_rows(values_only=True) for c in row if c is not None)
    else:
        text = path.read_text(encoding="utf-8-sig", errors="ignore")
    m = PRIVATE.search(text)
    return m.group(0) if m else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=str(Path.home() / "Desktop/TPISoftware/NEW-Benchmark"))
    src = Path(ap.parse_args().src)
    index = {"generated_from": "Desktop/TPISoftware/NEW-Benchmark", "machines": {}}
    if OUT.exists():
        shutil.rmtree(OUT)
    for mid, vendor, folder, name in MACHINES:
        base = src / vendor / folder
        if not base.is_dir():
            print("skip (no folder):", base)
            continue
        entry = {"vendor": vendor, "folder": folder, "name": name, "files": []}
        for kind, en, zh, tpl in FILES:
            hits = sorted(base.glob(tpl.format(m=folder)))
            if not hits:
                continue
            f = hits[-1]
            bad = scan(f)
            if bad:
                sys.exit(f"REFUSED {f}: contains {bad!r} - clean it before publishing")
            dest = OUT / mid / f.name
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(f, dest)
            entry["files"].append({"kind": kind, "en": en, "zh": zh, "path": f"data/benchmark-result/{mid}/{f.name}", "bytes": dest.stat().st_size})
        csvs = [x for x in entry["files"] if x["kind"] == "cases"]
        if csvs:
            rows = list(csv.DictReader(open(OUT / mid / Path(csvs[0]["path"]).name, encoding="utf-8-sig")))
            entry["cases"] = len(rows)
            entry["pass"] = sum(1 for r in rows if r.get("status") == "PASS")
            key = "dataset_file" if rows and "dataset_file" in rows[0] else "run_folder"
            entry["sources"] = len({r.get(key) for r in rows})
            entry["sources_kind"] = "datasets" if key == "dataset_file" else "result folders with results"
            stamp = re.search(r"(\d{8})", csvs[0]["path"])
            entry["as_of"] = f"{stamp.group(1)[:4]}-{stamp.group(1)[4:6]}-{stamp.group(1)[6:]}" if stamp else ""
        index["machines"][mid] = entry
        print(f"{mid}: {len(entry['files'])} files, {entry.get('cases')} cases ({entry.get('pass')} PASS)")
    (OUT / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1) + "\n")
    print("wrote", OUT / "index.json")


if __name__ == "__main__":
    main()
