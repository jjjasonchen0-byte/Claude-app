# The photographed hand (Higgsfield) → public/phone/hand.png: graded to sit under the same studio light
# as the phone, the cut edges of the wrist feathered, plus hand.json (the fingertip's contact point).
import json
import numpy as np
from PIL import Image, ImageEnhance

im = Image.open('assets-src/hf/hand-a.png').convert('RGBA')
W, H = im.size
rgb = im.convert('RGB')
rgb = ImageEnhance.Brightness(rgb).enhance(0.9)
rgb = ImageEnhance.Contrast(rgb).enhance(1.06)
rgb = ImageEnhance.Color(rgb).enhance(0.94)
a = np.asarray(im)[..., 3].astype(np.float32)
# feather where the wrist meets the picture's edges (right and bottom), so it falls off into the dark
ramp = 160
xs = np.arange(W)[None, :]
ys = np.arange(H)[:, None]
fx = np.clip((W - 1 - xs) / ramp, 0, 1)
fy = np.clip((H - 1 - ys) / ramp, 0, 1)
# only towards the bottom-right (the fingertip side stays crisp)
a = a * np.minimum(fx ** 0.8, 1) * np.minimum(fy ** 0.8, 1)
# also darken the forearm a little away from the light (top-left), like falloff
d = np.clip((xs / W + ys / H - 1.0) / 0.9, 0, 1)
arr = np.asarray(rgb).astype(np.float32) * (1 - 0.28 * d[..., None])
out = np.dstack([arr.clip(0, 255), a]).astype(np.uint8)
Image.fromarray(out, 'RGBA').save('public/phone/hand.png', optimize=True)
# the fingertip: its top, and the pad's centre a little way down the finger (what touches the glass)
alpha = np.asarray(im)[..., 3]
ty = int(np.where(alpha > 128)[0].min())
tx = float(np.where(alpha[ty] > 128)[0].mean())
row = lambda y: np.where(alpha[y] > 128)[0]
c1 = row(ty + 120).mean(); c2 = row(ty + 300).mean()
ax, ay = c2 - c1, 180.0
n = (ax ** 2 + ay ** 2) ** 0.5
ax, ay = ax / n, ay / n
width = np.ptp(row(ty + 200)) * abs(ay)  # across the finger
contact = (tx + ax * width * 0.45, ty + ay * width * 0.45)
geo = {'w': W, 'h': H, 'tipX': round(tx, 1), 'tipY': ty, 'contactX': round(contact[0], 1), 'contactY': round(contact[1], 1),
       'axisX': round(ax, 4), 'axisY': round(ay, 4), 'fingerW': round(float(width), 1)}
json.dump(geo, open('public/phone/hand.json', 'w'), indent=2)
print(geo)
