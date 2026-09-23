"""生成 EPUB 测试夹具（纯标准库，不依赖 Pillow / ebooklib）。

用法：python tools/make_sample_epub.py

产出两个文件：

  samples/sample.epub      EPUB 3：nav 文档 + NCX 都在，封面用 properties="cover-image"
  samples/sample-ncx.epub  EPUB 2：只有 NCX，封面用 <meta name="cover">，专门测回退路径

两个都不能省 —— 目录读取有两条优先级不同的路径，只测一条等于没测。

夹具里刻意埋了几处「真实的电子书才会有的毛病」，测试页会逐条断言：
  - 分章文件里带 <script> 与 style/class 属性（必须被清掉）
  - 一张引用但打包里并不存在的图片（必须优雅丢弃，不能让整本书打不开）
  - 清单里列了、包里却没有的章节文件（必须跳过而不是抛错）
  - 目录条目指向文件内部的锚点（ch2.xhtml#part2）与跨文件内链
  - 容器 <div id> 上的锚点（归属到它内部的第一段）
"""

import os
import struct
import zipfile
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, 'samples')

# ---------------------------------------------------------------- PNG

def png_bytes(w, h, rgb, stripe=None):
    """最小 PNG 编码器（真彩色、无滤波）。stripe 给定颜色时画几道横条，方便肉眼确认渲染。"""
    raw = bytearray()
    for y in range(h):
        raw.append(0)  # filter: none
        for x in range(w):
            if stripe and (y // max(1, h // 8)) % 2 == 0:
                raw += bytes(stripe)
            else:
                raw += bytes(rgb)

    def chunk(tag, data):
        body = tag + data
        return struct.pack('>I', len(data)) + body + struct.pack('>I', zlib.crc32(body) & 0xFFFFFFFF)

    ihdr = struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)
    return (
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', ihdr)
        + chunk(b'IDAT', zlib.compress(bytes(raw), 9))
        + chunk(b'IEND', b'')
    )


# ---------------------------------------------------------------- 正文

CH1 = """<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="zh-CN">
<head><title>第一章 晨读</title></head>
<body>
  <h1>第一章 晨读</h1>
  <p>天刚亮的时候，屋子里的光还是灰的。我习惯先烧一壶水，再把昨天读到一半的书翻开。</p>
  <p>读到第三页，水开了。壶盖轻轻地响，像有人在门外敲了两下<em>约定的暗号</em>。</p>
  <p>我合上书去倒水。回来时太阳已经挪到了桌角，把<strong>木纹</strong>照得很清楚。</p>
</body>
</html>
"""

CH2 = """<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="zh-CN">
<head><title>第二章 茶与书桌</title></head>
<body>
  <h1>第二章 茶与书桌</h1>
  <p>茶要趁热，书却不必。太急的时候，字会从眼前滑过去。</p>
  <ul>
    <li>先读目录，知道要去哪里</li>
    <li>再读正文，慢一点也没关系</li>
    <li>最后读注释，很多答案都藏在后面</li>
  </ul>
  <div class="wrap" id="part2">
    <p>书桌的一角堆着便签，上面写着去年没做完的计划。</p>
    <p id="par3">其中有几条已经不必做了。我把它们划掉，心里反而松了一口气。</p>
  </div>
  <p>如果想从这里开始读，可以<a href="#par3">跳到那一句</a>。</p>
  <p>这一句刻意写得长一些，用来观察分栏：<br/>换行之后仍然属于同一段，字符偏移要连着算下去。</p>
</body>
</html>
"""

CH3 = """<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="zh-CN">
<head><title>第三章 一张插图</title></head>
<body>
  <h1>第三章 一张插图</h1>
  <p class="noise" style="color:red;font-size:40px">这段文字带着出版商的行内样式，应该被清掉。</p>
  <p><img src="../images/pic.png" alt="随书插图" width="120" height="80"/></p>
  <p>下面这张图在打包里并不存在，只能丢掉。</p>
  <p><img src="../images/missing.png" alt="丢失的插图"/></p>
  <script>window.__epubEvil = true;</script>
  <p>脚本被清掉之后，这一章仍然读得下去。</p>
</body>
</html>
"""

