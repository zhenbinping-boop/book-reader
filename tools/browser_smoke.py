"""在真实（无头）浏览器里跑 dev-smoke.html，并把页面日志实时回传到本地端口。

用法：python tools/browser_smoke.py [url]
"""

import http.server
import os
import subprocess
import sys
import threading
import time

PORT = 5178
TARGET = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5173/dev-smoke.html"
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PROFILE = "D:/book-reader/.tmp/smoke-profile"

lines = []


class Handler(http.server.BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_POST(self):
        n = int(self.headers.get("content-length") or 0)
        body = self.rfile.read(n).decode("utf-8", "replace")
        lines.append(body)
        print("  " + body, flush=True)
        self.send_response(200)
        self._cors()
        self.send_header("Content-Length", "2")
        self.end_headers()
        self.wfile.write(b"ok")

    def log_message(self, *args):
        pass


def main():
    server = http.server.HTTPServer(("127.0.0.1", PORT), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()

    if not os.path.isfile(CHROME):
        raise SystemExit("找不到 Chrome: " + CHROME)

    proc = subprocess.Popen(
        [
            CHROME,
            "--headless=new",
            "--disable-gpu",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-dev-shm-usage",
            # 复用 profile 时 Chrome 会恢复上次会话（含历史里的 iframe 页面），
            # 导致同一个测试页被加载两次、日志混入噪声。无痕模式可避免。
            "--incognito",
            f"--user-data-dir={PROFILE}",
            TARGET,
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    deadline = time.time() + 60
    try:
        while time.time() < deadline:
            if any("ALL DONE" in l or l.startswith("FAIL:") for l in lines):
                break
            time.sleep(0.5)
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
        server.shutdown()

    print("\n--- summary ---")
    print(f"lines received: {len(lines)}")
    ok = any("ALL DONE" in l for l in lines)
    print("RESULT:", "PASS" if ok else "INCOMPLETE/FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
