"""Optional asset maintenance: python -m pip install fonttools brotli.
Usage: python tools/subset_reader_font.py /path/to/NotoSerifCJKsc-Regular.otf
Source font: https://github.com/notofonts/noto-cjk (SIL OFL, public/fonts/OFL.txt).
Normal development and offline builds use the committed WOFF2; no download needed.
"""
import sys
from pathlib import Path
from fontTools import subset
root=Path(__file__).resolve().parent.parent
chars=set(''.join(p.read_text() for p in (root/'src').rglob('*') if p.suffix in ['.js','.jsx']))
for a in range(0xA1,0xF8):
    for b in range(0xA1,0xFF):
        try: chars.update(bytes([a,b]).decode('gb2312'))
        except UnicodeDecodeError: pass
chars.update(chr(i) for i in range(32,256))
chars.update('浮生六记闺房记乐人间词话山水游记古典诗词选余忆童稚时物外之趣闲读藏书')
options=subset.Options();options.flavor='woff2';options.desubroutinize=True
font=subset.load_font(sys.argv[1],options)
subsetter=subset.Subsetter(options);subsetter.populate(text=''.join(chars));subsetter.subset(font)
out=root/'public/fonts/reader-song.woff2'
subset.save_font(font,str(out),options)
print('Offline Song font:',out.stat().st_size,'bytes')
