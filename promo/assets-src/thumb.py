# The photographed right thumb (Higgsfield, green screen) → public/phone/thumb.png: keyed, graded to
# sit under the same studio light as the phone, plus its shadows (near the glass and lifted off it,
# quarter size with 240px of room all round) and thumb.json: the pad's contact point under the nail,
# the thumb's axis (tip → base) and its width. The left thumb is this one mirrored.
import json, sys
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter

SRC = sys.argv[1] if len(sys.argv) > 1 else 'assets-src/hf/thumb-a.png'
im = Image.open(SRC).convert('RGB')
W, H = im.size
a = np.asarray(im).astype(np.float32)
r, g, b = a[..., 0], a[..., 1], a[..., 2]
# key: how much greener than red/blue a pixel is
spill = g - np.maximum(r, b)
alpha = np.clip(1 - (spill - 30) / (110 - 30), 0, 1)
alpha = np.asarray(Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))).astype(np.float32) / 255
# despill: green on the skin's edge → the skin's own red/blue level
a[..., 1] = np.minimum(g, np.maximum(r, b) * 0.98 + 4)
rgb = Image.fromarray(a.clip(0, 255).astype(np.uint8))
rgb = ImageEnhance.Brightness(rgb).enhance(0.92)
rgb = ImageEnhance.Contrast(rgb).enhance(1.05)
rgb = ImageEnhance.Color(rgb).enhance(0.93)
# a little falloff towards the base (further from the light, nearer the edge of the frame)
xs = np.arange(W)[None, :]
ys = np.arange(H)[:, None]
d = np.clip((xs / W + ys / H - 0.9) / 1.1, 0, 1)
arr = np.asarray(rgb).astype(np.float32) * (1 - 0.22 * d[..., None])
A = (alpha * 255).astype(np.uint8)
out = Image.fromarray(np.dstack([arr.clip(0, 255).astype(np.uint8), A]), 'RGBA')

# the tip: the topmost solid row; the axis from the middle of the thumb a little and further down
solid = A > 128
ty = int(np.where(solid.any(axis=1))[0].min())
row = lambda y: np.where(solid[y])[0]
tx = float(row(ty + 3).mean())
# the thumb's centre line, row by row (only its own run of skin: the first run from the left)
def centre(y):
    xs_ = row(y)
    runs = np.split(xs_, np.where(np.diff(xs_) > 1)[0] + 1)
    run = runs[0]
    return (run.min() + run.max()) / 2, run.max() - run.min()
c1, w1 = centre(ty + 200)
c2, w2 = centre(ty + 520)
ax, ay = c2 - c1, 320.0
n = (ax ** 2 + ay ** 2) ** 0.5
ax, ay = ax / n, ay / n
width = w1 * ay  # across the thumb, near the nail
# the pad that touches the glass: under the nail, ~40% of a width down the axis from the tip
contact = (tx + ax * width * 0.42, ty + ay * width * 0.42)

# stored at half size (still ~2x the screen at the closest framing)
S = 0.5
out_s = out.resize((round(W * S), round(H * S)), Image.LANCZOS)
out_s.save('public/phone/thumb.png', optimize=True)
# shadows: the silhouette, blurred near (on the glass) and far (lifted), quarter size with 240px padding
pad = 240
sil = Image.new('L', (W + 2 * pad, H + 2 * pad), 0)
sil.paste(Image.fromarray(A), (pad, pad))
q = (round((W + 2 * pad) / 4), round((H + 2 * pad) / 4))
for name, blur in (('near', 14), ('far', 46)):
    s = sil.filter(ImageFilter.GaussianBlur(blur)).resize(q, Image.LANCZOS)
    sh = Image.new('RGBA', q, (0, 0, 0, 0))
    sh.putalpha(s)
    sh.save(f'public/phone/thumb-shadow-{name}.png', optimize=True)
geo = {'w': round(W * S), 'h': round(H * S), 'tipX': round(tx * S, 1), 'tipY': round(ty * S, 1),
       'contactX': round(contact[0] * S, 1), 'contactY': round(contact[1] * S, 1),
       'axisX': round(ax, 4), 'axisY': round(ay, 4), 'thumbW': round(float(width) * S, 1), 'pad': pad * S}
json.dump(geo, open('public/phone/thumb.json', 'w'), indent=2)
print(geo)
