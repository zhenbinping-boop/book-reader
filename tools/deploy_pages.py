#!/usr/bin/env python
"""把一个本地目录作为静态站推到远端分支（默认 gh-pages），用于 GitHub Pages 托管。

背景：本机 git 到 github.com 走不通（沙箱代理 + schannel 吊销检查），
所以改为只访问 api.github.com 的 Git Data API，与 push_via_api.py 同一套路子。

用法：
    GITHUB_TOKEN=xxx python tools/deploy_pages.py dist-gh --branch gh-pages
    GITHUB_TOKEN=xxx python tools/deploy_pages.py dist-gh --branch gh-pages --message "deploy: v0.1.0"

token 需要该仓库的 Contents 读写权限（fine-grained）。
"""
import argparse
import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request

OWNER = 'zhenbinping-boop'
REPO = 'book-reader'
API = 'https://api.github.com'

TOKEN = os.environ.get('GITHUB_TOKEN')
if not TOKEN:
    sys.exit('缺少 token：设置环境变量 GITHUB_TOKEN')


def api(method, path, payload=None, ok=(200, 201), timeout=90, retries=4):
    """调 api.github.com。代理偶发掐长响应 → 带超时重试。

    Git Data API 的重试是安全的：同内容 -> 同 sha，最坏留几个孤儿对象。
    """
    data = json.dumps(payload).encode('utf-8') if payload is not None else None
    last = None
    for attempt in range(1, retries + 1):
        req = urllib.request.Request(
            API + path,
            data=data,
            method=method,
            headers={
                'Authorization': 'Bearer ' + TOKEN,
                'Accept': 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
                'Content-Type': 'application/json',
                'User-Agent': 'book-reader-deploy',
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
            raise RuntimeError('HTTP %s %s -> %s' % (e.code, path, body[:400]))
        except Exception as e:
            last = e
            print('    ! %s %s 第 %d 次失败: %s' % (method, path, attempt, type(e).__name__))
            if attempt < retries:
                time.sleep(2 * attempt)
    raise RuntimeError('%s %s 重试 %d 次仍失败: %r' % (method, path, retries, last))


def collect(root, ignore=()):
    """返回 [(相对路径, 绝对路径)]，路径统一用 / 分隔。"""
    out = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in ignore]
        for name in filenames:
            abs_p = os.path.join(dirpath, name)
            rel = os.path.relpath(abs_p, root).replace(os.sep, '/')
            out.append((rel, abs_p))
    out.sort()
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('dir', help='要部署的本地目录（如 dist-gh）')
    ap.add_argument('--branch', default='gh-pages')
    ap.add_argument('--message', default='deploy: 发布静态站')
    args = ap.parse_args()

    root = os.path.abspath(args.dir)
    if not os.path.isdir(root):
        sys.exit('目录不存在: %s' % root)

    who = api('GET', '/user')
    print('authenticated as:', who.get('login'))

    files = collect(root)
    print('files to deploy:', len(files))

    # 分支已存在则以其 tree 为 base，保留未被覆盖的文件；不存在就是首个提交
    base_tree = None
    parents = []
    try:
        ref = api('GET', '/repos/%s/%s/git/ref/heads/%s' % (OWNER, REPO, args.branch))
        sha = ref['object']['sha']
        parents = [sha]
        base_tree = api('GET', '/repos/%s/%s/git/commits/%s' % (OWNER, REPO, sha))['tree']['sha']
        print('已有分支 %s，base tree %s' % (args.branch, base_tree[:8]))
    except RuntimeError as e:
        if '404' not in str(e) and '409' not in str(e):
            raise
        print('分支 %s 不存在，将新建' % args.branch)

    entries = []
    total = 0
    for i, (rel, abs_p) in enumerate(files, 1):
        raw = open(abs_p, 'rb').read()
        total += len(raw)
        blob = api('POST', '/repos/%s/%s/git/blobs' % (OWNER, REPO), {
            'content': base64.b64encode(raw).decode('ascii'),
            'encoding': 'base64',
        })
        entries.append({'path': rel, 'mode': '100644', 'type': 'blob', 'sha': blob['sha']})
        if i % 20 == 0 or i == len(files):
            print('  [%3d/%d] ... %s' % (i, len(files), rel))

    # Pages 默认会走 Jekyll，加个 .nojekyll 跳过处理后处理（也避免下划线开头的文件被吃掉）
    blob = api('POST', '/repos/%s/%s/git/blobs' % (OWNER, REPO), {
        'content': base64.b64encode(b'').decode('ascii'),
        'encoding': 'base64',
    })
    entries.append({'path': '.nojekyll', 'mode': '100644', 'type': 'blob', 'sha': blob['sha']})

    payload = {'tree': entries}
    if base_tree:
        payload['base_tree'] = base_tree
    tree = api('POST', '/repos/%s/%s/git/trees' % (OWNER, REPO), payload)
    print('tree:', tree['sha'], '（%.1f MB）' % (total / 1024 / 1024))

    commit_payload = {'message': args.message, 'tree': tree['sha']}
    if parents:
        commit_payload['parents'] = parents
    commit = api('POST', '/repos/%s/%s/git/commits' % (OWNER, REPO), commit_payload)
    print('commit:', commit['sha'])

    if parents:
        api('PATCH', '/repos/%s/%s/git/refs/heads/%s' % (OWNER, REPO, args.branch),
            {'sha': commit['sha'], 'force': False})
        print('updated ref', args.branch)
    else:
        api('POST', '/repos/%s/%s/git/refs' % (OWNER, REPO),
            {'ref': 'refs/heads/' + args.branch, 'sha': commit['sha']})
        print('created ref', args.branch)

    print('\n完成 -> https://github.com/%s/%s/tree/%s' % (OWNER, REPO, args.branch))


if __name__ == '__main__':
    main()
