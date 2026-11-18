"""Known-answer controls for the browser receipt runner.

python tools/test_browser_smoke.py
Checks a burst of 96 receipts and a deliberately late BAD after ALL DONE.
Uses isolated Chrome profiles and an ephemeral local server, never user data.
"""
import contextlib
import io
import threading
import unittest
import browser_smoke as smoke


class ReceiptHandler(smoke.Handler):
    def do_GET(self):
        if self.path == '/burst':
            script = "for(let i=0;i<96;i++)fetch('/log',{method:'POST',body:'ok  planted-'+i});fetch('/log',{method:'POST',body:'ALL DONE'})"
        else:
            script = "fetch('/log',{method:'POST',body:'ALL DONE'}).then(()=>setTimeout(()=>fetch('/log',{method:'POST',body:'BAD planted-late-failure'}),100))"
        body = ('<!doctype html><script>' + script + '</script>').encode()
        self.send_response(200)
        self.send_header('Content-Type', 'text/html')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class ReceiptControls(unittest.TestCase):
    def test_known_burst_and_deliberate_late_failure(self):
        with smoke.LogServer(('127.0.0.1', 0), ReceiptHandler) as server:
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            url = f'http://127.0.0.1:{server.server_port}'
            try:
                with contextlib.redirect_stdout(io.StringIO()):
                    self.assertTrue(smoke.run_page(smoke.find_chrome(), url + '/burst', 15))
                    self.assertEqual(len([line for line in smoke.lines if line.startswith('ok  planted-')]), 96)
                    self.assertFalse(smoke.run_page(smoke.find_chrome(), url + '/late-bad', 15))
                    self.assertIn('BAD planted-late-failure', smoke.lines)
            finally:
                server.shutdown()
                thread.join(timeout=3)


if __name__ == '__main__':
    unittest.main()
