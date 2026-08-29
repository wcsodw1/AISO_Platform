#!/usr/bin/env python3
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from exporter import export_catalog  # noqa: E402

config = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))
configured_root = Path(config.get("data_root", "~/AISO-Platform-Data")).expanduser()
data_root = (ROOT / configured_root).resolve() if not configured_root.is_absolute() else configured_root.resolve()
print(json.dumps(export_catalog(ROOT, data_root), ensure_ascii=False, indent=2))
