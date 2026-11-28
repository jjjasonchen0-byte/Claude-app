# The invite card's map: the routes coming in to the spot, cut from the race clip
# (frame 262: the avatars lined up by the spot, before the app zooms out to the results).
import sys
from PIL import Image
# (python3 spot-card.py --dark: the same, from the dark-mode capture)
D = '/home/user/Claude-app/promo/public/captures' + ('-dark' if '--dark' in sys.argv else '')
im = Image.open(f'{D}/raw/go/00262.jpg').convert('RGB')
im.crop((279, 1051, 1029, 1405)).save(f'{D}/spot-card.png')  # (New York: everyone's routes into Handcraft, its label just below)
print('spot-card', im.size)
