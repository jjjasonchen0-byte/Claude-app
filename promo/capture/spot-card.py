# The invite card's map: everyone gathered at the spot, their routes in, cut from the race clip
# (frame 262: the avatars lined up by the spot, before the app zooms out to the results).
from PIL import Image
D = '/home/user/Claude-app/promo/public/captures'
im = Image.open(f'{D}/raw/go/00262.jpg').convert('RGB')
im.crop((0, 1170, 750, 1525)).save(f'{D}/spot-card.png')
print('spot-card', im.size)
