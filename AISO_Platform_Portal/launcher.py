#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import mimetypes
import os
import platform
import re
import shutil
import subprocess
import threading
import urllib.parse
import webbrowser
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from exporter import export_catalog

BASE = Path(__file__).resolve().parent
CONFIG_PATH = BASE / "config.json"
CATALOG_PATH = BASE / "data" / "products.json"


def load_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return default


CONFIG = load_json(CONFIG_PATH, {})
HOST = str(CONFIG.get("host", "127.0.0.1"))
PORT = int(CONFIG.get("port", 8765))
MAX_RESULTS = int(CONFIG.get("max_search_results", 200))
if HOST not in {"127.0.0.1", "localhost", "::1", "0.0.0.0"}:
    raise SystemExit("Unsupported bind address. Use localhost or 0.0.0.0 for LAN access.")


def data_root() -> Path:
    raw = os.environ.get("AISO_DATA_ROOT", "").strip() or str(CONFIG.get("data_root", "~/AISO-Platform-Data")).strip()
    path = Path(raw).expanduser()
    if not path.is_absolute():
        path = BASE / path
    return path.resolve()


def catalog():
    return load_json(CATALOG_PATH, {"updated_at": "", "categories": [], "products": []})


def save_catalog(value) -> None:
    value["updated_at"] = datetime.now().astimezone().isoformat(timespec="seconds")
    CATALOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    temporary = CATALOG_PATH.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(CATALOG_PATH)


def product_by_id(product_id: str):
    return next((item for item in catalog().get("products", []) if item.get("id") == product_id), None)


def ensure_structure() -> None:
    root = data_root()
    root.mkdir(parents=True, exist_ok=True)
    for product in catalog().get("products", []):
        folder = product["folder"]
        configured_paths = (
            product.get("documents", {}).get("folder", f"{folder}/Documents"),
            product.get("documents", {}).get("public_folder", f"{folder}/Documents/Public"),
            product.get("benchmark", {}).get("folder", f"{folder}/Benchmark"),
            product.get("benchmark", {}).get("public_folder", f"{folder}/Benchmark/Public"),
            product.get("scripts", {}).get("folder", f"{folder}/Scripts"),
            product.get("scripts", {}).get("public_folder", f"{folder}/Scripts/Public"),
        )
        for relative in configured_paths:
            safe_resolve(relative).mkdir(parents=True, exist_ok=True)
        sample = BASE / "sample-data" / product["folder"]
        if sample.exists():
            for source in sample.rglob("*"):
                if not source.is_file():
                    continue
                destination = folder / source.relative_to(sample)
                destination.parent.mkdir(parents=True, exist_ok=True)
                if not destination.exists():
                    shutil.copy2(source, destination)


def safe_resolve(relative: str) -> Path:
    root = data_root()
    decoded = urllib.parse.unquote(relative or "").replace("\\", "/").lstrip("/")
    target = (root / decoded).resolve()
    try:
        target.relative_to(root)
    except ValueError as exc:
        raise ValueError("Path is outside the configured data_root.") from exc
    return target


def relative_to_root(path: Path) -> str:
    return path.resolve().relative_to(data_root()).as_posix()


def open_path(path: Path) -> None:
    system = platform.system()
    if system == "Windows":
        os.startfile(str(path))  # type: ignore[attr-defined]
    elif system == "Darwin":
        subprocess.Popen(["open", str(path)])
    else:
        subprocess.Popen(["xdg-open", str(path)])


