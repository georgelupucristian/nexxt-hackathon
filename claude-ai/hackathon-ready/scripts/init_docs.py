#!/usr/bin/env python3
"""Scaffold the four hackathon docs into <project-root>/docs/.

Never overwrites an existing file - re-running mid-hackathon is safe and is the
expected way to pick up a doc you skipped earlier.

usage: python init_docs.py [project-root]
"""

import shutil
import sys
from pathlib import Path

DOCS = ["DECISIONS.md", "WALKTHROUGH.md", "DEMO.md", "BUILDLOG.md"]


def main() -> int:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
    if not root.is_dir():
        print(f"not a directory: {root}", file=sys.stderr)
        return 1

    templates = Path(__file__).resolve().parent.parent / "assets" / "templates"
    if not templates.is_dir():
        print(f"templates missing, expected them at {templates}", file=sys.stderr)
        return 1

    docs = root / "docs"
    docs.mkdir(exist_ok=True)

    created, skipped = [], []
    for name in DOCS:
        dest = docs / name
        if dest.exists():
            skipped.append(name)
            continue
        shutil.copy2(templates / name, dest)
        created.append(name)

    if created:
        print(f"created in {docs}: {', '.join(created)}")
    if skipped:
        print(f"left alone (already there): {', '.join(skipped)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
