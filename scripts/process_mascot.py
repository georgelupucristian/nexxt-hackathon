"""Turn the green-screen pose renders in assets/mascot/poses/ into app assets.

Run from the repo root:  python3 scripts/process_mascot.py
Needs: pip install numpy scipy pillow

For each pose it keys out the green backdrop, places the seal on a shared
square canvas (same scale and ground line for every pose, so state changes
crossfade without the seal jumping around), and writes:
  public/mascot/<state>.webp       full body, transparent, 768px
  public/mascot/<state>-face.webp  head crop for small sizes, transparent, 192px
plus app icons from the idle face (public/mascot/icon-192.png, icon-512.png).
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
POSES = ROOT / "assets" / "mascot" / "poses"
OUT = ROOT / "public" / "mascot"
CROPS = ROOT / "assets" / "mascot" / "face-crops.json"

# file name in poses/ -> state name used by <Seal state>
FILES = {
    "normal.png": "idle",
    "happy.png": "happy",
    "celebrate.png": "celebrate",
    "wave.png": "wave",
    "think.png": "think",
    "point.png": "point",
    "sleep.png": "sleep",
    "sad.png": "sad",
}

CANVAS = 768
GROUND = 702  # y of the lowest fur pixel in the sitting poses, on the 768 canvas
ICON_BG = (234, 244, 255)  # #EAF4FF, the app's light blue


def key_green(path: Path) -> Image.Image:
    img = np.asarray(Image.open(path).convert("RGB")).astype(np.float32)
    r, g, b = img[..., 0], img[..., 1], img[..., 2]

    # "How much greener than red/blue": ~100+ on the backdrop, ~0 on fur.
    # Works for every shade of green the generators gave us (they vary per image).
    greenness = g - np.maximum(r, b)
    alpha = 1.0 - np.clip((greenness - 18.0) / 42.0, 0.0, 1.0)

    # Drop specks of noise but keep small real islands like the celebrate coins.
    labels, n = ndimage.label(alpha > 0.1)
    if n > 1:
        sizes = ndimage.sum(np.ones_like(alpha), labels, index=range(1, n + 1))
        tiny = np.isin(labels, 1 + np.flatnonzero(sizes < 40))
        alpha[tiny] = 0.0

    # Despill: green may not exceed the brighter of red/blue, which removes
    # the green fringe the backdrop leaves on white fur and whiskers.
    g = np.minimum(g, np.maximum(r, b) * 1.02)
    rgba = np.dstack([r, g, b, alpha * 255.0]).clip(0, 255).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


def place_on_canvas(im: Image.Image, state: str) -> Image.Image:
    # The renders all frame the seal the same way relative to the image, but at
    # different pixel sizes (1024 or 1254), so resizing to one canvas keeps the
    # seal the same size across poses.
    im = im.resize((CANVAS, CANVAS), Image.LANCZOS)
    if state == "celebrate":
        return im  # mid-jump on purpose, so it stays off the ground

    # A few poses came back floating higher (sleep by ~130px). Drop them onto
    # the shared ground line so switching states doesn't make the seal jump.
    bottom = im.getchannel("A").point(lambda a: 255 if a > 128 else 0).getbbox()[3]
    shifted = Image.new("RGBA", im.size)
    shifted.paste(im, (0, GROUND - bottom))
    return shifted


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    crops = json.loads(CROPS.read_text())
    faces = {}

    for name, state in FILES.items():
        src = POSES / name
        if not src.exists():
            print(f"skip {state}: {src.name} missing")
            continue
        body = place_on_canvas(key_green(src), state)
        body.save(OUT / f"{state}.webp", quality=90, method=6)

        # Face crops are hand-picked per pose (x, y, size in canvas px) because
        # the head moves between poses; update face-crops.json if a pose changes.
        x, y, s = crops[state]
        face = body.crop((x, y, x + s, y + s)).resize((192, 192), Image.LANCZOS)
        face.save(OUT / f"{state}-face.webp", quality=90, method=6)
        faces[state] = body.crop((x, y, x + s, y + s))
        bbox = body.getchannel("A").point(lambda a: 255 if a > 128 else 0).getbbox()
        print(f"{state:9s} bbox={bbox}")

    if "idle" in faces:
        for px in (192, 512):
            icon = Image.new("RGBA", (px, px), ICON_BG + (255,))
            face = faces["idle"].resize((px, px), Image.LANCZOS)
            icon.alpha_composite(face)
            icon.convert("RGB").save(OUT / f"icon-{px}.png")


if __name__ == "__main__":
    main()