def scan_folder(folder: Path):
    if not folder.exists():
        return []
    items = []
    seen = set()
    paths = sorted(
        folder.rglob("*"),
        key=lambda item: (
            item.relative_to(folder).parts[:1] == ("Public",),
            item.is_file(),
            item.name.lower(),
        ),
    )
    for path in paths:
        relative = path.relative_to(folder)
        if any(part.startswith(".") for part in relative.parts):
            continue
        # Public mirrors publishable files from the parent folder. Hide the
        # container itself and collapse mirrored paths so local lists show each
        # resource once. A file that exists only in Public is still included.
        if relative.parts == ("Public",):
            continue
        display_parts = relative.parts[1:] if relative.parts[:1] == ("Public",) else relative.parts
        identity = (path.is_dir(), tuple(part.casefold() for part in display_parts))
        if identity in seen:
            continue
        seen.add(identity)
        items.append({
            "name": path.name,
            "path": relative_to_root(path),
            "type": "directory" if path.is_dir() else path.suffix.lower().lstrip(".") or "file",
        })
        if len(items) >= MAX_RESULTS:
            break
    return items


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE), **kwargs)

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        super().end_headers()

    def send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def parse_json_body(self):
        length = int(self.headers.get("Content-Length", "0"))
        return json.loads(self.rfile.read(length) or b"{}")

    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        query = urllib.parse.parse_qs(url.query)
        if url.path == "/api/health":
            root = data_root()
            return self.send_json({"ok": True, "mode": "local", "host": HOST, "port": PORT, "data_root": str(root), "data_root_ready": root.exists()})
        if url.path == "/api/products":
            return self.send_json(catalog())
        if url.path == "/api/scan":
            try:
                product = product_by_id(query.get("product", [""])[0])
                if not product:
                    raise ValueError("Product not found.")
                kind = query.get("kind", ["all"])[0]
                relative = product["folder"]
                if kind == "documents":
                    relative = product.get("documents", {}).get("public_folder", f"{relative}/Documents/Public")
                elif kind == "benchmark":
                    relative = product.get("benchmark", {}).get("public_folder", f"{relative}/Benchmark/Public")
                elif kind == "scripts":
                    relative = product.get("scripts", {}).get("public_folder", f"{relative}/Scripts")
                folder = safe_resolve(relative)
                folder.mkdir(parents=True, exist_ok=True)
                return self.send_json({"folder": relative, "items": scan_folder(folder)})
            except Exception as exc:
                return self.send_json({"error": str(exc)}, 400)
        if url.path == "/api/search":
            try:
                term = query.get("q", [""])[0].strip().lower()
                if len(term) < 2:
                    return self.send_json({"items": []})
                root = data_root()
                items = []
                for base, directories, files in os.walk(root):
                    directories[:] = [name for name in directories if not name.startswith(".")]
                    for name in directories + files:
                        if term in name.lower():
                            path = Path(base) / name
                            items.append({"name": name, "path": relative_to_root(path), "type": "directory" if path.is_dir() else "file"})
                            if len(items) >= MAX_RESULTS:
                                return self.send_json({"items": items})
                return self.send_json({"items": items})
            except Exception as exc:
                return self.send_json({"error": str(exc)}, 400)
        if url.path == "/api/file":
            try:
                path = safe_resolve(query.get("path", [""])[0])
                if not path.is_file():
                    raise ValueError("File not found.")
                content_type = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
                data = path.read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(len(data)))
                self.send_header("Content-Disposition", f'inline; filename="{path.name}"')
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(data)
                return
            except Exception as exc:
                return self.send_json({"error": str(exc)}, 400)
        return super().do_GET()

    def do_POST(self):
        try:
            origin = self.headers.get("Origin", "")
            if origin and urllib.parse.urlparse(origin).hostname not in {"127.0.0.1", "localhost", "::1"}:
                return self.send_json({"error": "Cross-origin management request blocked."}, 403)
            if self.path == "/api/open":
                path = safe_resolve(self.parse_json_body().get("path", ""))
                if not path.exists():
                    raise ValueError("Path does not exist.")
                open_path(path)
                return self.send_json({"ok": True})
            if self.path == "/api/products/save":
                payload = self.parse_json_body()
                product = payload.get("product") or {}
                if not re.fullmatch(r"[a-z0-9-]+", str(product.get("id", ""))):
                    raise ValueError("Product ID can only contain lowercase letters, numbers, and hyphens.")
                current = catalog()
                if product.get("category") not in {item["id"] for item in current.get("categories", [])}:
                    raise ValueError("Unknown category.")
                folder = str(product.get("folder", "")).strip().replace("\\", "/").strip("/")
                if not folder:
                    raise ValueError("Product folder is required.")
                safe_resolve(folder)
                product["folder"] = folder
                product["documents"] = {"folder": f"{folder}/Documents", "public_folder": f"{folder}/Documents/Public"}
                benchmark = product.get("benchmark", {})
                benchmark_name = "Benchmark_Result" if product["id"] in {
                    "asus-rog-ai-max395",
                    "asus-tuf-gaming-ai-max392",
                } else "Benchmark"
                benchmark["folder"] = f"{folder}/{benchmark_name}"
                benchmark["public_folder"] = f"{folder}/{benchmark_name}/Public"
                benchmark.setdefault("metrics", ["TTFT", "TPOT", "Throughput"])
                product["benchmark"] = benchmark
                product["scripts"] = {"folder": f"{folder}/Scripts", "public_folder": f"{folder}/Scripts"}
                original_id = payload.get("original_id")
                products = [item for item in current.get("products", []) if item.get("id") not in {original_id, product["id"]}]
                products.append(product)
                current["products"] = sorted(products, key=lambda item: (item.get("category", ""), item.get("name", "")))
                save_catalog(current)
                ensure_structure()
                return self.send_json({"ok": True, "catalog": current})
            if self.path == "/api/export":
                result = export_catalog(BASE, data_root())
                return self.send_json({"ok": True, **result})
            return self.send_json({"error": "Not found"}, 404)
        except Exception as exc:
            return self.send_json({"error": str(exc)}, 400)


def main():
    parser = argparse.ArgumentParser(description="AISO Platform local management server")
    parser.add_argument("--root", help="Override the data_root from config.json")
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()
    if args.root:
        os.environ["AISO_DATA_ROOT"] = args.root
    ensure_structure()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    url = f"http://{HOST}:{PORT}"
    print(f"[AISO] Local management portal: {url}")
    print(f"[AISO] Data root: {data_root()}")
    print("[AISO] Remote access: use an SSH Tunnel; do not expose this port directly.")
    if CONFIG.get("open_browser", True) and not args.no_browser:
        threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[AISO] Stopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
