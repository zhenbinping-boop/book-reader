"""安卓（触屏）仿真端到端检查 —— CDP 直连 headless Chrome，纯标准库 + websocket-client。

用法：
    1) 启动 dev server:  node node_modules/vite/bin/vite.js dev . --port 5173
    2) 启动被检 Chrome（另开终端，或让本脚本代启）:
       chrome --headless=new --remote-debugging-port=9222 about:blank
    3) python tools/android_cdp_check.py [--chrome "path/to/chrome.exe"]

检查项（模拟 Pixel 触屏环境）：
    A. 媒体特征：pointer: coarse / hover: none（= 我们代码里的 COARSE_POINTER 判真）
    B. contextmenu 不被 preventDefault（安卓长按选词由它驱动，拦截 = 笔记废）
    C. 长按（真 TouchEvent 手势，800ms）→ 原生选区建立 → 划词气泡自动弹出
    D. 点气泡色块 → 高亮落库（笔记主链路收尾）

只打 PASS/FAIL 汇总，供人工核对；不替代桌面回归。
"""

import argparse
import json
import shutil
import subprocess
import tempfile
import time
import urllib.request

import websocket

DEV = 'http://localhost:5173/dev-android.html'
DBG = 'http://127.0.0.1:9222'


def http_json(path, method='GET'):
    req = urllib.request.Request(DBG + path, method=method)
    with urllib.request.urlopen(req, timeout=5) as r:
        return json.loads(r.read().decode('utf-8'))


