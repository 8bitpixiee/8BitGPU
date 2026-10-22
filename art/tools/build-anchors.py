"""Rebuild assets/avatar/anchors.json from the body art (needs Pillow)."""
from pathlib import Path
import json
from PIL import Image

root = Path(__file__).resolve().parents[2]
avatar = root / 'assets/avatar'
STAGE = 50
STANDARD = {'w': 48, 'h': 43, 'x': 1, 'y': 9}
WIDE = {'w': 50, 'h': 50, 'x': 0, 'y': 0}

# the fem pixie is the reference every shared part was drawn on
REF_HEAD = 'head_fem_v1.png'
REF_BODY = 'body_fem_v1.png'
CHEST = {'x': -1, 'y': 8}
# hand tuned, matched by filename prefix
STANDARD_RIGS = {
    'body_fem_v': {'chest': CHEST},
    'body_masc_v': {'eyes': {'x': 0, 'y': 2}, 'chest': CHEST},
    'body_chunky_masc_v': {'eyes': {'x': 0, 'y': 3}, 'chest': CHEST},
    'body_fem_deerbra_v': {'chest': CHEST},
    'bovidil_body_fem_': {'chest': CHEST},
    'thixie_body_v': {'chest': CHEST},
}


def alpha(name):
    return Image.open(avatar / name).convert('RGBA').getchannel('A')


def bounds(mask, rows=None):
    width, height = mask.size
    points = [(x, y) for y in (rows or range(height)) for x in range(width) if mask.getpixel((x, y)) > 0]
    xs, ys = [p[0] for p in points], [p[1] for p in points]
    return min(xs), min(ys), max(xs) + 1, max(ys) + 1


def custom_head(name):
    mask = alpha(name)
    width, height = mask.size
    widths = [sum(1 for x in range(width) if mask.getpixel((x, y)) > 0) for y in range(height)]
    top = next(y for y in range(height) if widths[y])
    neck = min(range(top + 8, top + 17), key=lambda y: (widths[y], y))
    return bounds(mask, range(top, neck)), neck


def main():
    ref = bounds(alpha(REF_HEAD))
    ref_cx, ref_cy = (ref[0] + ref[2]) / 2, (ref[1] + ref[3]) / 2
    ref_neck = bounds(alpha(REF_BODY))[1]
    rigs = dict(STANDARD_RIGS)
    wide = sorted(p.name for p in avatar.glob('*.png') if Image.open(p).size == (50, 50))
    for name in wide:
        if name == 'Boob_1.png':
            continue
        head, neck = custom_head(name)
        dx = round((head[0] + head[2]) / 2 - (ref_cx + STANDARD['x']))
        dy = round((head[1] + head[3]) / 2 - (ref_cy + STANDARD['y']))
        torso = {'x': dx, 'y': neck - (ref_neck + STANDARD['y'])}
        face = {'x': dx, 'y': dy}
        rigs[name] = {'ears': face, 'eyes': face, 'hair': face, 'fit': torso, 'extra': torso, 'chest': {'x': 0, 'y': 0}}
    data = {'version': 2, 'stage': STAGE, 'canvas': {'standard': STANDARD, 'wide': WIDE}, 'wide': wide, 'rigs': rigs}
    (avatar / 'anchors.json').write_text(json.dumps(data, indent=2) + '\n', encoding='utf-8', newline='\n')
    print(f'Wrote anchors for {len(rigs)} bodies.')


if __name__ == '__main__':
    main()
