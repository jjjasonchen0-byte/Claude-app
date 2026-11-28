# The invite card's map: the routes coming in to the spot, cut from the race clip
# (frame 262: the avatars lined up by the spot, before the app zooms out to the results).
from PIL import Image
D = '/home/user/Claude-app/promo/public/captures'
im = Image.open(f'{D}/raw/go/00262.jpg').convert('RGB')
im.crop((250, 1068, 1000, 1422)).save(f'{D}/spot-card.png')  # (New York: everyone's routes into Mama Fina's, its label just below)
print('spot-card', im.size)
