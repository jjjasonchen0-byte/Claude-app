const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 3440, height: 2000 }, deviceScaleFactor: 0.5 });
  await p.goto('file://' + __dirname + '/styleframe.html');
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(500);
  await p.screenshot({ path: __dirname + '/styleframe.png' });
  await b.close();
})();
