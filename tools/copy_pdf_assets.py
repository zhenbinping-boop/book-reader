"""把 pdf.js 的 CMap 与标准字体复制到 public/，供中文 PDF 正确渲染。

用法：python tools/copy_pdf_assets.py
"""

import os
import shutil

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, "node_modules", "pdfjs-dist")
DST = os.path.join(ROOT, "public")

TARGETS = ("cmaps", "standard_fonts")


def main():
    if not os.path.isdir(SRC):
        raise SystemExit(f"找不到 {SRC}，请先执行 npm install")

    os.makedirs(DST, exist_ok=True)
    for name in TARGETS:
        src = os.path.join(SRC, name)
        dst = os.path.join(DST, name)
        if not os.path.isdir(src):
            print(f"跳过 {name}（源目录不存在）")
            continue
        if os.path.isdir(dst):
            shutil.rmtree(dst)
        shutil.copytree(src, dst)
        count = len(os.listdir(dst))
        print(f"{name}: {count} 个文件 -> {dst}")


if __name__ == "__main__":
    main()
