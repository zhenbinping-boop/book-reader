"""Optional asset maintenance: python -m pip install fonttools brotli.
Usage: python tools/subset_reader_font.py /path/to/NotoSerifCJKsc-Regular.otf
       python tools/subset_reader_font.py /path/to/NotoSerifCJKsc-Regular.otf --rare
Source font: https://github.com/notofonts/noto-cjk (SIL OFL, public/fonts/OFL.txt).
Normal development and offline builds use the committed WOFF2; no download needed.
"""
import argparse
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont

root=Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('source', type=Path)
parser.add_argument('--rare', action='store_true', help='Build only the offline Han fallback, excluding the primary font glyphs')
args = parser.parse_args()
options=subset.Options();options.flavor='woff2';options.desubroutinize=True

if args.rare:
    fonts = root / 'public/fonts'
    with TTFont(fonts / 'reader-song.woff2') as primary:
        covered = set(primary.getBestCmap())
    ranges = {
        'ext-a': [(0x3400, 0x4DBF)],
        'unified': [(0x4E00, 0x9FFF), (0xF900, 0xFAFF)],
        'supplementary': [(0x20000, 0x323AF)],
    }
    for name, limits in ranges.items():
        font = subset.load_font(args.source, options)
        codepoints = {cp for cp in set(font.getBestCmap()) - covered if any(lo <= cp <= hi for lo, hi in limits)}
        subsetter = subset.Subsetter(options)
        subsetter.populate(unicodes=codepoints)
        subsetter.subset(font)
        out = fonts / f'reader-song-rare-{name}.woff2'
        subset.save_font(font, str(out), options)
        print(out.name, len(codepoints), 'characters,', out.stat().st_size, 'bytes')
    raise SystemExit(0)

chars=set(''.join(p.read_text() for p in (root/'src').rglob('*') if p.suffix in ['.js','.jsx']))
for a in range(0xA1,0xF8):
    for b in range(0xA1,0xFF):
        try: chars.update(bytes([a,b]).decode('gb2312'))
        except UnicodeDecodeError: pass
chars.update(chr(i) for i in range(32,256))
chars.update('浮生六记闺房记乐人间词话山水游记古典诗词选余忆童稚时物外之趣闲读藏书')
font=subset.load_font(args.source,options)
subsetter=subset.Subsetter(options);subsetter.populate(text=''.join(chars));subsetter.subset(font)
out=root/'public/fonts/reader-song.woff2'
subset.save_font(font,str(out),options)
print('Offline Song font:',out.stat().st_size,'bytes')
