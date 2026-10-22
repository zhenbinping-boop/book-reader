"""启动隔离测试服务器，执行浏览器验收，再关闭服务器。

python tools/run_acceptance.py [--page dev-mobile-acceptance.html] [--timeout 120]
需要 Node.js、Python 3 和 Chrome/Chromium/Edge；可设置 CHROME_BIN。
"""
import argparse
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request

ROOT = Path(__file__).resolve().parent.parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--page', help='只执行指定的 dev-*.html，否则执行全套')
    parser.add_argument('--timeout', type=float, default=120)
    args = parser.parse_args()
    if args.page and (Path(args.page).name != args.page or not args.page.startswith('dev-') or not args.page.endswith('.html') or not (ROOT / args.page).is_file()):
        parser.error('--page 必须是项目内现有 dev-*.html 文件名')
    node = shutil.which('node')
    if not node:
        raise SystemExit('找不到 Node.js，请先安装 Node.js 22.13.0 或更新版本')
    subprocess.run([node, 'tools/copy_pdf_assets.mjs'], cwd=ROOT, check=True)
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    url = f'http://127.0.0.1:{port}/'
    with tempfile.TemporaryFile(mode='w+') as output:
        server = subprocess.Popen([node, 'node_modules/vite/bin/vite.js', '--host', '127.0.0.1',
                                   '--port', str(port), '--strictPort'], cwd=ROOT,
                                  stdout=output, stderr=output)
        try:
            deadline = time.monotonic() + 20
            while time.monotonic() < deadline:
                if server.poll() is not None:
                    raise RuntimeError('测试服务器提前退出')
                try:
                    with urllib.request.urlopen(url, timeout=1) as response:
                        if response.status == 200:
                            break
                except OSError:
                    time.sleep(.1)
            else:
                raise RuntimeError('测试服务器启动超时')
            command = [sys.executable, 'tools/browser_smoke.py', url + (args.page or 'dev-smoke.html'),
                       '--timeout', str(args.timeout)]
            if not args.page:
                command.append('--all')
            return subprocess.run(command, cwd=ROOT).returncode
        except Exception:
            output.seek(0)
            print(output.read()[-4000:], file=sys.stderr)
            raise
        finally:
            server.terminate()
            try:
                server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait()


if __name__ == '__main__':
    sys.exit(main())
