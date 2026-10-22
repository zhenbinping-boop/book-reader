"""Fail CI when APK is a remote wrapper or lacks offline PDF assets."""
import json
import sys
import zipfile

with zipfile.ZipFile(sys.argv[1]) as apk:
    names = apk.namelist()
    config = json.loads(apk.read('assets/capacitor.config.json'))
    assert config['appId'] == 'io.github.zhenbinpingboop.bookreader'
    assert not config.get('server', {}).get('url'), 'APK must use bundled resources'
    assert 'assets/public/index.html' in names
    assert 'assets/public/webview-error.html' in names
    assert any(n.startswith('assets/public/cmaps/') for n in names)
    assert any(n.startswith('assets/public/standard_fonts/') for n in names)
    assert any('pdf.worker' in n and n.endswith('.mjs') for n in names)
    assert not any(n.endswith('/sw.js') for n in names), 'Native builds must bypass PWA cache'
    assert not any(n.endswith(('.keystore', '.jks')) for n in names)
print('APK acceptance: local app, PDF worker/fonts/CMaps, no SW or signing keys')
