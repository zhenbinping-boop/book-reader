"""Fail CI when APK is a remote wrapper or lacks offline PDF assets."""
import argparse
import json
import re
import subprocess
import zipfile
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('apk')
parser.add_argument('--aapt', help='Android aapt executable for actual manifest checks')
parser.add_argument('--signature-report', help='Successful apksigner --print-certs report')
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
expected_app_id = 'io.github.zhenbinpingboop.bookreader.ink'

if args.aapt:
    info = subprocess.check_output([args.aapt, 'dump', 'badging', args.apk], text=True)
    package = re.search(r"package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'", info)
    assert package, 'Cannot read packaged app identity/version'
    expected_version = json.loads((root / 'package.json').read_text())['version']
    expected_code = re.search(r'versionCode (\d+)', (root / 'android/app/build.gradle').read_text()).group(1)
    assert package.group(1) == expected_app_id, 'Wrong Android application ID'
    assert package.group(2) == expected_code, 'Packaged versionCode does not match Gradle'
    assert package.group(3) == expected_version, 'Packaged versionName does not match package.json'
    assert "application-label:'栖读'" in info, 'Wrong launcher name'
    assert re.search(r"launchable-activity: name='io.github.zhenbinpingboop.bookreader.MainActivity'", info), 'Wrong launcher activity'
    print('Packaged app ID:', package.group(1))
    print('Packaged app version:', package.group(3), 'code:', package.group(2))

if args.signature_report:
    report = Path(args.signature_report).read_text()
    expected = (root / 'android/alpha-signing-certificate.sha256').read_text().strip().lower()
    cert = re.search(r'Signer #1 certificate SHA-256 digest: ([0-9a-fA-F]+)', report)
    assert cert and cert.group(1).lower() == expected, 'Signing certificate differs from the pinned Ink Alpha certificate'
    print('Pinned Ink Alpha signing certificate:', expected)

with zipfile.ZipFile(args.apk) as apk:
    names = apk.namelist()
    config = json.loads(apk.read('assets/capacitor.config.json'))
    assert config['appId'] == expected_app_id
    assert config['appName'] == '栖读'
    assert not config.get('server', {}).get('url'), 'APK must use bundled resources'
    assert 'assets/public/index.html' in names
    assert 'assets/public/webview-error.html' in names
    for asset in ['art/ink-landscape.webp', 'art/bound-covers.webp', 'fonts/reader-song.woff2']:
        assert 'assets/public/' + asset in names, 'Missing offline UI asset: ' + asset
    assert any(n.startswith('assets/public/cmaps/') for n in names)
    assert any(n.startswith('assets/public/standard_fonts/') for n in names)
    assert any('pdf.worker' in n and n.endswith('.mjs') for n in names)
    assert not any(n.endswith('/sw.js') for n in names), 'Native builds must bypass PWA cache'
    assert not any(n.endswith(('.keystore', '.jks')) for n in names)
print('APK acceptance: local app, PDF worker/fonts/CMaps, no SW or signing keys')
