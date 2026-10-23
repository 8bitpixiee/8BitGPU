"""Builds the 3:2 Pixie Launchpad background from the original square art.

The room keeps its original 1200x1200 art in the middle. 300px on each side continue the wall and
floor by repeating the outermost ten columns, with rows that hit a plant, bubble or mushroom swapped
for the nearest clean row (same dither phase) so nothing streaks. Swap the output for hand drawn art
whenever there is some, the room reads its size from client/arcade/room-setup.js.
"""
import sys
import numpy as np
from PIL import Image

SRC = "assets/maps/arcade/arcade-01-bg.png"
OUT = "assets/maps/arcade/arcade-02-wide.png"
EXTRA = 300
STRIP = 10  # two art pixels, keeps the dither pattern lined up
PHASE = 10  # rows repeat their dither every ten pixels

art = np.array(Image.open(SRC).convert("RGBA"))
height, width, _ = art.shape


def clean(row_pixels):
    r, g, b = (row_pixels[:, i].astype(int) for i in range(3))
    plant = (g > r + 30) & (g >= b - 12)
    warm = (r > g + 45) | (r > 175)
    return not (plant | warm).any()


def widen(strip):
    ok = [clean(strip[y]) for y in range(height)]
    fixed = strip.copy()
    for y in range(height):
        if ok[y]:
            continue
        for k in range(1, height // PHASE):
            for source in (y - PHASE * k, y + PHASE * k):
                if 0 <= source < height and ok[source]:
                    fixed[y] = strip[source]
                    break
            else:
                continue
            break
    return np.tile(fixed, (1, EXTRA // STRIP, 1))


out = np.zeros((height, width + 2 * EXTRA, 4), np.uint8)
out[:, EXTRA : EXTRA + width] = art
out[:, :EXTRA] = widen(art[:, :STRIP])
out[:, EXTRA + width :] = widen(art[:, width - STRIP :])
Image.fromarray(out).save(sys.argv[1] if len(sys.argv) > 1 else OUT, optimize=True)