CH4 = """<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="zh-CN">
<head><title>第四章 归途</title></head>
<body>
  <h1>第四章 归途</h1>
  <p>回来的路上想起书里那句话，于是又翻了回去：<a href="ch2.xhtml#par3">回到第二章的那一句</a>。</p>
  <p>路边的树影一直在变，只有脚下的路没有变。</p>
</body>
</html>
"""

NOTES = """<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="zh-CN">
<head><title>附：注释</title></head>
<body>
  <h1>附：注释</h1>
  <p id="n1">一、关于便签：纸上的东西会提醒你它一直存在。</p>
  <p>二、关于茶：水温比茶叶更值得留意。</p>
</body>
</html>
"""

TEXTS = {
    'text/ch1.xhtml': CH1,
    'text/ch2.xhtml': CH2,
    'text/ch3.xhtml': CH3,
    'text/ch4.xhtml': CH4,
    'text/notes.xhtml': NOTES,
}

NAV = """<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="zh-CN">
<head><title>目录</title></head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>目录</h1>
    <ol>
      <li><a href="text/ch1.xhtml">第一章 晨读</a></li>
      <li><a href="text/ch2.xhtml">第二章 茶与书桌</a>
        <ol>
          <li><a href="text/ch2.xhtml#part2">书桌的一角</a></li>
        </ol>
      </li>
      <li><a href="text/ch3.xhtml">第三章 一张插图</a></li>
      <li><a href="text/ch4.xhtml">第四章 归途</a></li>
      <li><a href="text/notes.xhtml">附：注释</a></li>
    </ol>
  </nav>
</body>
</html>
"""


def ncx():
    """EPUB2 目录。刻意做成两级，和 nav 的形状对齐，方便两条路径产出同样的结果。"""
    points = [
        ('第一章 晨读', 'text/ch1.xhtml', []),
        ('第二章 茶与书桌', 'text/ch2.xhtml', [('书桌的一角', 'text/ch2.xhtml#part2', [])]),
        ('第三章 一张插图', 'text/ch3.xhtml', []),
        ('第四章 归途', 'text/ch4.xhtml', []),
        ('附：注释', 'text/notes.xhtml', []),
    ]
    count = [0]

    def render(items, depth):
        body = []
        for title, src, sub in items:
            count[0] += 1
            inner = render(sub, depth + 1) if sub else ''
            body.append(
                f'    <navPoint id="np{count[0]}" playOrder="{count[0]}">\n'
                f'      <navLabel><text>{title}</text></navLabel>\n'
                f'      <content src="{src}"/>\n'
                f'{inner}    </navPoint>\n'
            )
        return ''.join(body)

    return (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" '
        '"http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">\n'
        '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">\n'
        '  <head><meta name="dtb:uid" content="urn:uuid:book-reader-sample"/></head>\n'
        '  <docTitle><text>样例电子书</text></docTitle>\n'
        '  <navMap>\n'
        f'{render(points, 0)}'
        '  </navMap>\n'
        '</ncx>\n'
    )


STYLE = """/* 出版商样式。阅读器一律清掉 class / style，正文排版由主题与外观面板决定 ——
   这个文件存在的意义就是「它不该起任何作用」。 */
body { font-family: "Some Missing Font", serif; }
h1 { color: red; font-size: 48px; }
p { text-indent: 4em; }
"""

CONTAINER = """<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
"""


