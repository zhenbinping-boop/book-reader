"""生成「lazy 图在恢复点下方」的 EPUB 测试夹具（纯标准库）。

用法：python tools/make_sample_lazy_epub.py

产出 samples/sample-lazy.epub —— 第二章前 60 段纯文字、末尾放两张高图。
epubDom 给所有图挂 loading=lazy，恢复点下方的 lazy 图在用户滚过去之前不会加载；
旧的恢复 gate 等整章图片就位，就会被这两张「永远不加载」的图无限期按住，
表现为每次打开都停在章首（安卓上带图 EPUB 的真实故障）。
dev-progress.html 的 3.8 节用它做回归：恢复 gate 必须只等「锚点及以上」的图。
"""

import os
import struct
import zlib
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'samples', 'sample-lazy.epub')

LINE = '溪水顺着石缝往下淌，声音不紧不慢，像有人在很远的地方翻书。'


def png_bytes(w, h, rgb):
    """最小 PNG 编码器（真彩色、无滤波），与 make_sample_epub.py 同一套。"""

    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)

    raw = b''
    for _ in range(h):
        raw += b'\x00' + bytes(rgb) * w
    return (
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
        + chunk(b'IDAT', zlib.compress(raw, 9))
        + chunk(b'IEND', b'')
    )


def text_ch():
    # 60 段纯文字 —— 恢复点（第 3 段）与图片之间隔着两千像素以上，
    # 保证 lazy 图在视口外不会提前加载
    paras = '\n  '.join(f'<p>{LINE}{i:03d}</p>' for i in range(60))
    return f"""<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="zh-CN">
<head><title>第二章 溪谷</title></head>
<body>
  <h1>第二章 溪谷</h1>
  {paras}
  <p><img src="../images/tall1.png" alt="插图一" width="300" height="1200"/></p>
  <p><img src="../images/tall2.png" alt="插图二" width="300" height="1200"/></p>
</body>
</html>
"""


def intro_ch():
    paras = '\n  '.join(f'<p>{LINE}{i:03d}</p>' for i in range(20))
    return f"""<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="zh-CN">
<head><title>第一章 入山</title></head>
<body>
  <h1>第一章 入山</h1>
  {paras}
</body>
</html>
"""


NAV = """<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="zh-CN">
<head><title>目录</title></head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>目录</h1>
    <ol>
      <li><a href="text/ch1.xhtml">第一章 入山</a></li>
      <li><a href="text/ch2.xhtml">第二章 溪谷</a></li>
    </ol>
  </nav>
</body>
</html>
"""

CONTAINER = """<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
"""

OPF = """<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="zh-CN">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:book-reader-sample-lazy</dc:identifier>
    <dc:title>懒图样例书</dc:title>
    <dc:creator>测试作者</dc:creator>
    <dc:language>zh-CN</dc:language>
    <meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ch1" href="text/ch1.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch2" href="text/ch2.xhtml" media-type="application/xhtml+xml"/>
    <item id="img1" href="images/tall1.png" media-type="image/png"/>
    <item id="img2" href="images/tall2.png" media-type="image/png"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/>
    <itemref idref="ch2"/>
  </spine>
</package>
"""


def main():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with zipfile.ZipFile(OUT, 'w') as z:
        zi = zipfile.ZipInfo('mimetype')
        zi.compress_type = zipfile.ZIP_STORED
        z.writestr(zi, 'application/epub+zip')
        z.writestr('META-INF/container.xml', CONTAINER, zipfile.ZIP_DEFLATED)
        z.writestr('OEBPS/content.opf', OPF, zipfile.ZIP_DEFLATED)
        z.writestr('OEBPS/nav.xhtml', NAV, zipfile.ZIP_DEFLATED)
        z.writestr('OEBPS/text/ch1.xhtml', intro_ch(), zipfile.ZIP_DEFLATED)
        z.writestr('OEBPS/text/ch2.xhtml', text_ch(), zipfile.ZIP_DEFLATED)
        z.writestr('OEBPS/images/tall1.png', png_bytes(300, 1200, (90, 140, 200)), zipfile.ZIP_DEFLATED)
        z.writestr('OEBPS/images/tall2.png', png_bytes(300, 1200, (200, 150, 90)), zipfile.ZIP_DEFLATED)
    print(f'{OUT}  {os.path.getsize(OUT)} bytes')


if __name__ == '__main__':
    main()
