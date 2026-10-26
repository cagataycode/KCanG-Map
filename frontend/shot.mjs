import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('console', msg => console.log('CONSOLE', msg.type(), msg.text()));
page.on('pageerror', err => console.log('PAGEERROR', err.message));
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(5000);
await page.screenshot({ path: '../.cursor/map-audit.png', fullPage: false });
const info = await page.evaluate(() => {
  const root = document.querySelector('.status')?.textContent || null;
  const brand = document.querySelector('.brand')?.textContent || null;
  const checks = [...document.querySelectorAll('.layer-row')].map(el => ({
    text: el.textContent?.trim(),
    checked: el.querySelector('input')?.checked ?? null,
  }));
  return { brand, root, checks, url: location.href };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