def opf_v3():
    items = '\n'.join(
        f'    <item id="{i}" href="{href}" media-type="application/xhtml+xml"/>'
        for i, href in [
            ('ch1', 'text/ch1.xhtml'),
            ('ch2', 'text/ch2.xhtml'),
            ('ch3', 'text/ch3.xhtml'),
            ('ch4', 'text/ch4.xhtml'),
            ('notes', 'text/notes.xhtml'),
        ]
    )
    spine = '\n'.join(
        f'    <itemref idref="{i}"/>'
        for i in ['ch1', 'ch2', 'ch3', 'ch4', 'ghost', 'notes']
    )
    return f"""<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="zh-CN">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:book-reader-sample</dc:identifier>
    <dc:title>样例电子书</dc:title>
    <dc:creator>测试作者</dc:creator>
    <dc:language>zh-CN</dc:language>
    <meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="css" href="style.css" media-type="text/css"/>
    <item id="cover-img" href="images/cover.png" media-type="image/png" properties="cover-image"/>
    <item id="pic" href="images/pic.png" media-type="image/png"/>
{items}
    <!-- 清单里列了但包里并不存在：解析时要跳过，不能让整本书打不开 -->
    <item id="ghost" href="text/ghost.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine toc="ncx">
{spine}
  </spine>
</package>
"""


def opf_v2():
    items = '\n'.join(
        f'    <item id="{i}" href="{href}" media-type="application/xhtml+xml"/>'
        for i, href in [
            ('ch1', 'text/ch1.xhtml'),
            ('ch2', 'text/ch2.xhtml'),
            ('ch3', 'text/ch3.xhtml'),
            ('ch4', 'text/ch4.xhtml'),
            ('notes', 'text/notes.xhtml'),
        ]
    )
    spine = '\n'.join(f'    <itemref idref="{i}"/>' for i in ['ch1', 'ch2', 'ch3', 'ch4', 'notes'])
    return f"""<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:identifier id="bookid">urn:uuid:book-reader-sample-ncx</dc:identifier>
    <dc:title>样例电子书（NCX 版）</dc:title>
    <dc:creator>测试作者</dc:creator>
    <dc:language>zh-CN</dc:language>
    <meta name="cover" content="cover-img"/>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="css" href="style.css" media-type="text/css"/>
    <item id="cover-img" href="images/cover.png" media-type="image/png"/>
    <item id="pic" href="images/pic.png" media-type="image/png"/>
{items}
  </manifest>
  <spine toc="ncx">
{spine}
  </spine>
</package>
"""


def write_epub(path, opf, with_nav):
    """mimetype 必须是第一个条目且不压缩 —— 这两个条件写错，很多阅读器会直接拒收。"""
    with zipfile.ZipFile(path, 'w') as z:
        zi = zipfile.ZipInfo('mimetype')
        zi.compress_type = zipfile.ZIP_STORED
        z.writestr(zi, 'application/epub+zip')

        z.writestr('META-INF/container.xml', CONTAINER, zipfile.ZIP_DEFLATED)
        z.writestr('OEBPS/content.opf', opf, zipfile.ZIP_DEFLATED)
        if with_nav:
            z.writestr('OEBPS/nav.xhtml', NAV, zipfile.ZIP_DEFLATED)
        z.writestr('OEBPS/toc.ncx', ncx(), zipfile.ZIP_DEFLATED)
        z.writestr('OEBPS/style.css', STYLE, zipfile.ZIP_DEFLATED)
        z.writestr('OEBPS/images/cover.png', png_bytes(160, 240, (250, 248, 242), (60, 66, 78)), zipfile.ZIP_DEFLATED)
        z.writestr('OEBPS/images/pic.png', png_bytes(120, 80, (214, 226, 240), (90, 110, 140)), zipfile.ZIP_DEFLATED)
        for rel, html in TEXTS.items():
            z.writestr('OEBPS/' + rel, html, zipfile.ZIP_DEFLATED)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    a = os.path.join(OUT_DIR, 'sample.epub')
    b = os.path.join(OUT_DIR, 'sample-ncx.epub')
    write_epub(a, opf_v3(), with_nav=True)
    write_epub(b, opf_v2(), with_nav=False)
    for p in (a, b):
        print(f'{p}  {os.path.getsize(p)} bytes')


if __name__ == '__main__':
    main()
