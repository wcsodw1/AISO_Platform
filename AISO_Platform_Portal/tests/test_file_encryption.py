import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

import sys
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from exporter import FILE_MAGIC, derive_file_key, encrypt_bytes, public_files  # noqa: E402


class EncryptedPublishing(unittest.TestCase):
    def test_nothing_is_published_without_a_key_and_files_are_ciphertext_with_one(self):
        with tempfile.TemporaryDirectory() as folder:
            source, target = Path(folder) / "src", Path(folder) / "dst"
            source.mkdir()
            (source / "report.pdf").write_bytes(b"%PDF-1.4 confidential body")
            self.assertEqual(public_files(source, target, "assets/x", None), [])
            self.assertFalse(target.exists())
            items = public_files(source, target, "assets/x", derive_file_key("test code"))
            self.assertEqual((items[0]["url"], items[0]["encrypted"], items[0]["extension"]), ("assets/x/report.pdf.enc", True, "pdf"))
            blob = (target / "report.pdf.enc").read_bytes()
            self.assertTrue(blob.startswith(FILE_MAGIC))
            self.assertNotIn(b"confidential body", blob)
            self.assertFalse((target / "report.pdf").exists())

    def test_without_a_key_existing_encrypted_copies_are_kept_not_deleted(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source, target, previous = root / "src", root / "new", root / "old"
            source.mkdir()
            (source / "kept.pdf").write_bytes(b"one")
            (source / "fresh.pdf").write_bytes(b"two")
            (previous / "assets/x").mkdir(parents=True)
            (previous / "assets/x/kept.pdf.enc").write_bytes(b"AISOENC1-previous")
            items = public_files(source, target, "assets/x", None, previous)
            self.assertEqual([item["name"] for item in items], ["kept.pdf"])
            self.assertEqual((target / "kept.pdf.enc").read_bytes(), b"AISOENC1-previous")
            self.assertFalse((target / "fresh.pdf.enc").exists())
            self.assertFalse((target / "kept.pdf").exists())

    def test_each_file_gets_a_fresh_iv(self):
        key = derive_file_key("test code")
        self.assertNotEqual(encrypt_bytes(key, b"same"), encrypt_bytes(key, b"same"))

    @unittest.skipUnless(shutil.which("node"), "node is required")
    def test_the_browser_code_decrypts_what_the_exporter_wrote(self):
        key = derive_file_key("Test Code")
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "file.enc"
            path.write_bytes(encrypt_bytes(key, "hello 中文 world".encode()))
            script = (
                "const g=require('./access-gate.js'),fs=require('fs');"
                "(async()=>{const data=new Uint8Array(fs.readFileSync(process.argv[1]));"
                "const good=await g.decryptBytes(data,await g.deriveFileKey(' test code '));"
                "let wrong='no-error';try{await g.decryptBytes(data,await g.deriveFileKey('nope'))}catch(e){wrong=e.message}"
                "console.log(JSON.stringify({text:Buffer.from(good).toString(),wrong}))})()"
            )
            result = subprocess.run(["node", "-e", script, str(path)], cwd=ROOT, capture_output=True, text=True, timeout=60)
            self.assertEqual(result.returncode, 0, result.stderr)
            outcome = json.loads(result.stdout)
            self.assertEqual(outcome["text"], "hello 中文 world")
            self.assertIn("Could not decrypt", outcome["wrong"])


if __name__ == "__main__":
    unittest.main()
