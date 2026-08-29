#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import shutil
from datetime import datetime
from pathlib import Path

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".xlsx", ".csv", ".json", ".png", ".jpg", ".jpeg", ".webp", ".html", ".md", ".txt", ".sh", ".ps1"}
BLOCKED_NAME = re.compile(r"(?:password|passwd|secret|credential|private|internal|\.env|\.pem$|\.key$)", re.IGNORECASE)


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def inside_root(root: Path, relative: str) -> Path:
    target = (root / relative).resolve()
    try:
        target.relative_to(root.resolve())
    except ValueError as exc:
        raise ValueError(f"Public folder is outside data_root: {relative}") from exc
    return target


def public_files(source: Path, destination: Path, url_prefix: str):
    items = []
    if not source.exists():
        return items
    for file in sorted(source.rglob("*")):
        if not file.is_file() or file.suffix.lower() not in ALLOWED_EXTENSIONS:
            continue
        try:
            file.resolve().relative_to(source.resolve())
        except ValueError:
            continue
        relative = file.relative_to(source)
        if any(part.startswith(".") for part in relative.parts) or BLOCKED_NAME.search(file.name):
            continue
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(file, target)
        items.append({"name": file.name, "extension": file.suffix.lower().lstrip("."), "url": f"{url_prefix}/{relative.as_posix()}"})
    return items


def sanitized_benchmark(benchmark):
    results = []
    for item in benchmark.get("results", []):
        results.append({
            "model": str(item.get("model", "")),
            "scope": str(item.get("scope", "")),
            "report": str(item.get("report", "")),
            "highlights": [
                {
                    "metric": str(highlight.get("metric", "")),
                    "condition": str(highlight.get("condition", "")),
                    "result": str(highlight.get("result", "")),
                }
                for highlight in item.get("highlights", [])
            ],
        })
    return {
        "date": str(benchmark.get("date", "")),
        "comparison": str(benchmark.get("comparison", "")),
        "metrics": [str(metric) for metric in benchmark.get("metrics", [])],
        "results": results,
    }


def sanitized_product(product, data_root: Path, output: Path):
    if not re.fullmatch(r"[a-z0-9-]+", str(product.get("id", ""))):
        raise ValueError(f"Unsafe product ID: {product.get('id', '')}")
    public = {
        "id": product["id"],
        "category": product["category"],
        "name": product["name"],
        "positioning": product.get("positioning", ""),
        "status": product.get("status", ""),
        "summary": product.get("summary", ""),
        "hardware": product.get("hardware", {}),
        "models": [{"name": item.get("name", ""), "status": item.get("status", ""), "notes": item.get("notes", "")} for item in product.get("models", [])],
        "benchmark": sanitized_benchmark(product.get("benchmark", {})),
        "published": {"documents": [], "benchmark": [], "scripts": []},
    }
    product_output = output / "assets" / product["id"]
    documents_folder = product.get("documents", {}).get("public_folder", f"{product['folder']}/Documents/Public")
    benchmark_folder = product.get("benchmark", {}).get("public_folder", f"{product['folder']}/Benchmark/Public")
    scripts_folder = product.get("scripts", {}).get("public_folder", f"{product['folder']}/Scripts")
    public["published"]["documents"] = public_files(inside_root(data_root, documents_folder), product_output / "manuals", f"assets/{product['id']}/manuals")
    public["published"]["benchmark"] = public_files(inside_root(data_root, benchmark_folder), product_output / "benchmark", f"assets/{product['id']}/benchmark")
    public["published"]["scripts"] = public_files(inside_root(data_root, scripts_folder), product_output / "scripts", f"assets/{product['id']}/scripts")
    return public


def export_catalog(base: Path, data_root: Path):
    catalog = read_json(base / "data" / "products.json")
    output = base / "docs"
    temporary = base / ".docs-build"
    if temporary.exists():
        shutil.rmtree(temporary)
    temporary.mkdir(parents=True)
    for asset in ("index.html", "style.css", "app.js"):
        shutil.copy2(base / asset, temporary / asset)
    (temporary / ".nojekyll").write_text("", encoding="utf-8")
    (temporary / "data").mkdir()
    products = [sanitized_product(product, data_root, temporary) for product in catalog.get("products", []) if product.get("publish", {}).get("enabled", True)]
    published = {
        "version": catalog.get("version", 1),
        "updated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "categories": catalog.get("categories", []),
        "model_matrix": catalog.get("model_matrix", []),
        "products": products,
    }
    (temporary / "data" / "products.json").write_text(json.dumps(published, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (temporary / "README.txt").write_text("Generated by AISO Platform. Do not edit this folder manually.\n", encoding="utf-8")
    if output.exists():
        shutil.rmtree(output)
    temporary.replace(output)
    file_count = sum(len(product["published"][kind]) for product in products for kind in ("documents", "benchmark", "scripts"))
    return {"output": str(output), "products": len(products), "files": file_count}


if __name__ == "__main__":
    base = Path(__file__).resolve().parent
    config = read_json(base / "config.json")
    configured_root = Path(config.get("data_root", "~/AISO-Platform-Data")).expanduser()
    root = (base / configured_root).resolve() if not configured_root.is_absolute() else configured_root.resolve()
    print(json.dumps(export_catalog(base, root), ensure_ascii=False, indent=2))
