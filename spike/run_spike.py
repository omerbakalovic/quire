#!/usr/bin/env python3
"""Run the desktop engine checklist in Firefox. Writes spike/results/checklist.json."""

import json
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPIKE = ROOT / "spike"
RESULTS = SPIKE / "results"
GECKO = Path.home() / ".local/bin/geckodriver"
FOLIATE_SHA = "78914aef4466eb960965702401634c2cb348e9b1"
NODE = Path.home() / ".local/node/bin/node"
NPM = Path.home() / ".local/node/bin/npm"

JOBS = [
    ("foliate", "noteref", "/test-books/fixtures/noteref.epub", "full", 180),
    ("epubjs", "noteref", "/test-books/fixtures/noteref.epub", "full", 180),
    ("foliate", "malformed", "/test-books/fixtures/malformed.epub", "open", 90),
    ("epubjs", "malformed", "/test-books/fixtures/malformed.epub", "open", 90),
    ("foliate", "drm", "/test-books/fixtures/drm.epub", "open", 90),
    ("epubjs", "drm", "/test-books/fixtures/drm.epub", "open", 90),
    ("foliate", "scripted", "/test-books/fixtures/scripted.epub", "script", 90),
    ("epubjs", "scripted", "/test-books/fixtures/scripted.epub", "script", 90),
    ("foliate", "se-frankenstein", "/test-books/downloaded/se-frankenstein.epub", "real", 180),
    ("epubjs", "se-frankenstein", "/test-books/downloaded/se-frankenstein.epub", "real", 180),
    ("foliate", "pg1342", "/test-books/downloaded/pg1342.epub", "real", 180),
    ("epubjs", "pg1342", "/test-books/downloaded/pg1342.epub", "real", 180),
    ("foliate", "pg2600", "/test-books/downloaded/pg2600.epub", "timing", 240),
    ("epubjs", "pg2600", "/test-books/downloaded/pg2600.epub", "timing", 240),
    ("foliate", "large-images", "/test-books/downloaded/pg1184-images.epub", "timing", 300),
    ("epubjs", "large-images", "/test-books/downloaded/pg1184-images.epub", "timing", 300),
]


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def http_json(url: str, payload: dict | None = None, timeout: int = 30):
    data = None if payload is None else json.dumps(payload).encode()
    request = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST" if payload is not None else "GET",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        body = response.read().decode()
        return json.loads(body) if body else {}


class WebDriver:
    def __init__(self, port: int):
        self.base = f"http://127.0.0.1:{port}"
        created = http_json(
            f"{self.base}/session",
            {
                "capabilities": {
                    "alwaysMatch": {
                        "browserName": "firefox",
                        "moz:firefoxOptions": {"args": ["-headless"]},
                    }
                }
            },
        )
        self.session = created["value"]["sessionId"]

    def call(self, method: str, payload: dict | None = None):
        return http_json(f"{self.base}/session/{self.session}{method}", payload, timeout=60)

    def go(self, url: str):
        self.call("/url", {"url": url})

    def script(self, source: str):
        result = self.call("/execute/sync", {"script": source, "args": []})
        return result.get("value")

    def close(self):
        try:
            urllib.request.urlopen(
                urllib.request.Request(
                    f"{self.base}/session/{self.session}",
                    method="DELETE",
                ),
                timeout=10,
            )
        except (urllib.error.URLError, TimeoutError):
            pass


def prepare() -> None:
    sha = subprocess.check_output(
        ["git", "-C", str(SPIKE / "vendor/foliate-js"), "rev-parse", "HEAD"],
        text=True,
    ).strip()
    if sha != FOLIATE_SHA:
        raise SystemExit(f"foliate-js is {sha}, expected {FOLIATE_SHA}")
    if not (SPIKE / "node_modules/epubjs/dist/epub.min.js").exists():
        subprocess.check_call([str(NPM), "install"], cwd=SPIKE)
    subprocess.check_call([str(NODE), "scripts/build-fixtures.mjs"], cwd=ROOT)


def bridge_check(driver: WebDriver, origin: str) -> dict:
    driver.go(f"{origin}/assets/reader/index.html")
    time.sleep(0.4)
    reply = driver.script(
        """
        window.dispatchEvent(new MessageEvent('message', {
          data: JSON.stringify({ type: 'ping', id: 'bridge-1' })
        }));
        return window.__quireReply || null;
        """
    )
    return {"reply": reply}


def run_job(driver: WebDriver, origin: str, job: tuple) -> dict:
    engine, name, book, kind, limit = job
    file_path = ROOT / book.lstrip("/")
    if not file_path.exists():
        return {"engine": engine, "book": name, "skipped": True, "reason": "missing file"}
    url = f"{origin}/spike/harness.html?engine={engine}&kind={kind}&book={book}"
    started = time.time()
    driver.go(url)
    deadline = time.time() + limit
    value = None
    while time.time() < deadline:
        value = driver.script("return window.__result || null;")
        if value is not None:
            break
        time.sleep(0.4)
    if value is None:
        try:
            extra = driver.script(
                "return { errors: window.__errors || [], progress: window.__progress || null };"
            )
        except Exception as error:  # noqa: BLE001 — the page may be stuck
            extra = {"errors": [str(error)], "progress": None}
        value = {"ok": False, "error": "timed out", **(extra or {})}
    return {
        "engine": engine,
        "book": name,
        "kind": kind,
        "elapsedSec": round(time.time() - started, 1),
        "result": value,
    }


def selected_jobs() -> list:
    if len(sys.argv) == 1:
        return JOBS
    wanted = set(sys.argv[1:])
    chosen = [
        job for job in JOBS
        if job[1] in wanted or f"{job[0]}:{job[1]}" in wanted
    ]
    if not chosen:
        raise SystemExit(f"no jobs matched {sorted(wanted)}")
    return chosen


def main() -> None:
    prepare()
    RESULTS.mkdir(parents=True, exist_ok=True)
    http_port = free_port()
    gecko_port = free_port()
    server = subprocess.Popen(
        ["python3", "-m", "http.server", str(http_port), "--bind", "127.0.0.1"],
        cwd=ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    gecko = subprocess.Popen(
        [str(GECKO), "--port", str(gecko_port), "--host", "127.0.0.1"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    time.sleep(0.8)
    origin = f"http://127.0.0.1:{http_port}"
    driver = WebDriver(gecko_port)
    report = {"bridgePage": None, "jobs": []}
    try:
        report["bridgePage"] = bridge_check(driver, origin)
        for job in selected_jobs():
            print(f"run {job[0]} {job[1]}", flush=True)
            try:
                report["jobs"].append(run_job(driver, origin, job))
            except Exception as error:  # noqa: BLE001 — one book should not abort the checklist
                report["jobs"].append({
                    "engine": job[0],
                    "book": job[1],
                    "error": str(error),
                })
    finally:
        driver.close()
        gecko.terminate()
        server.terminate()
    RESULTS.joinpath("checklist.json").write_text(json.dumps(report, indent=2))
    print(f"wrote {RESULTS / 'checklist.json'}")


if __name__ == "__main__":
    main()
