#!/usr/bin/env python
"""生成 TXT 测试样本：samples/sample-utf8.txt 与 samples/sample-gbk.txt。

两份内容完全相同，只是一份 UTF-8（无 BOM）、一份 GB18030，
用来验证编码探测：UTF-8 必须走严格校验通过，GB18030 必须落到兜底分支且**不丢字**。

用法：python tools/make_sample_txt.py
"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 重复用的正文段落。刻意混入「第一，……」这种容易被误判成章节标题的行。
PARAS = [
    "他说，读书这件事急不得。字要一个一个地看，日子要一天一天地过。",
    "窗外的光斜进来，落在书页上，像给每个字都镀了一层薄薄的边。",
    "第一，他不知道该怎么办。第二，他也不想问。第三，天色已经不早了。",
    "桌上摊着一本旧书，纸页发黄，边角卷起，像被人反复抚摸过许多年。",
    "雨下了一整夜，屋檐的水滴声一直没停，敲在青石板上，密得像有人在数数。",
    "他忽然想起小时候，外婆坐在门槛上择菜，嘴里哼着听不清词的调子。",
    "远处有狗叫，叫了两声就停了，夜便重新安静下来，静得能听见自己的心跳。",
    "第二天清早，雾还没散，他已经把行装收拾好了，只等一个人来送他。",
]

CHAPTERS = [
    ("第1章 出发", 0),
    ("第2章 山中", 1),
    ("第十二章 夜谈", 3),
    ("第4章 归途", 5),
]

PREAMBLE = [
    "这是一份用于测试的样本文本。",
    "正文分四章，章与章之间没有空行以外的任何标记。",
]


def build():
    lines = list(PREAMBLE)
    for title, start in CHAPTERS:
        lines.append("")
        lines.append(title)
        lines.append("")
        # 每章 24 段，保证在手机上能分出好几页
        for i in range(24):
            lines.append(PARAS[(start + i) % len(PARAS)])
            lines.append("")
    lines.append("（全文完）")
    return "\n".join(lines) + "\n"


def main():
    text = build()
    out = os.path.join(ROOT, "samples")
    os.makedirs(out, exist_ok=True)

    p_utf8 = os.path.join(out, "sample-utf8.txt")
    with open(p_utf8, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)

    p_gbk = os.path.join(out, "sample-gbk.txt")
    with open(p_gbk, "w", encoding="gb18030", newline="\n") as f:
        f.write(text)

    print("chars: %d" % len(text))
    for p in (p_utf8, p_gbk):
        print("%-28s %7d bytes" % (os.path.basename(p), os.path.getsize(p)))
    print("chapter titles:", [t for t, _ in CHAPTERS])


if __name__ == "__main__":
    main()
