// Meet's start screen, from the live site.
import { openRig, LIVE } from './rig.mjs';
const rig = await openRig({ out: '/home/user/Claude-app/promo/public/captures', url: LIVE });
const { page } = rig;
await rig.idle(4000);
await page.evaluate(() => {
  document.querySelector('#demo-sample')?.remove();
  const i = document.querySelector('#home-input');
  if (i) i.placeholder = 'Where are you starting from?';
});
await page.evaluate(() => document.fonts.ready);
await rig.idle(300);
await rig.still('start');
console.log('ok', rig.errors);
await rig.close();
