#!/usr/bin/env python
"""创建 GitHub Release，可选附带构建产物 zip。

用法：
    GITHUB_TOKEN=xxx python tools/create_release.py \
        --tag v0.1.0 --target main \
        --name "book-reader v0.1.0" \
        --notes-file notes.md \
        --asset dist-gh

--asset 传目录时自动打包成 zip 再上传（走 uploads.github.com，该域名可能被沙箱代理拦，
失败不致命，会降级为只创建 release）。
"""
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile

OWNER = 'zhenbinping-boop'
REPO = 'book-reader'
API = 'https://api.github.com'

TOKEN = os.environ.get('GITHUB_TOKEN')
if not TOKEN:
    sys.exit('缺少 token：设置环境变量 GITHUB_TOKEN')


def api(method, path, payload=None, ok=(200, 201), timeout=90, retries=4):
    data = json.dumps(payload).encode('utf-8') if payload is not None else None
    last = None
    for attempt in range(1, retries + 1):
        req = urllib.request.Request(
            API + path, data=data, method=method,
            headers={
                'Authorization': 'Bearer ' + TOKEN,
                'Accept': 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
                'Content-Type': 'application/json',
                'User-Agent': 'book-reader-release',
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                body = r.read().decode('utf-8', 'replace')
                if r.status not in ok:
                    raise RuntimeError('HTTP %s: %s' % (r.status, body[:400]))
                return json.loads(body) if body.strip() else {}
        except urllib.error.HTTPError as e:
            body = e.read().decode('utf-8', 'replace')
            raise RuntimeError('HTTP %s %s -> %s' % (e.code, path, body[:500]))
        except Exception as e:
            last = e
            print('    ! %s %s 第 %d 次失败: %s' % (method, path, attempt, type(e).__name__))
            if attempt < retries:
                time.sleep(2 * attempt)
    raise RuntimeError('%s %s 重试 %d 次仍失败: %r' % (method, path, retries, last))


def zip_dir(src, out_zip):
    n = 0
    with zipfile.ZipFile(out_zip, 'w', zipfile.ZIP_DEFLATED) as z:
        for dirpath, _dirnames, filenames in os.walk(src):
            for name in filenames:
                p = os.path.join(dirpath, name)
                z.write(p, os.path.relpath(p, src).replace(os.sep, '/'))
                n += 1
    return n


def upload_asset(release, file_path):
    """上传 release asset。走 uploads.github.com，可能被沙箱代理拦住。"""
    name = os.path.basename(file_path)
    raw = open(file_path, 'rb').read()
    url = ('https://uploads.github.com/repos/%s/%s/releases/%d/assets?name=%s'
           % (OWNER, REPO, release['id'], urllib.parse.quote(name)))
    req = urllib.request.Request(
        url, data=raw, method='POST',
        headers={
            'Authorization': 'Bearer ' + TOKEN,
            'Accept': 'application/vnd.github+json',
            'Content-Type': 'application/zip',
            'Content-Length': str(len(raw)),
            'User-Agent': 'book-reader-release',
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            return json.loads(r.read().decode('utf-8', 'replace'))
    except urllib.error.HTTPError as e:
        raise RuntimeError('asset 上传 HTTP %s -> %s'
                           % (e.code, e.read().decode('utf-8', 'replace')[:300]))
    except Exception as e:
        raise RuntimeError('asset 上传失败: %r' % (e,))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--tag', required=True)
    ap.add_argument('--target', default='main', help='tag 指向的分支/commit')
    ap.add_argument('--name', default=None)
    ap.add_argument('--notes-file', default=None)
    ap.add_argument('--asset', default=None, help='要附带为 zip 的目录或文件')
    ap.add_argument('--prerelease', action='store_true')
    args = ap.parse_args()

    body = open(args.notes_file, encoding='utf-8').read() if args.notes_file else ''
    payload = {
        'tag_name': args.tag,
        'target_commitish': args.target,
        'name': args.name or args.tag,
        'body': body,
        'draft': False,
        'prerelease': args.prerelease,
    }

    print('创建 release %s（指向 %s）...' % (args.tag, args.target))
    rel = api('POST', '/repos/%s/%s/releases' % (OWNER, REPO), payload)
    print('release:', rel['html_url'])
    print('tag:', rel['tag_name'], '->', rel.get('target_commitish'))

    if args.asset:
        src = args.asset
        zip_path = os.path.join(os.environ.get('TEMP', '/tmp'),
                                'book-reader-%s.zip' % args.tag)
        if os.path.isdir(src):
            n = zip_dir(src, zip_path)
            print('打包 %d 个文件 -> %s (%d KB)' % (n, zip_path, os.path.getsize(zip_path) // 1024))
        else:
            zip_path = src
        try:
            a = upload_asset(rel, zip_path)
            print('asset:', a['name'], '%.1f KB' % (a['size'] / 1024))
            print('download:', a['browser_download_url'])
        except RuntimeError as e:
            print('!! asset 未能上传（release 已创建，可稍后手动补）：%s' % str(e)[:300])

    print('\n完成 ->', rel['html_url'])


if __name__ == '__main__':
    main()
