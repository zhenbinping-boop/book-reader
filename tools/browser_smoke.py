"""用本机 Chrome/Chromium 跑浏览器回归（先启动 npm run dev）。

python tools/browser_smoke.py [URL] [--all] [--timeout 120]
可用 CHROME_BIN 指定浏览器，CHROME_ARGS 追加参数。
每页使用独立临时 profile，测试不会接触日常阅读数据。
"""

import argparse
import http.server
import os
from pathlib import Path
import shlex
import signal
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from urllib.parse import urljoin

PORT = 5178
ROOT = Path(__file__).resolve().parent.parent
lines = []


class Handler(http.server.BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', '*')

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_POST(self):
        n = int(self.headers.get('content-length') or 0)
        body = self.rfile.read(n).decode('utf-8', 'replace')
        lines.append(body)
        print('  ' + body, flush=True)
        self.send_response(200)
        self._cors()
        self.send_header('Content-Length', '2')
        self.end_headers()
        self.wfile.write(b'ok')

    def log_message(self, *args):
        pass


def find_chrome():
    configured = os.environ.get('CHROME_BIN')
    if configured:
        if Path(configured).is_file():
            return configured
        raise SystemExit('CHROME_BIN 不存在: ' + configured)
    for name in ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome', 'msedge']:
        found = shutil.which(name)
        if found:
            return found
    candidates = [Path('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')]
    for env in ['PROGRAMFILES', 'PROGRAMFILES(X86)', 'LOCALAPPDATA']:
        base = os.environ.get(env)
        if base:
            candidates.extend(Path(base) / rel for rel in [
                'Google/Chrome/Application/chrome.exe', 'Microsoft/Edge/Application/msedge.exe'])
    for candidate in candidates:
        if candidate.is_file():
            return str(candidate)
    raise SystemExit('找不到 Chrome/Chromium，请安装浏览器或设置 CHROME_BIN')


def is_failure(line):
    return line.startswith(('BAD ', 'THROWN:', 'FAIL:', 'WINDOW ERROR:', 'REJECTION:')) or 'RESULT: FAIL' in line


def run_page(chrome, target, timeout):
    lines.clear()
    with tempfile.TemporaryDirectory(prefix='book-reader-smoke-', ignore_cleanup_errors=True) as profile:
        args = [chrome, '--headless=new', '--disable-gpu', '--no-first-run',
                '--no-default-browser-check', '--disable-dev-shm-usage', '--incognito',
                '--window-size=1280,900', f'--user-data-dir={profile}']
        if hasattr(os, 'geteuid') and os.geteuid() == 0:
            args.append('--no-sandbox')
        args.extend(shlex.split(os.environ.get('CHROME_ARGS', '')))
        with tempfile.TemporaryFile(mode='w+') as stderr:
            proc = subprocess.Popen(args + [target], stdout=subprocess.DEVNULL, stderr=stderr,
                                    start_new_session=os.name != 'nt')
            deadline = time.monotonic() + timeout
            try:
                while time.monotonic() < deadline and proc.poll() is None:
                    if any('ALL DONE' in line or line.startswith('FAIL:') for line in lines):
                        break
                    time.sleep(0.1)
            finally:
                # Chrome's launcher may exit before renderer/cache children do.
                # Stop the isolated process group before deleting its profile.
                if os.name != 'nt':
                    try:
                        os.killpg(proc.pid, signal.SIGTERM)
                    except ProcessLookupError:
                        pass
                else:
                    proc.terminate()
                try:
                    proc.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    proc.wait()
                if os.name != 'nt':
                    try:
                        os.killpg(proc.pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
            done = any('ALL DONE' in line for line in lines)
            failures = [line for line in lines if is_failure(line)]
            ok = done and not failures
            print(f'RESULT: {"PASS" if ok else "INCOMPLETE/FAIL"} {target}', flush=True)
            if not ok:
                stderr.seek(0)
                print(stderr.read()[-4000:])
            return ok


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('url', nargs='?', default='http://localhost:5173/dev-smoke.html')
    parser.add_argument('--all', action='store_true', help='在 URL 的站点上运行全部回归页')
    parser.add_argument('--timeout', type=float, default=120)
    args = parser.parse_args()
    chrome = find_chrome()
    targets = [args.url]
    if args.all:
        targets = [urljoin(args.url, page.name) for page in sorted(ROOT.glob('dev-*.html'))
                   if page.name != 'dev-android.html']  # Android 手工 CDP 调试页无完成标记
    with http.server.HTTPServer(('127.0.0.1', PORT), Handler) as server:
        threading.Thread(target=server.serve_forever, daemon=True).start()
        results = []
        try:
            for target in targets:
                print('\nRunning ' + target, flush=True)
                results.append(run_page(chrome, target, args.timeout))
        finally:
            server.shutdown()
    print(f'\n{sum(results)}/{len(results)} pages passed')
    return 0 if all(results) else 1


if __name__ == '__main__':
    sys.exit(main())
