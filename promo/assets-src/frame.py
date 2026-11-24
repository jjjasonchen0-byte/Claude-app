# The photographed phone (Higgsfield, green screen) → public/phone/frame.png: the body and bezel with
# the display cut out, scaled so the display is exactly SCREEN_W × SCREEN_H, plus frame.json with the
# geometry (where the display sits inside the picture and its corner radius).
import json, math, sys
import numpy as np
from PIL import Image, ImageFilter

SRC = sys.argv[1] if len(sys.argv) > 1 else 'assets-src/hf/phone-b.png'
SCREEN_W = 760
SCREEN_H = round(844 * 760 / 390)
im = Image.open(SRC).convert('RGBA')
a = np.asarray(im).astype(np.float32)
r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
lum = 0.3 * r + 0.59 * g + 0.11 * b
H, W = lum.shape
# the bezel: opaque and near-black, not green
bezel = (al > 200) & (lum < 45) & (g < 60)
cy, cx = H // 2, W // 2

def scan(row=None, col=None, step=1):
    """From the centre along a row or column, the first run of bezel pixels (3 in a row)."""
    if row is not None:
        line = bezel[row]
        i = cx
        while 0 < i < W - 1:
            if line[i] and line[i + step] and line[i + 2 * step]:
                return i
            i += step
    else:
        line = bezel[:, col]
        i = cy
        while 0 < i < H - 1:
            if line[i] and line[i + step] and line[i + 2 * step]:
                return i
            i += step
    return None

L = int(np.median([scan(row=y, step=-1) for y in range(cy - 300, cy + 300, 20)]))
R = int(np.median([scan(row=y, step=1) for y in range(cy - 300, cy + 300, 20)]))
T = int(np.median([scan(col=x, step=-1) for x in list(range(cx - 400, cx - 150, 25)) + list(range(cx + 150, cx + 400, 25))]))
B = int(np.median([scan(col=x, step=1) for x in range(cx - 300, cx + 300, 25)]))
# the corner radius: the inner edge along rows near the top-left corner
pts = []
for y in range(T + 2, T + 260, 4):
    line = bezel[y]
    # from inside the display (well right of the corner) leftwards to the bezel
    i = L + 300
    while i > 0 and not (line[i] and line[i - 1] and line[i - 2]):
        i -= 1
    pts.append((y, i))
best = None
for rad in range(40, 320):
    err = 0
    n = 0
    for y, x in pts:
        dy = (T + rad) - y
        if dy < 0:
            continue
        xe = L + rad - math.sqrt(max(0, rad * rad - dy * dy))
        err += (xe - x) ** 2
        n += 1
    if n > 5:
        e = err / n
        if best is None or e < best[0]:
            best = (e, rad)
rad = best[1]
print('display', dict(L=L, R=R, T=T, B=B, w=R - L, h=B - T, rad=rad, fit=round(best[0], 2), aspect=round((R - L) / (B - T), 4), want=round(SCREEN_W / SCREEN_H, 4)))

# scale so the display is SCREEN_W × SCREEN_H (a non-uniform stretch of a percent or two at most)
sx = SCREEN_W / (R - L)
sy = SCREEN_H / (B - T)
print('scale', round(sx, 4), round(sy, 4), 'stretch', round(sy / sx, 4))
# the cut-out: the display as a rounded rectangle 1px inside the bezel's inner edge... cut 2px into the
# bezel so no green fringe survives (the screen beneath is drawn 4px larger, under the bezel)
inset = -3
mask = Image.new('L', im.size, 0)
from PIL import ImageDraw
ImageDraw.Draw(mask).rounded_rectangle([L - 3, T - 3, R + 3, B + 3], radius=rad + 3, fill=255)
mask = mask.filter(ImageFilter.GaussianBlur(0.8))
out = np.asarray(im).copy()
m = np.asarray(mask).astype(np.float32) / 255
out[..., 3] = (out[..., 3].astype(np.float32) * (1 - m)).astype(np.uint8)
# despill: any green left on the body (edge glow) → neutral
o = out.astype(np.float32)
spill = np.clip(o[..., 1] - np.maximum(o[..., 0], o[..., 2]), 0, None)
o[..., 1] -= spill
out = o.clip(0, 255).astype(np.uint8)
# crop to the body, then scale
ys, xs = np.where(out[..., 3] > 8)
x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
crop = Image.fromarray(out).crop((x0, y0, x1, y1))
nw, nh = round(crop.width * sx), round(crop.height * sy)
HI = 1.6  # stored at 1.6x (about the photo's own resolution) so close-ups stay sharp
crop = crop.resize((round(nw * HI), round(nh * HI)), Image.LANCZOS)
geo = {
    'w': nw, 'h': nh,
    'screenX': round((L - x0) * sx, 2), 'screenY': round((T - y0) * sy, 2),
    'screenW': SCREEN_W, 'screenH': SCREEN_H, 'radius': round(rad * (sx + sy) / 2, 1),
}
import os
os.makedirs('public/phone', exist_ok=True)
crop.save('public/phone/frame.png', optimize=True)
json.dump(geo, open('public/phone/frame.json', 'w'), indent=2)
print(geo)
