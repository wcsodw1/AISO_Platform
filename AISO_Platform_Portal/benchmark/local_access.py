"""Local-page access for the Benchmark API (loopback only).

A request counts as a *local page request* when ALL of these hold: it comes from the loopback address, the Host header is a loopback name, it is not cross-site,
and any Origin header names the same host. Such a request needs no Bearer token (the token only protects against other machines / other sites, which are already
refused here). Starting a run is NOT covered: it still needs the one-time test-password ticket (run_auth), and the shell terminal has its own password.
"""
from __future__ import annotations

import ipaddress
import urllib.parse

LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "::1"}


def is_local_page_request(client_ip: str, headers) -> bool:
    try:
        if not ipaddress.ip_address(client_ip).is_loopback:
            return False
    except ValueError:
        return False
    host_header = headers.get("Host") or ""
    host = host_header.rsplit(":", 1)[0].strip("[]").lower() if not host_header.startswith("[") else host_header.split("]")[0].strip("[").lower()
    if host not in LOOPBACK_HOSTS:
        return False
    if headers.get("Sec-Fetch-Site") == "cross-site":
        return False
    origin = headers.get("Origin", "")
    if origin and urllib.parse.urlparse(origin).netloc != host_header:
        return False
    return True
