#!/usr/bin/env python
"""在 git push 到 github.com 被代理阻断时，改用 api.github.com 推送本地提交。

原理：GitHub 的 Git Data API 可以凭空构造一个 commit：
  blobs（每个文件） -> tree（整棵目录） -> commit -> 更新/创建 ref
api.github.com 在本机沙箱代理下可达，而 github.com:443 的 CONNECT 隧道被拒。

用法：
    GITHUB_TOKEN=ghp_xxx python tools/push_via_api.py

或用参数传：
    python tools/push_via_api.py <token>

token 需要对该仓库有 Contents 读写权限（fine-grained 即可）。
"""
import base64
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

OWNER = 'zhenbinping-boop'
REPO = 'book-reader'
BRANCH = 'main'
REPO_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = 'https://api.github.com'

TOKEN = os.environ.get('GITHUB_TOKEN') or (sys.argv[1] if len(sys.argv) > 1 else None)
if not TOKEN:
    sys.exit('缺少 token：设置环境变量 GITHUB_TOKEN，或作为第一个参数传入')


def api(method, path, payload=None, ok=(200, 201), timeout=90, retries=4):
    """调 api.github.com。

    沙箱出口代理会偶发地把长响应掐掉（表现为读响应超时，而请求其实已经到了
    GitHub），所以这里对超时/连接错误做有限重试。对 Git Data API 来说重试是
    安全的：同样内容 -> 同样 sha，最坏只是留下几个孤儿对象。
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
                'User-Agent': 'book-reader-push',
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
        except Exception as e:  # 超时 / 连接被掐
            last = e
            print('    ! %s %s 第 %d 次失败: %s' % (method, path, attempt, type(e).__name__))
            if attempt < retries:
                time.sleep(2 * attempt)
    raise RuntimeError('%s %s 重试 %d 次仍失败: %r' % (method, path, retries, last))


def tracked_files():
    out = subprocess.run(['git', 'ls-files'], cwd=REPO_DIR,
                         capture_output=True, check=True)
    names = out.stdout.decode('utf-8', 'replace').splitlines()
    return [n for n in names if n.strip()]


def ensure_repo_initialized():
    """返回 (base_tree_sha, parents)。

    空仓库（无任何 commit）下 Git Data API 的 POST /git/blobs 会直接 409
    "Git Repository is empty."，所以必须先用 Contents API 落一个初始提交，
    把 git 数据库建起来，之后才能走 blob -> tree -> commit。
    """
    def peek():
        ref = api('GET', '/repos/%s/%s/git/ref/heads/%s' % (OWNER, REPO, BRANCH))
        sha = ref['object']['sha']
        c = api('GET', '/repos/%s/%s/git/commits/%s' % (OWNER, REPO, sha))
        return c['tree']['sha'], [sha]

    try:
        return peek()
    except RuntimeError as e:
        s = str(e)
        if '404' not in s and '409' not in s:
            raise
        print('仓库为空，先用 Contents API 建立初始提交 ...')
        try:
            api('PUT', '/repos/%s/%s/contents/README.md' % (OWNER, REPO), {
                'message': 'chore: 初始化仓库',
                'content': base64.b64encode(b'# book-reader\n').decode('ascii'),
                'branch': BRANCH,
            }, ok=(200, 201), timeout=180, retries=3)
        except RuntimeError as e:
            # 超时不代表没写进去，先复查仓库状态再决定
            print('    初始提交调用异常：%s' % str(e)[:200])
            print('    复查仓库状态 ...')
            tree_sha, parents = peek()
            print('    初始提交其实已经落盘，base tree:', tree_sha[:8])
            return tree_sha, parents
        tree_sha, parents = peek()
        print('初始提交建立完成，base tree:', tree_sha[:8])
        return tree_sha, parents


def main():
    who = api('GET', '/user')
    print('authenticated as:', who.get('login'))
    if who.get('login') != OWNER:
        print('!! 注意：token 属于 %s，目标仓库属于 %s' % (who.get('login'), OWNER))

    base_tree, parents = ensure_repo_initialized()

    files = tracked_files()
    print('files to push:', len(files))

    # 1) 每个文件 -> blob
    entries = []
    for i, path in enumerate(files, 1):
        with open(os.path.join(REPO_DIR, path), 'rb') as f:
            raw = f.read()
        blob = api('POST', '/repos/%s/%s/git/blobs' % (OWNER, REPO), {
            'content': base64.b64encode(raw).decode('ascii'),
            'encoding': 'base64',
        })
        entries.append({
            'path': path.replace(os.sep, '/'),
            'mode': '100644',
            'type': 'blob',
            'sha': blob['sha'],
        })
        print('  [%2d/%d] %-52s %7d bytes' % (i, len(files), path, len(raw)))

    # 2) 整棵树 -> tree（带 base_tree，保留初始提交里未被覆盖的条目）
    tree = api('POST', '/repos/%s/%s/git/trees' % (OWNER, REPO),
               {'tree': entries, 'base_tree': base_tree})
    print('tree:', tree['sha'])

    # 3) tree -> commit
    msg = subprocess.run(['git', 'log', '-1', '--pretty=%B'], cwd=REPO_DIR,
                         capture_output=True, check=True).stdout.decode('utf-8', 'replace').strip()
    commit = api('POST', '/repos/%s/%s/git/commits' % (OWNER, REPO), {
        'message': msg or 'chore: initial commit',
        'tree': tree['sha'],
        'parents': parents,
    })
    print('commit:', commit['sha'])

    # 4) 更新分支 ref（现在有父提交，是 fast-forward）
    api('PATCH', '/repos/%s/%s/git/refs/heads/%s' % (OWNER, REPO, BRANCH),
        {'sha': commit['sha'], 'force': False})
    print('updated ref', BRANCH, '->', commit['sha'][:8])

    print('')
    print('完成 -> https://github.com/%s/%s' % (OWNER, REPO))


if __name__ == '__main__':
    main()
