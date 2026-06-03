const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  
  // ─── Step 1: Login ────────────────────────────────────────────────────────
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(`[error] ${msg.text()}`);
    if (msg.type() === 'warning') errors.push(`[warn] ${msg.text()}`);
  });
  page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`));

  console.log('=== LOGIN ===');
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
  await page.screenshot({ path: '/tmp/sd-login.png' });
  
  // Fill login form
  const emailField = page.locator('input[type="email"], input[placeholder*="Email"], input[placeholder*="email"], input[placeholder*="Username"]').first();
  await emailField.fill('demo@example.com');
  const passField = page.locator('input[type="password"]').first();
  await passField.fill('demo123');
  await page.keyboard.press('Enter');
  await page.waitForURL(/(?!.*login)/, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(2000);
  console.log('After login URL:', page.url());

  // ─── Step 2: Navigate to RELIANCE at 1440x900 ─────────────────────────────
  console.log('\n=== TEST 1: XL DESKTOP 1440x900 ===');
  await page.goto('http://localhost:5173/stock/RELIANCE', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(3000); // let chart render

  // Collect layout info
  const layout1440 = await page.evaluate(() => {
    // Check for the two-column grid container
    const gridEl = document.querySelector('.xl\\:grid');
    const chartCol = document.querySelector('.xl\\:col-span-2');
    const sidePanel = document.querySelector('aside.hidden.xl\\:block');
    const floatingBar = document.querySelector('.xl\\:hidden.fixed.bottom-\\[72px\\], .xl\\:hidden.fixed');
    
    // Chart canvas
    const canvas = document.querySelector('canvas');
    const containerDiv = document.querySelector('[class*="w-full h-full"]');

    const getRect = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height, right: r.right };
    };

    // Check what's actually visible
    const isVisible = (el) => {
      if (!el) return false;
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    };

    // Floating bar detection - look for the fixed bottom bar
    const fixedEls = Array.from(document.querySelectorAll('[class*="xl:hidden"][class*="fixed"]'));
    
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      gridEl: { exists: !!gridEl, rect: getRect(gridEl), classes: gridEl?.className },
      chartCol: { exists: !!chartCol, rect: getRect(chartCol), classes: chartCol?.className },
      sidePanel: { exists: !!sidePanel, visible: isVisible(sidePanel), rect: getRect(sidePanel), classes: sidePanel?.className },
      canvas: { exists: !!canvas, rect: getRect(canvas) },
      floatingBarCount: fixedEls.length,
      floatingBarVisible: fixedEls.some(el => isVisible(el)),
      floatingBarDetails: fixedEls.map(el => ({ 
        visible: isVisible(el), 
        classes: el.className,
        rect: getRect(el),
        computedDisplay: window.getComputedStyle(el).display
      })),
      asideEl: (() => {
        const aside = document.querySelector('aside');
        return { exists: !!aside, rect: getRect(aside), visible: isVisible(aside), computedDisplay: aside ? window.getComputedStyle(aside).display : null };
      })(),
    };
  });
  console.log('Layout @ 1440:', JSON.stringify(layout1440, null, 2));

  // Screenshot at top
  await page.screenshot({ path: '/tmp/sd-xl.png', fullPage: false });
  console.log('Screenshot saved: /tmp/sd-xl.png');

  // Scroll down 400px
  await page.evaluate(() => window.scrollBy(0, 400));
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/sd-xl-scrolled.png', fullPage: false });
  console.log('Screenshot saved: /tmp/sd-xl-scrolled.png');

  // Check canvas dimensions after scroll
  const canvasInfo = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return { exists: false };
    const r = canvas.getBoundingClientRect();
    return { exists: true, width: canvas.width, height: canvas.height, rect: { left: r.left, top: r.top, width: r.width, height: r.height }, style: { width: canvas.style.width, height: canvas.style.height } };
  });
  console.log('Canvas info @ 1440:', JSON.stringify(canvasInfo));

  // ─── Step 3: TABLET 1100x900 ──────────────────────────────────────────────
  console.log('\n=== TEST 2: TABLET 1100x900 ===');
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1500); // let chart reflow

  const layout1100 = await page.evaluate(() => {
    const sidePanel = document.querySelector('aside.hidden.xl\\:block');
    const isVisible = (el) => {
      if (!el) return false;
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    };
    const fixedEls = Array.from(document.querySelectorAll('[class*="xl:hidden"][class*="fixed"]'));
    const canvas = document.querySelector('canvas');
    const getRect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { width: r.width, height: r.height }; };
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      sidePanelVisible: isVisible(sidePanel),
      sidePanelDisplay: sidePanel ? window.getComputedStyle(sidePanel).display : null,
      floatingBarVisible: fixedEls.some(el => isVisible(el)),
      floatingBarDetails: fixedEls.map(el => ({ visible: isVisible(el), computedDisplay: window.getComputedStyle(el).display, rect: getRect(el) })),
      canvas: { exists: !!canvas, width: canvas?.width, height: canvas?.height, rect: getRect(canvas) },
    };
  });
  console.log('Layout @ 1100:', JSON.stringify(layout1100, null, 2));
  await page.screenshot({ path: '/tmp/sd-lg.png' });
  console.log('Screenshot saved: /tmp/sd-lg.png');

  // ─── Step 4: Resize back to 1440 and back to 1100 ─────────────────────────
  console.log('\n=== TEST 3: RESIZE 1100 → 1440 → 1100 ===');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(1000);
  const canvas1440 = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    return c ? { width: c.width, height: c.height, rect: c.getBoundingClientRect().width } : null;
  });
  console.log('Canvas after resize to 1440:', canvas1440);

  await page.setViewportSize({ width: 1100, height: 900 });
  await page.waitForTimeout(1000);
  const canvas1100back = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    return c ? { width: c.width, height: c.height, rect: c.getBoundingClientRect().width } : null;
  });
  console.log('Canvas after resize back to 1100:', canvas1100back);

  // Final screenshot after resize cycle
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/sd-xl-after-resize.png' });
  console.log('Screenshot saved: /tmp/sd-xl-after-resize.png');

  console.log('\n=== CONSOLE ERRORS ===');
  errors.forEach(e => console.log(e));
  if (errors.length === 0) console.log('No console errors detected.');

  await browser.close();
  console.log('\n=== DONE ===');
})().catch(e => { console.error('SCRIPT ERROR:', e); process.exit(1); });
