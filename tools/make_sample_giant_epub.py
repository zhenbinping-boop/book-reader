"""生成「一章一大块」的 EPUB 测试夹具（纯标准库）。

用法：python tools/make_sample_giant_epub.py

产出 samples/sample-giant.epub —— 模拟网上常见的 TXT 转 EPUB 转换件：
正文不用 <p> 分段，整章就是一个大 <div> 靠 <br> 换行。这类书在滚动模式下
段级锚点粒度退化为「整章」，字符级锚点（lib/txtSel.js 的 intraOffsetAtTop /
scrollSegToChar）就是为它补的，dev-progress.html 的 3.7 节用它做回归。
"""

import os
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'samples', 'sample-giant.epub')

LINE = '山道在雾里若隐若现，我数着石阶往上走，汗一滴滴落在青石上。'


def giant_ch():
    # 40 行 × 约 24 字 ≈ 960 字符，全在一个 <div> 里靠 <br> 换行 —— 一章 = 一段
    body = '<br/>\n    '.join(f'{LINE}{i:02d}' for i in range(40))
    return f"""<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="zh-CN">
<head><title>第一章 长阶</title></head>
<body>
  <h1>第一章 长阶</h1>
  <div>
    {body}
  </div>
</body>
</html>
"""


def short_ch():
    return """<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="zh-CN">
<head><title>第二章 山顶</title></head>
<body>
  <h1>第二章 山顶</h1>
  <p>到了山顶，雾散了，风很大。</p>
  <p>坐下来把水喝完，看云从脚下漫过去。</p>
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
      <li><a href="text/ch1.xhtml">第一章 长阶</a></li>
      <li><a href="text/ch2.xhtml">第二章 山顶</a></li>
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
    <dc:identifier id="bookid">urn:uuid:book-reader-sample-giant</dc:identifier>
    <dc:title>大段样例书</dc:title>
    <dc:creator>测试作者</dc:creator>
    <dc:language>zh-CN</dc:language>
    <meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ch1" href="text/ch1.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch2" href="text/ch2.xhtml" media-type="application/xhtml+xml"/>
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
        z.writestr('OEBPS/text/ch1.xhtml', giant_ch(), zipfile.ZIP_DEFLATED)
        z.writestr('OEBPS/text/ch2.xhtml', short_ch(), zipfile.ZIP_DEFLATED)
    print(f'{OUT}  {os.path.getsize(OUT)} bytes')


if __name__ == '__main__':
    main()
