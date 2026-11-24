# The invite card's map: the routes coming in to the spot, cut from the race clip
# (frame 262: the avatars lined up by the spot, before the app zooms out to the results).
from PIL import Image
D = '/home/user/Claude-app/promo/public/captures'
im = Image.open(f'{D}/raw/go/00262.jpg').convert('RGB')
im.crop((0, 1360, 750, 1715)).save(f'{D}/spot-card.png')
print('spot-card', im.size)
