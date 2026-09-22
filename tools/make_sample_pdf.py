"""生成一份带内嵌目录的多页测试 PDF（纯标准库）。

用法：python tools/make_sample_pdf.py
输出：samples/sample.pdf
"""

import os

PAGES = [
    ("Easy PDF Sample", [
        "This file is generated locally to smoke-test the reader.",
        "It has 6 pages and a 3-level outline.",
        "",
        "Try: scroll, zoom, outline jump, page mode, progress restore.",
    ]),
    ("Chapter 1  Introduction", [
        "PDF rendering is handled by pdf.js inside the browser.",
        "Pages outside the viewport are not rendered at all,",
        "which keeps memory flat on mobile devices.",
    ]),
    ("Chapter 1  continued", [
        "Each page slot reserves its exact height before paint,",
        "so the scrollbar never jumps while pages stream in.",
    ]),
    ("Chapter 2  Layout", [
        "Continuous mode is best for long documents.",
        "Single page mode is better for slides and comics.",
    ]),
    ("Chapter 2  continued", [
        "Zoom multiplies the fit-to-width scale.",
        "Tap the percentage button to reset to 100%.",
    ]),
    ("Chapter 3  Storage", [
        "Files live in IndexedDB as blobs, on this device only.",
        "Nothing is uploaded anywhere.",
        "Progress and bookmarks are saved on every page turn.",
    ]),
]

OUTLINE = [
    ("Chapter 1  Introduction", 0, [("Chapter 1  continued", 1)]),
    ("Chapter 2  Layout", 2, [("Chapter 2  continued", 3)]),
    ("Chapter 3  Storage", 4, []),
]


def escape(text):
    return text.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")


def page_stream(title, lines):
    parts = [
        "BT /F1 22 Tf 64 770 Td (%s) Tj ET" % escape(title),
        "0.55 0.45 0.35 RG 2 w 64 752 m 531 752 l S",
    ]
    y = 712
    for line in lines:
        if line:
            parts.append("BT /F1 12 Tf 64 %d Td (%s) Tj ET" % (y, escape(line)))
        y -= 24
    return "\n".join(parts).encode("latin-1")


def build():
    n_pages = len(PAGES)
    # 对象编号：1 catalog, 2 pages, 3 font, 4 outlines, 5.. pages, then content streams
    page_ids = [5 + i for i in range(n_pages)]
    content_ids = [5 + n_pages + i for i in range(n_pages)]

    # outline 节点：扁平化后逐个分配 id
    nodes = []
    for title, target, children in OUTLINE:
        node = {"title": title, "target": target, "children": [], "id": None}
        for ctitle, ctarget in children:
            node["children"].append({"title": ctitle, "target": ctarget, "children": [], "id": None})
        nodes.append(node)

    next_id = 5 + n_pages * 2
    for node in nodes:
        node["id"] = next_id
        next_id += 1
        for child in node["children"]:
            child["id"] = next_id
            next_id += 1
    outline_ids = [node["id"] for node in nodes]

    objects = {}

    objects[1] = (
        "<< /Type /Catalog /Pages 2 0 R /Outlines 4 0 R /PageMode /UseOutlines "
        "/PageLayout /SinglePage >>"
    )
    kids = " ".join(f"{pid} 0 R" for pid in page_ids)
    objects[2] = f"<< /Type /Pages /Kids [{kids}] /Count {n_pages} >>"
    objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"

    total_nodes = sum(1 for node in nodes for _ in [0]) + sum(len(node["children"]) for node in nodes)
    objects[4] = (
        f"<< /Type /Outlines /First {outline_ids[0]} 0 R /Last {outline_ids[-1]} 0 R "
        f"/Count {total_nodes} >>"
    )

    for i, pid in enumerate(page_ids):
        objects[pid] = (
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
            f"/Resources << /Font << /F1 3 0 R >> >> /Contents {content_ids[i]} 0 R >>"
        )

    for i, cid in enumerate(content_ids):
        title, lines = PAGES[i]
        data = page_stream(title, lines)
        objects[cid] = f"<< /Length {len(data)} >>\nstream\n" + data.decode("latin-1") + "\nendstream"

    for idx, node in enumerate(nodes):
        prev_id = outline_ids[idx - 1] if idx > 0 else None
        next_id_v = outline_ids[idx + 1] if idx < len(outline_ids) - 1 else None
        parts = [
            f"<< /Title ({escape(node['title'])}) /Parent 4 0 R",
            f"/Dest [{page_ids[node['target']]} 0 R /XYZ 0 842 null]",
        ]
        if node["children"]:
            child_ids = [c["id"] for c in node["children"]]
            parts.append(f"/First {child_ids[0]} 0 R /Last {child_ids[-1]} 0 R")
            parts.append(f"/Count {len(child_ids)}")
        if prev_id:
            parts.append(f"/Prev {prev_id} 0 R")
        if next_id_v:
            parts.append(f"/Next {next_id_v} 0 R")
        objects[node["id"]] = " ".join(parts) + " >>"

        for ci, child in enumerate(node["children"]):
            cparts = [
                f"<< /Title ({escape(child['title'])}) /Parent {node['id']} 0 R",
                f"/Dest [{page_ids[child['target']]} 0 R /XYZ 0 842 null]",
            ]
            if ci > 0:
                cparts.append(f"/Prev {node['children'][ci - 1]['id']} 0 R")
            if ci < len(node["children"]) - 1:
                cparts.append(f"/Next {node['children'][ci + 1]['id']} 0 R")
            objects[child["id"]] = " ".join(cparts) + " >>"

    out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = {}
    for oid in sorted(objects):
        offsets[oid] = len(out)
        out += f"{oid} 0 obj\n{objects[oid]}\nendobj\n".encode("latin-1")

    size = max(objects) + 1
    xref_pos = len(out)
    out += f"xref\n0 {size}\n".encode("latin-1")
    out += b"0000000000 65535 f \n"
    for oid in range(1, size):
        if oid in offsets:
            out += f"{offsets[oid]:010d} 00000 n \n".encode("latin-1")
        else:
            out += b"0000000000 65535 f \n"

    out += f"trailer\n<< /Size {size} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n".encode("latin-1")
    return bytes(out)


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    out_dir = os.path.join(os.path.dirname(here), "samples")
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, "sample.pdf")
    blob = build()
    with open(path, "wb") as f:
        f.write(blob)
    print(f"{path} ({len(blob) / 1024:.1f} KB, {len(PAGES)} pages)")
