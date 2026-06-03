const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(`[error] ${msg.text()}`);
  });
  page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`));

  // ── LOGIN ──────────────────────────────────────────────────────────────────
  console.log('=== STEP 1: LOGIN ===');
  await page.goto('http://localhost:5173/login', { timeout: 15000 });
  // Wait for React to render the inputs
  await page.waitForSelector('input', { timeout: 15000 });
  await page.waitForTimeout(1000);

  await page.screenshot({ path: '/tmp/pnl-login.png' });
  const inputs = await page.evaluate(() => Array.from(document.querySelectorAll('input')).map(i => ({ type: i.type, placeholder: i.placeholder })));
  console.log('Inputs found:', JSON.stringify(inputs));

  // Fill whichever input appears first (email/username field)
  const allInputs = await page.locator('input').all();
  if (allInputs.length >= 2) {
    await allInputs[0].fill('Gautam@yopmail.com');
    await allInputs[1].fill('Test@123');
  }
  
  await page.locator('button:has-text("Sign in")').click();
  await page.waitForTimeout(4000);
  console.log('After login URL:', page.url());

  if (page.url().includes('login')) {
    console.log('Still on login page - checking for error or trying alternate approach');
    await page.screenshot({ path: '/tmp/pnl-login-attempt.png' });
    const pageText = await page.evaluate(() => document.body.innerText);
    console.log('Page text:', pageText.substring(0, 300));
    // Try demo credentials
    await allInputs[0].fill('demo@example.com');
    await allInputs[1].fill('demo123');
    await page.locator('button:has-text("Sign in")').click();
    await page.waitForTimeout(3000);
    console.log('After demo login URL:', page.url());
  }

  // ── TRADE PAGE — HARD RELOAD ───────────────────────────────────────────────
  console.log('\n=== STEP 2: TRADE PAGE (hard reload) ===');
  await page.goto('http://localhost:5173/trade', { timeout: 15000 });
  await page.waitForTimeout(1000);
  // Hard reload
  await page.evaluate(() => location.reload(true));
  await page.waitForTimeout(5000); // let React + async data settle

  await page.screenshot({ path: '/tmp/pnl-trade-hero.png', fullPage: false });
  console.log('Screenshot saved: /tmp/pnl-trade-hero.png');

  const tradePageText = await page.evaluate(() => document.body.innerText);
  console.log('\nTRADE PAGE FULL TEXT:\n' + tradePageText.substring(0, 3000));

  // ── FIND HISTORY TAB ───────────────────────────────────────────────────────
  console.log('\n=== STEP 3: HISTORY TAB ===');
  const allBtnTexts = await page.evaluate(() => 
    Array.from(document.querySelectorAll('button, [role="tab"]'))
      .map(b => b.innerText.trim())
      .filter(t => t.length > 0 && t.length < 40)
  );
  console.log('All buttons/tabs on trade page:', allBtnTexts.slice(0, 30));

  // Try to find History tab
  const historyLocator = page.locator('button:has-text("History"), [role="tab"]:has-text("History")');
  const histCount = await historyLocator.count();
  console.log('History buttons found:', histCount);

  if (histCount > 0) {
    await historyLocator.first().click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: '/tmp/pnl-history-tab.png', fullPage: false });
    console.log('Screenshot saved: /tmp/pnl-history-tab.png');
    const histText = await page.evaluate(() => document.body.innerText);
    console.log('\nHISTORY TAB TEXT:\n' + histText.substring(0, 3000));
  } else {
    // Try /history route
    await page.goto('http://localhost:5173/history', { timeout: 15000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: '/tmp/pnl-history-tab.png', fullPage: false });
    const histText = await page.evaluate(() => document.body.innerText);
    console.log('\nHISTORY PAGE TEXT:\n' + histText.substring(0, 3000));
  }

  // ── ANALYTICS PAGE ────────────────────────────────────────────────────────
  console.log('\n=== STEP 4: ANALYTICS PAGE ===');
  await page.goto('http://localhost:5173/analytics', { timeout: 15000 });
  await page.waitForTimeout(4000);

  // Check if Today preset needs clicking
  const analyticsBtns = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim()).filter(Boolean)
  );
  console.log('Analytics buttons:', analyticsBtns.slice(0, 20));

  // Try clicking Today
  const todayBtn = page.locator('button').filter({ hasText: /^Today$/ }).first();
  const todayCount = await todayBtn.count();
  if (todayCount > 0) {
    await todayBtn.click();
    await page.waitForTimeout(2000);
    console.log('Clicked Today preset');
  }

  await page.screenshot({ path: '/tmp/pnl-analytics.png', fullPage: false });
  console.log('Screenshot saved: /tmp/pnl-analytics.png');

  const analyticsText = await page.evaluate(() => document.body.innerText);
  console.log('\nANALYTICS PAGE TEXT:\n' + analyticsText.substring(0, 3000));

  // ── CONSOLE ERRORS ────────────────────────────────────────────────────────
  console.log('\n=== CONSOLE ERRORS (non-HMR) ===');
  const filteredErrors = errors.filter(e =>
    !e.includes('WebSocket') &&
    !e.includes('HMR') &&
    !e.includes('ws://') &&
    !e.includes('[vite]') &&
    !e.includes('net::ERR_ABORTED')
  );
  if (filteredErrors.length === 0) console.log('No relevant console errors.');
  else filteredErrors.forEach(e => console.log(e));

  await browser.close();
  console.log('\n=== DONE ===');
})().catch(e => { console.error('SCRIPT ERROR:', e); process.exit(1); });
