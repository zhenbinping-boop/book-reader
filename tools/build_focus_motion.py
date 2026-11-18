"""Prepare geometry for continuous focus-character motion; never rewrite artwork.

Existing Sharp atlas tools register poses but have no motion correspondence.
This optional authoring command uses OpenCV DIS to produce forward/backward
vertex displacements. The app ships only the small binary, not Python/OpenCV.

python tools/build_focus_motion.py --deps .tmp/focus-motion-deps --pilot 2
python tools/build_focus_motion.py --deps .tmp/focus-motion-deps
python tools/build_focus_motion.py --scene study --deps .tmp/focus-motion-deps
Controls run before artwork is opened. A failed control/invalid pair aborts.
Inspect the real WebGL animation as well: valid flow is not an aesthetic verdict.
"""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import sys
import time

ROOT = Path(__file__).resolve().parent.parent
SIZE, GRID, FRAMES, QUANT = 384, 33, 32, 32
LIMIT = 48


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--deps', type=Path)
    parser.add_argument('--pilot', type=int, default=0)
    parser.add_argument('--scene', choices=['focus', 'study', 'study-v1'], default='focus')
    args = parser.parse_args()
    if args.pilot < 0:
        parser.error('--pilot must be nonnegative')
    if args.deps:
        sys.path.insert(0, str(args.deps.resolve()))
    import cv2
    import numpy as np
    cv2.setNumThreads(1)

    def signal(image):
        if image.shape != (SIZE, SIZE, 4) or image.dtype != np.uint8:
            raise ValueError('Expected a 384px BGRA pose')
        gray = cv2.cvtColor(image, cv2.COLOR_BGRA2GRAY).astype(np.float32)
        alpha = image[:, :, 3].astype(np.float32) / 255
        return np.rint((gray * .7 + 255 * .3) * alpha).astype(np.uint8)

    def flow(a, b):
        estimator = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
        result = estimator.calc(signal(a), signal(b), None)
        if result.shape != (SIZE, SIZE, 2) or not np.isfinite(result).all():
            raise ValueError('Invalid motion field')
        return result

    coordinates = np.rint(np.linspace(0, SIZE - 1, GRID)).astype(int)

    def packed_field(field):
        if field.shape != (SIZE, SIZE, 2) or not np.isfinite(field).all():
            raise ValueError('Cannot pack a corrupt motion field')
        sampled = field[coordinates[:, None], coordinates[None, :]]
        return np.rint(sampled * QUANT).astype('<i2').tobytes()

    # Frozen controls: known translation (4,-3) px, an exact zero-motion twin,
    # wrong channel count, and injected NaN. Authored before real flow is run.
    rng = np.random.default_rng(713)
    texture = cv2.GaussianBlur(rng.integers(0, 256, (SIZE, SIZE), dtype=np.uint8), (5, 5), 0)
    clean = np.dstack([texture, texture, texture, np.full_like(texture, 255)])
    shifted = cv2.warpAffine(clean, np.float32([[1, 0, 4], [0, 1, -3]]), (SIZE, SIZE), borderMode=cv2.BORDER_REFLECT_101)
    planted = flow(clean, shifted)
    recovered = np.median(planted[48:-48, 48:-48].reshape(-1, 2), axis=0)
    if np.linalg.norm(recovered - np.array([4, -3])) > .35:
        raise RuntimeError('Planted translation was not recovered: ' + str(recovered))
    if np.max(np.abs(flow(clean, clean))) > .001:
        raise RuntimeError('Zero-motion control failed')
    for bad in [clean[:, :, :3], clean[:-1]]:
        try:
            flow(bad, clean)
        except ValueError:
            pass
        else:
            raise RuntimeError('Corrupt pose was accepted')
    broken = planted.copy(); broken[50, 50, 0] = np.nan
    try:
        packed_field(broken)
    except ValueError:
        pass
    else:
        raise RuntimeError('NaN corruption was accepted')
    controls = {'translation': [4, -3], 'recovered': recovered.tolist(), 'zero': 'pass', 'corruptionsCaught': 3}
    print(json.dumps({'controls': controls}), flush=True)

    files = {
        'focus': ('focus/wuxia-sit-sequence-32.webp', 'focus/wuxia-motion-v1.bin', 'focus/motion-mesh-report.json'),
        'study': ('study/wuxia-scroll-back-v2.webp', 'study/wuxia-scroll-back-motion-v2.bin', 'study/motion-mesh-report-v2.json'),
        'study-v1': ('study/wuxia-scroll-sequence.webp', 'study/wuxia-scroll-motion-v1.bin', 'study/motion-mesh-report.json'),
    }
    atlas_path, motion_path, report_path = files[args.scene]
    source = ROOT / 'public/art' / atlas_path
    atlas = cv2.imread(str(source), cv2.IMREAD_UNCHANGED)
    if atlas is None or atlas.shape != (SIZE * 4, SIZE * 8, 4):
        raise ValueError('The registered 32-pose atlas is missing or has changed dimensions')
    images = [atlas[(i // 8) * SIZE:(i // 8 + 1) * SIZE, (i % 8) * SIZE:(i % 8 + 1) * SIZE].copy() for i in range(FRAMES)]
    total = min(args.pilot, FRAMES - 1) if args.pilot else FRAMES - 1
    chunks, receipts = [], []
    for i in range(total):
        started = time.perf_counter()
        fields = [flow(images[i], images[i + 1]), flow(images[i + 1], images[i])]
        for direction, field in enumerate(fields):
            alpha = images[i + direction][:, :, 3]
            body = alpha > 128
            clipped = np.max(np.abs(field), axis=2) > LIMIT
            if np.count_nonzero(clipped & body) / max(1, np.count_nonzero(body)) > .01:
                raise ValueError(f'Implausible displacement in pair {i}, direction {direction}')
            field[:] = np.clip(field, -LIMIT, LIMIT)
            field[:] = cv2.GaussianBlur(field, (7, 7), 0)
            influence = cv2.dilate((alpha > 8).astype(np.uint8), np.ones((25, 25), np.uint8))
            field[influence == 0] = 0
            field[353:] = 0  # Registered contact / waist-crop baseline stays fixed.
            chunks.append(packed_field(field))
        receipt = {'pair': i, 'seconds': time.perf_counter() - started}
        receipts.append(receipt)
        print(json.dumps(receipt), flush=True)
    report = {'controls': controls, 'algorithm': 'OpenCV DIS medium, bidirectional', 'opencv': cv2.__version__,
              'atlasSha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'grid': GRID, 'tile': SIZE,
              'frames': FRAMES, 'quant': QUANT, 'pairs': receipts, 'pilot': bool(args.pilot), 'scene': args.scene}
    if args.pilot:
        (ROOT / f'.tmp/{args.scene}-motion-pilot.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    else:
        header = struct.pack('<4sHHHHI', b'FMW1', SIZE, GRID, FRAMES, QUANT, 0)
        target = ROOT / 'public/art' / motion_path
        target.write_bytes(header + b''.join(chunks))
        report['bytes'] = target.stat().st_size
        (ROOT / 'assets' / report_path).write_text(json.dumps(report, indent=2), encoding='utf-8')
        print(json.dumps({'output': str(target), 'bytes': report['bytes'], 'pairs': len(receipts)}), flush=True)


if __name__ == '__main__':
    main()
