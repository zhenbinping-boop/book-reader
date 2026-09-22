"""生成 PWA 图标（192 / 512），纯标准库，不依赖 Pillow。

用法：python tools/make_icons.py
"""

import os
import struct
import zlib

BG = (47, 53, 64)
PAPER = (241, 240, 236)
INK = (47, 53, 64)


def in_round_rect(x, y, x0, y0, x1, y1, r):
    if not (x0 <= x < x1 and y0 <= y < y1):
        return False
    cx = min(max(x, x0 + r), x1 - 1 - r)
    cy = min(max(y, y0 + r), y1 - 1 - r)
    dx = x - cx
    dy = y - cy
    return dx * dx + dy * dy <= r * r


def build(size):
    s = size / 512.0
    book_x0, book_y0, book_x1, book_y1 = (
        int(112 * s),
        int(136 * s),
        int(400 * s),
        int(376 * s),
    )
    radius = int(14 * s)
    spine = max(2, int(5 * s))
    mid = (book_x0 + book_x1) // 2
    left = (book_x0, book_y0, mid - spine // 2, book_y1)
    right = (mid + spine // 2, book_y0, book_x1, book_y1)

    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            if in_round_rect(x, y, *left, radius) or in_round_rect(x, y, *right, radius):
                color = PAPER
                # 页内文字线
                for idx, ly in enumerate((180, 218, 256, 294)):
                    top = int(ly * s)
                    thick = max(1, int(5 * s))
                    if top <= y < top + thick:
                        tx0 = int((136 if idx % 2 == 0 else 150) * s)
                        tx1 = int((370 - idx * 12) * s)
                        if tx0 <= x < tx1:
                            color = INK
                            break
                row += bytes(color)
            else:
                row += bytes(BG)
        rows.append(bytes(row))
    return rows


def write_png(path, size):
    raw = b"".join(b"\x00" + r for r in build(size))

    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)
    blob = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    with open(path, "wb") as f:
        f.write(blob)
    print(f"{path} ({len(blob) / 1024:.1f} KB)")


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    out = os.path.join(os.path.dirname(here), "public")
    os.makedirs(out, exist_ok=True)
    write_png(os.path.join(out, "icon-192.png"), 192)
    write_png(os.path.join(out, "icon-512.png"), 512)
