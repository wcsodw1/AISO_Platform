import sys
from pathlib import Path as _P

sys.path.insert(0, str(_P(__file__).resolve().parent.parent))
import unittest

from benchmark.local_access import is_local_page_request as ok


class LocalAccessTest(unittest.TestCase):
    def test_local_page(self):
        self.assertTrue(ok("127.0.0.1", {"Host": "localhost:8765"}))
        self.assertTrue(ok("127.0.0.1", {"Host": "127.0.0.1:8765", "Origin": "http://127.0.0.1:8765"}))
        self.assertTrue(ok("::1", {"Host": "[::1]:8765"}))

    def test_other_machine_refused(self):
        self.assertFalse(ok("192.168.1.50", {"Host": "localhost:8765"}))

    def test_lan_host_name_refused(self):
        self.assertFalse(ok("127.0.0.1", {"Host": "192.168.1.108:8765"}))   # reached through the LAN address / a rebinding name

    def test_cross_site_refused(self):
        self.assertFalse(ok("127.0.0.1", {"Host": "localhost:8765", "Sec-Fetch-Site": "cross-site"}))
        self.assertFalse(ok("127.0.0.1", {"Host": "localhost:8765", "Origin": "https://evil.example"}))

    def test_bad_ip(self):
        self.assertFalse(ok("not-an-ip", {"Host": "localhost:8765"}))


if __name__ == "__main__":
    unittest.main()
