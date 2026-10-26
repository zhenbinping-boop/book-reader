"""Compatibility entry point. Uses the approved artwork, never the retired icon.

Run npm ci first. See docs/BRAND.md; preferred command: npm run icons.
"""
from pathlib import Path
import shutil
import subprocess

if __name__ == '__main__':
    node = shutil.which('node')
    if not node:
        raise SystemExit('Node.js is required. Install dependencies with npm ci.')
    root = Path(__file__).resolve().parent.parent
    subprocess.run([node, 'tools/make_icons.mjs'], cwd=root, check=True)
