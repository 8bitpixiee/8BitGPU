"""Builds the 3:2 Pixie Launchpad background from the original square art.

The cabinets stay on the left edge and the bar stays on the right edge, the extra 600px goes in the
middle of the room. The inserted columns are the original's center columns reflected back and forth,
so the window turns into a long panoramic one and the floor gains more tiles. The wall half repeats
a wider slice than the floor half so the galaxy only mirrors once instead of tiling like wallpaper,
and the window ring is held flat so it reads as one long pill.
Swap the output for hand drawn art whenever there is some, the room reads its size from
client/arcade/room-setup.js.
"""
import sys
import numpy as np
from PIL import Image

SRC = "assets/maps/arcade/arcade-01-bg.png"
OUT = "assets/maps/arcade/arcade-02-wide.png"
CUT = 600  # where the original gets split, the middle of the window and of the floor
EXTRA = 600
LEDGE = 478  # the wall meets the floor here, the two halves can use different slices
WALL_SLICE = 150
FLOOR_SLICE = 60  # both must divide EXTRA/2 so the last inserted column lines up with the right side
GALAXY = (105, 405)  # rows where the window interior is safe to mirror, outside them the ring curves

art = np.array(Image.open(SRC).convert("RGBA"))


def reflected(slice_width):
    """source column for each inserted column, walking left from the cut and bouncing back."""
    order = []
    for j in range(EXTRA):
        m = j % (2 * slice_width)
        order.append(CUT - 1 - (m if m < slice_width else 2 * slice_width - 1 - m))
    return order




def flat_row(y):
    """one row held straight across the middle, the most common color so stars don't turn into dashes."""
    colors, counts = np.unique(art[y, CUT - 30 : CUT + 30].reshape(-1, 4), axis=0, return_counts=True)
    return colors[counts.argmax()]


middle = np.empty((art.shape[0], EXTRA, 4), np.uint8)
middle[:LEDGE] = art[:LEDGE][:, reflected(WALL_SLICE)]
middle[LEDGE:] = art[LEDGE:][:, reflected(FLOOR_SLICE)]
# the ring of the window and the wall above and below it stay perfectly straight so the window is a pill
for y in range(LEDGE):
    if not GALAXY[0] <= y < GALAXY[1]:
        middle[y] = flat_row(y)
out = np.concatenate([art[:, :CUT], middle, art[:, CUT:]], axis=1)
Image.fromarray(out).save(sys.argv[1] if len(sys.argv) > 1 else OUT, optimize=True)
