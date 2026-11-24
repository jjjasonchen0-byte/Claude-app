// Meet's start screen as the real app shows it (the test build's own extras hidden).
import { openRig } from './rig.mjs';
const rig = await openRig({ out: '/home/user/Claude-app/promo/public/captures' });
const { page } = rig;
await rig.idle(1500);
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
