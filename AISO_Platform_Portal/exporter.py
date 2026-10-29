#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
import shutil
from datetime import datetime
from pathlib import Path

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".xlsx", ".csv", ".json", ".png", ".jpg", ".jpeg", ".webp", ".html", ".md", ".txt", ".sh", ".ps1"}
FILE_MAGIC = b"AISOENC1"
FILE_SALT = b"aiso-file-key-v1"
KDF_ITERATIONS = 600_000


def derive_file_key(password: str) -> bytes:
    """Same derivation as access-gate.js: PBKDF2-HMAC-SHA256 over the trimmed, upper-cased access code."""
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=FILE_SALT, iterations=KDF_ITERATIONS)
    return kdf.derive(password.strip().upper().encode("utf-8"))


def encrypt_bytes(key: bytes, data: bytes) -> bytes:
    """File layout: magic (8) + IV (12) + AES-256-GCM ciphertext and tag; the magic is authenticated."""
    iv = os.urandom(12)
    return FILE_MAGIC + iv + AESGCM(key).encrypt(iv, data, FILE_MAGIC)


def file_key_from_env():
    password = os.environ.get("AISO_FILE_PASSWORD", "")
    return derive_file_key(password) if password.strip() else None


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


def public_files(source: Path, destination: Path, url_prefix: str, key: bytes | None = None, reuse_root: Path | None = None):
    """Publish files only in encrypted form. Without a key, already-published encrypted copies are kept; plaintext is never published."""
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
        target = destination / (relative.as_posix() + ".enc")
        previous = None
        if key is None:
            previous = reuse_root / url_prefix / (relative.as_posix() + ".enc") if reuse_root else None
            if not previous or not previous.is_file():
                continue
        target.parent.mkdir(parents=True, exist_ok=True)
        if previous:
            shutil.copy2(previous, target)
        else:
            target.write_bytes(encrypt_bytes(key, file.read_bytes()))
        items.append({"name": file.name, "extension": file.suffix.lower().lstrip("."), "url": f"{url_prefix}/{relative.as_posix()}.enc", "encrypted": True, "size": file.stat().st_size})
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


def sanitized_access_policy(policy):
    return {
        "tiers": [
            {
                "id": str(item.get("id", "")),
                "label": str(item.get("label", "")),
                "name": str(item.get("name", "")),
                "description": str(item.get("description", "")),
            }
            for item in policy.get("tiers", [])
        ],
        "capabilities": [
            {
                "id": str(item.get("id", "")),
                "name": str(item.get("name", "")),
                "description": str(item.get("description", "")),
                "access": str(item.get("access", "public")),
                "availability": str(item.get("availability", "available")),
            }
            for item in policy.get("capabilities", [])
        ],
    }


def sanitized_product(product, data_root: Path, output: Path, key: bytes | None = None, reuse_root: Path | None = None):
    if not re.fullmatch(r"[a-z0-9-]+", str(product.get("id", ""))):
        raise ValueError(f"Unsafe product ID: {product.get('id', '')}")
    preview_3d = product.get("preview_3d", {})
    model_3d = str(product.get("model_3d", ""))
    if model_3d and (not model_3d.startswith("assets/models/") or not model_3d.lower().endswith(".glb")):
        raise ValueError(f"Unsafe 3D model path: {model_3d}")
    public = {
        "id": product["id"],
        "category": product["category"],
        "name": product["name"],
        "positioning": product.get("positioning", ""),
        "status": product.get("status", ""),
        "summary": product.get("summary", ""),
        "image": product.get("image", ""),
        "image_alt": product.get("image_alt", ""),
        "image_note": product.get("image_note", ""),
        "image_count": product.get("image_count", ""),
        "preview_3d": {
            "image": str(preview_3d.get("image", "")),
            "alt": str(preview_3d.get("alt", "")),
            "label": str(preview_3d.get("label", "")),
            "hint": str(preview_3d.get("hint", "")),
        } if preview_3d.get("image") else {},
        "model_3d": model_3d,
        "visual_variant": product.get("visual_variant", ""),
        "visual_alt": product.get("visual_alt", ""),
        "visual_note": product.get("visual_note", ""),
        "hardware": product.get("hardware", {}),
        "models": [{"name": item.get("name", ""), "status": item.get("status", ""), "notes": item.get("notes", "")} for item in product.get("models", [])],
        "benchmark": sanitized_benchmark(product.get("benchmark", {})),
        "published": {"documents": [], "benchmark": [], "scripts": []},
    }
    product_output = output / "assets" / product["id"]
    documents_folder = product.get("documents", {}).get("public_folder", f"{product['folder']}/Documents/Public")
    benchmark_folder = product.get("benchmark", {}).get("public_folder", f"{product['folder']}/Benchmark/Public")
    scripts_folder = product.get("scripts", {}).get("public_folder", f"{product['folder']}/Scripts")
    public["published"]["documents"] = public_files(inside_root(data_root, documents_folder), product_output / "manuals", f"assets/{product['id']}/manuals", key, reuse_root)
    public["published"]["benchmark"] = public_files(inside_root(data_root, benchmark_folder), product_output / "benchmark", f"assets/{product['id']}/benchmark", key, reuse_root)
    public["published"]["scripts"] = public_files(inside_root(data_root, scripts_folder), product_output / "scripts", f"assets/{product['id']}/scripts", key, reuse_root)
    return public


def export_catalog(base: Path, data_root: Path):
    catalog = read_json(base / "data" / "products.json")
    output = base / "docs"
    temporary = base / ".docs-build"
    if temporary.exists():
        shutil.rmtree(temporary)
    temporary.mkdir(parents=True)
    for asset in ("index.html", "style.css", "site-header.css", "access-gate.js", "site-glow.js", "app.js", "benchmark.html", "benchmark.css", "benchmark-app.js", "aidaptiv.html", "lmcache.html", "lmcache.js", "gptoss-v2.html", "gptoss-v2.js", "gptoss-v2.css", "gptoss-v2-historical.html", "gptoss-v2-historical.js"):
        shutil.copy2(base / asset, temporary / asset)
    if (base / "assets").exists():
        shutil.copytree(base / "assets", temporary / "assets")
    (temporary / ".nojekyll").write_text("", encoding="utf-8")
    (temporary / "data").mkdir()
    shutil.copy2(base / "data" / "lmcache-summary.json", temporary / "data" / "lmcache-summary.json")
    shutil.copytree(base / "data" / "benchmark-v2", temporary / "data" / "benchmark-v2")
    key = file_key_from_env()
    products = [sanitized_product(product, data_root, temporary, key, output) for product in catalog.get("products", []) if product.get("publish", {}).get("enabled", True)]
    published = {
        "version": catalog.get("version", 1),
        "updated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "access_policy": sanitized_access_policy(catalog.get("access_policy", {})),
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
    return {"output": str(output), "products": len(products), "files": file_count, "files_encrypted": bool(key),
            "note": "" if key else "AISO_FILE_PASSWORD is not set: kept the already-published encrypted files; changed files were not re-published."}


if __name__ == "__main__":
    base = Path(__file__).resolve().parent
    config = read_json(base / "config.json")
    configured_root = Path(config.get("data_root", "~/AISO-Platform-Data")).expanduser()
    root = (base / configured_root).resolve() if not configured_root.is_absolute() else configured_root.resolve()
    print(json.dumps(export_catalog(base, root), ensure_ascii=False, indent=2))
