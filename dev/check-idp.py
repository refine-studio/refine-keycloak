"""Prove that a theme leaves the company sign-in buttons alone.

Renders the local broker realm's login page once per theme, reads every
company button (id="social-<alias>"), and compares where each one leads.
Per-request values (session code, tab id, client data) are dropped, because
Keycloak issues new ones on every page load. Then it follows each button and
checks that it lands on that company's own login.

Run through `make check-idp` while `make dev` is up. The Makefile switches the
realm's theme with kcadm and restores it. Exits 1 on any difference.
"""

import http.cookiejar
import json
import os
import sys
import urllib.parse
import urllib.request
from html.parser import HTMLParser

PORT = os.environ.get("KC_PORT", "8080")
BASE = f"http://localhost:{PORT}"
REALM = os.environ.get("BROKER_REALM", "broker")
VOLATILE = {"session_code", "tab_id", "client_data", "execution"}
# alias -> the realm whose login the button must reach
TARGETS = {"bum": "bum", "refine-studio": "refine"}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


class Buttons(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = {}

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "a" and (a.get("id") or "").startswith("social-"):
            self.links[a["id"][len("social-"):]] = a.get("href", "")


def login_page():
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    query = urllib.parse.urlencode(
        {
            "client_id": "account-console",
            "redirect_uri": f"{BASE}/realms/{REALM}/account/",
            "response_type": "code",
            "scope": "openid",
            "code_challenge": "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
            "code_challenge_method": "S256",
        }
    )
    with opener.open(f"{BASE}/realms/{REALM}/protocol/openid-connect/auth?{query}") as r:
        html = r.read().decode()
    parser = Buttons()
    parser.feed(html)
    return parser.links, jar


def stable(href):
    url = urllib.parse.urlsplit(href)
    params = urllib.parse.parse_qs(url.query)
    return url.path, {k: v for k, v in sorted(params.items()) if k not in VOLATILE}, sorted(params)


def follow(href, jar):
    # Keycloak marks its session cookies Secure even on local http, and the cookie
    # jar then withholds them. A browser on localhost sends them, so do the same.
    cookies = "; ".join(f"{c.name}={c.value}" for c in jar)
    opener = urllib.request.build_opener(NoRedirect)
    try:
        opener.open(urllib.request.Request(urllib.parse.urljoin(BASE, href), headers={"Cookie": cookies}))
    except urllib.error.HTTPError as e:
        if e.code in (302, 303):
            return e.headers["Location"]
        raise
    return None


def main():
    """`check-idp.py render THEME OUT` saves the stable button targets and follows
    each button. `check-idp.py compare STOCK OTHER...` diffs each saved file
    against the stock theme's."""
    mode, *args = sys.argv[1:]
    if mode == "compare":
        stock_file, *others = args
        stock = json.load(open(stock_file))
        failed = False
        for other_file in others:
            other = json.load(open(other_file))
            if other == stock:
                print(f"✅ same button targets in {stock_file} and {other_file}: {', '.join(sorted(stock))}")
            else:
                failed = True
                print(json.dumps({stock_file: stock, other_file: other}, indent=2))
                print(f"❌ button targets differ between {stock_file} and {other_file}")
        sys.exit(1 if failed else 0)

    theme, out = args
    links, _ = login_page()
    if not links:
        sys.exit(f"❌ {theme}: no company buttons on the page")
    failed = False
    for alias, href in sorted(links.items()):
        target = TARGETS.get(alias)
        # A click uses up the page's session code, so each button gets a fresh page.
        fresh, fresh_jar = login_page()
        location = follow(fresh[alias], fresh_jar) or ""
        expected = f"{BASE}/realms/{target}/protocol/openid-connect/auth"
        ok = bool(target) and location.startswith(expected) and "client_id=broker" in location
        failed |= not ok
        print(f"{'✅' if ok else '❌'} {theme:12} {alias:14} → {location.split('?')[0] or 'no redirect'}")
    with open(out, "w") as f:
        json.dump({alias: stable(href) for alias, href in links.items()}, f, indent=2, sort_keys=True)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