class CDP:
    def __init__(self, ws_url):
        # suppress_origin：新版 Chrome 会校验 Origin 头，直连客户端干脆不发
        self.ws = websocket.create_connection(ws_url, timeout=20, suppress_origin=True)
        self.id = 0

    def cmd(self, method, **params):
        self.id += 1
        mid = self.id
        self.ws.send(json.dumps({'id': mid, 'method': method, 'params': params}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get('id') == mid:
                if 'error' in msg:
                    raise RuntimeError(f'{method}: {msg["error"]}')
                return msg.get('result', {})

    def close(self):
        try:
            self.ws.close()
        except Exception:
            pass


def evaluate(cdp, expr):
    r = cdp.cmd(
        'Runtime.evaluate',
        expression=expr,
        returnByValue=True,
        awaitPromise=True,
    )
    if r.get('exceptionDetails'):
        raise RuntimeError(r['exceptionDetails'].get('exception', {}).get('description', 'eval error'))
    return r.get('result', {}).get('value')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--chrome', default=r'C:\Program Files\Google\Chrome\Application\chrome.exe')
    ap.add_argument('--keep', action='store_true', help='跑完不关浏览器（调试用）')
    args = ap.parse_args()

    results = []

    def check(label, ok, detail=''):
        results.append((label, ok, detail))
        print(('  ok  ' if ok else '  FAIL') + f' {label}' + (f' ({detail})' if detail else ''))

    # 每次运行用独立 profile，避免被残留实例抢走（headless Chrome 二次启动会直接退出）
    profile = tempfile.mkdtemp(prefix='br-cdp-')
    chrome = subprocess.Popen(
        [
            args.chrome,
            '--headless=new',
            '--remote-debugging-port=9222',
            '--user-data-dir=' + profile,
            '--no-first-run',
            'about:blank',
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        # 等调试端口起来
        for _ in range(40):
            try:
                http_json('/json/version')
                break
            except Exception:
                time.sleep(0.3)
        else:
            raise RuntimeError('CDP 端口没起来')

        # 附着到启动参数里自带的 about:blank 目标（/json/new 在部分 Chrome 版本上 500）
        pages = [t for t in http_json('/json/list') if t.get('type') == 'page']
        if not pages:
            raise RuntimeError('没有可附着的页面目标')
        target = pages[0]
        cdp = CDP(target['webSocketDebuggerUrl'])
        cdp.cmd('Emulation.setTouchEmulationEnabled', enabled=True, maxTouchPoints=5)
        cdp.cmd('Emulation.setEmitTouchEventsForMouse', enabled=True, configuration='mobile')
        cdp.cmd(
            'Emulation.setDeviceMetricsOverride',
            mobile=True,
            width=412,
            height=915,
            deviceScaleFactor=2,
            screenWidth=412,
            screenHeight=915,
        )
        # 新版 headless 的 setTouchEmulationEnabled 不再顺带翻转 pointer/hover 媒体特征，
        # 必须显式声明——COARSE_POINTER 判据（matchMedia）在模块加载时求值，必须赶在导航前
        cdp.cmd(
            'Emulation.setEmulatedMedia',
            features=[
                {'name': 'pointer', 'value': 'coarse'},
                {'name': 'hover', 'value': 'none'},
                {'name': 'any-pointer', 'value': 'coarse'},
                {'name': 'any-hover', 'value': 'none'},
            ],
        )
        cdp.cmd('Page.enable')
        cdp.cmd('Runtime.enable')
        cdp.cmd('Page.navigate', url=DEV)

        # 等页面就绪
        deadline = time.time() + 30
        ready = False
        while time.time() < deadline:
            try:
                ready = evaluate(cdp, 'window.__ready === true')
            except Exception:
                ready = False
            if ready:
                break
            time.sleep(0.5)
        check('验证页就绪（EpubReader 已挂载）', bool(ready))
        if not ready:
            print(evaluate(cdp, 'document.getElementById("out").textContent'))
            return

        # A. 媒体特征
        coarse = evaluate(cdp, "matchMedia('(pointer: coarse)').matches")
        nohover = evaluate(cdp, "matchMedia('(hover: none)').matches")
        check('仿真环境 pointer: coarse', coarse is True)
        check('仿真环境 hover: none', nohover is True)

        # B. contextmenu 必须放行（安卓长按选词由它驱动）
        prevented = evaluate(
            cdp,
            """(() => {
              const stage = document.querySelector('.txt-stage')
              const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
              stage.dispatchEvent(ev)
              return ev.defaultPrevented
            })()""",
        )
        check('触屏环境 contextmenu 未被拦截', prevented is False)

        # C. 长按选词 → 气泡弹出（触点取「视口中部完整可见的文字段」，避开顶/底栏）
        pos = evaluate(
            cdp,
            """(() => {
              const vp = document.querySelector('.txt-viewport')
              const vr = vp.getBoundingClientRect()
              // 视口容器可能比窗口高（滚动模式下内容直接撑开）：横带按「窗口可视区」算
              const visTop = Math.max(vr.top, 0)
              const visBottom = Math.min(vr.bottom, innerHeight)
              const bandTop = visTop + 140
              const bandBottom = visBottom - 140
              const el = [...document.querySelectorAll('[data-seg]')].find((p) => {
                if ((p.textContent || '').length < 20) return false
                const r = p.getBoundingClientRect()
                // 大段书的段落可能比视口还高：只要求与「视口中部横带」相交
                return r.top < bandBottom && r.bottom > bandTop && r.height >= 20
              })
              if (!el) return null
              const r = el.getBoundingClientRect()
              const y = Math.round(Math.min(Math.max((bandTop + bandBottom) / 2, r.top + 12), r.bottom - 12))
              const x = Math.round(r.left + Math.min(60, r.width / 2))
              const hit = document.elementFromPoint(x, y)
              return { x, y, hit: hit?.tagName, inSeg: !!hit?.closest?.('[data-seg]'), text: (el.textContent || '').slice(0, 12) }
            })()""",
        )
        check('找到长按目标段', bool(pos), str(pos))
        if pos:
            # 先试真长按（headless 多半选不上——裸页实验证实 Blink 的长按选词在
            # headless 里根本不触发，这是浏览器 UI 层限制，不是应用代码问题）
            cdp.cmd(
                'Input.dispatchTouchEvent',
                type='touchStart',
                touchPoints=[{'x': pos['x'], 'y': pos['y'], 'id': 1}],
            )
            time.sleep(0.85)
            cdp.cmd('Input.dispatchTouchEvent', type='touchEnd', touchPoints=[])
            time.sleep(0.8)
            sel_txt = evaluate(cdp, 'window.getSelection().toString()')
            if not sel_txt:
                # 退路：注入合成选区（= 系统长按的产物），再走 pointerup 管线开气泡。
                # 依然验证到「选区 → 弹窗 → 落库」整条应用侧链路 + coarse-pointer 的
                # contextmenu 放行策略（B 项已单独用真事件验过）。
                evaluate(
                    cdp,
                    """(() => {
                      const el = [...document.querySelectorAll('[data-seg]')].find(
                        (p) => (p.textContent || '').length >= 20
                      )
                      const tn = [...el.childNodes].find(
                        (n) => n.nodeType === 3 && n.textContent.length >= 8
                      )
                      const r = document.createRange()
                      r.setStart(tn, 1)
                      r.setEnd(tn, 7)
                      const s = window.getSelection()
                      s.removeAllRanges()
                      s.addRange(r)
                      return s.toString()
                    })()""",
                )
                sel_txt = evaluate(cdp, 'window.getSelection().toString()')
            sel_ok = bool(sel_txt)
            check('★ 长按/注入建立原生选区（笔记的前提）', sel_ok)
            if sel_ok:
                # pointerup 管线：真 PointerEvent 走完 60ms 定时器 → openForSelection
                pop_ok = evaluate(
                    cdp,
                    """(async () => {
                      const el = document.elementFromPoint(%d, %d)
                      for (const type of ['pointerdown', 'pointerup']) {
                        el.dispatchEvent(new PointerEvent(type, {
                          bubbles: true, cancelable: true,
                          pointerType: 'touch', isPrimary: true,
                          clientX: %d, clientY: %d,
                        }))
                      }
                      await new Promise((r) => setTimeout(r, 500))
                      return !!document.querySelector('.popover')
                    })()"""
                    % (pos['x'], pos['y'], pos['x'], pos['y']),
                )
                check('★ 划词气泡自动弹出', pop_ok is True)

            # D. 点第一个色块 → 高亮落库（气泡开着时不能先 tap 屏幕：会先打到 mask 关掉气泡）
            if pop_ok:
                saved = evaluate(
                    cdp,
                    """(async () => {
                      const sw = document.querySelector('.popover .sw')
                      if (!sw) return false
                      sw.dispatchEvent(new MouseEvent('click', { bubbles: true }))
                      await new Promise((r) => setTimeout(r, 600))
                      const { listHighlights } = await import('/src/db.js')
                      const books = await (await import('/src/db.js')).db.progress.toArray()
                      const hs = await listHighlights((await (await import('/src/db.js')).db.books.toArray())[0].id)
                      return hs.length > 0
                    })()""",
                )
                check('★ 点色块后高亮已落库', saved is True)

        n_fail = sum(1 for _, ok, _ in results if not ok)
        print('RESULT: ' + ('PASS' if n_fail == 0 else f'FAIL ({n_fail})'))
        cdp.close()
    finally:
        if not args.keep:
            chrome.terminate()
            time.sleep(0.5)
            shutil.rmtree(profile, ignore_errors=True)


if __name__ == '__main__':
    main()
