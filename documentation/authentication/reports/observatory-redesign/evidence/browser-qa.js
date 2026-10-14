async (page) => {
  const browser = page.context().browser();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const p = await context.newPage();
  const root = '/Users/aliumair/Desktop/sylf/documentation/authentication/reports/observatory-redesign/evidence';
  const base = 'http://127.0.0.1:3001';
  const results = { viewports: [], interactions: {}, performance: {}, errors: [] };
  p.on('pageerror', error => results.errors.push(error.message));
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  await p.goto(`${base}/login`);
  const variants = [
    ['login-desktop-dark', '/login', 1440, 1000, 'dark', 'simple', '#7c3aed'],
    ['register-desktop-light', '/register', 1440, 1000, 'light', 'simple', '#7c3aed'],
    ['login-mobile-dark', '/login', 390, 844, 'dark', 'simple', '#7c3aed'],
    ['register-mobile-light', '/register', 390, 844, 'light', 'simple', '#7c3aed'],
    ['register-small-light', '/register', 320, 568, 'light', 'simple', '#7c3aed'],
    ['register-tablet-light', '/register', 768, 1024, 'light', 'simple', '#7c3aed'],
    ['login-tablet-dark', '/login', 900, 700, 'dark', 'simple', '#7c3aed'],
    ['register-small-desktop', '/register', 1024, 768, 'dark', 'simple', '#7c3aed'],
    ['login-wide', '/login', 1920, 1080, 'dark', 'simple', '#7c3aed'],
    ['register-short-desktop', '/register', 1280, 600, 'dark', 'simple', '#7c3aed'],
    ['register-custom-light-in-dark-mode', '/register', 1366, 768, 'dark', '#f5e8d6', '#a24732'],
    ['login-custom-dark-in-light-mode', '/login', 390, 844, 'light', '#112b29', '#9edabe'],
  ];
  for (const [name, route, width, height, mode, bg, accent] of variants) {
    await p.setViewportSize({ width, height });
    await p.evaluate(({ mode, bg, accent }) => {
      localStorage.setItem('app_mode', mode);
      localStorage.setItem('app_background', bg);
      localStorage.setItem('app_theme', accent);
    }, { mode, bg, accent });
    await p.goto(`${base}${route}`);
    await p.locator('h1').waitFor();
    await p.waitForTimeout(500);
    const metrics = await p.evaluate(() => {
      const form = document.querySelector('form');
      const button = form.querySelector('button[type=submit]');
      const input = form.querySelector('input');
      const box = form.getBoundingClientRect();
      const toRGB = color => {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
        const ctx = canvas.getContext('2d'); ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1);
        return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
      };
      const luminance = color => toRGB(color).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((total, v, i) => total + v * [.2126, .7152, .0722][i], 0);
      const contrast = (a, b) => { const l1 = luminance(a), l2 = luminance(b); return +((Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05)).toFixed(2); };
      const pageBackground = getComputedStyle(document.querySelector('section[aria-label=Authentication]').parentElement.parentElement).backgroundColor;
      const text = getComputedStyle(document.querySelector('label'));
      const btn = getComputedStyle(button);
      const hint = getComputedStyle(document.querySelector('h1 + p'));
      return {
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
        formInBounds: box.left >= 0 && box.right <= innerWidth,
        inputHeight: input.getBoundingClientRect().height,
        submitHeight: button.getBoundingClientRect().height,
        textContrast: contrast(text.color, pageBackground),
        secondaryContrast: contrast(hint.color, pageBackground),
        buttonContrast: contrast(btn.color, btn.backgroundColor),
        inputFontSize: getComputedStyle(input).fontSize,
        svgImages: document.querySelectorAll('aside svg image').length,
      };
    });
    assert(!metrics.horizontalOverflow && metrics.formInBounds, `${name}: overflow`);
    assert(metrics.inputHeight >= 44 && metrics.submitHeight >= 44, `${name}: target size`);
    assert(metrics.textContrast >= 4.5 && metrics.secondaryContrast >= 4.5 && metrics.buttonContrast >= 4.5, `${name}: contrast ${JSON.stringify(metrics)}`);
    await p.screenshot({ path: `${root}/${name}.png`, fullPage: true });
    results.viewports.push({ name, width, height, ...metrics });
  }
  // All credential mutations are intercepted; no real account is created or changed.
  await p.route('**/api/auth/check-username?*', route => route.fulfill({ json: { available: !route.request().url().includes('taken'), error: 'This username is already taken.' } }));
  await p.setViewportSize({ width: 1440, height: 1000 });
  await p.evaluate(() => { localStorage.setItem('app_mode', 'dark'); localStorage.setItem('app_background', 'simple'); localStorage.setItem('app_theme', '#7c3aed'); });
  await p.goto(`${base}/login?verified=true`);
  await p.getByRole('status').filter({ hasText: 'email has been verified' }).waitFor();
  await p.getByRole('button', { name: 'Lantern light' }).click();
  assert(await p.locator('aside').getAttribute('data-lit') === 'false', 'lantern toggle');
  await p.getByRole('button', { name: 'Lantern light' }).click();
  await p.getByRole('button', { name: 'Pause scene animation' }).click();
  assert(await p.locator('aside').getAttribute('data-paused') === 'true', 'pause toggle');
  await p.waitForTimeout(500); // Allow the pointer's finite return-to-center transition to settle.
  const paused = await p.locator('aside').evaluate(el => el.getAnimations({ subtree: true }).filter(a => 'animationName' in a).every(a => a.playState === 'paused'));
  assert(paused, 'scene animations must pause');
  await p.getByRole('button', { name: 'Pause scene animation' }).click();
  await p.getByLabel('Email or Username').fill('test_scholar');
  await p.getByLabel('Password', { exact: true }).fill('TestPassword123!');
  const eyes = await p.locator('[data-scholar-eyes]').first().evaluate(el => getComputedStyle(el).transform);
  assert(eyes.includes('0.1'), 'scholar closes eyes on password focus');
  await p.getByRole('button', { name: 'Show password' }).focus();
  await p.keyboard.press('Enter');
  assert(await p.getByLabel('Password', { exact: true }).getAttribute('type') === 'text', 'keyboard reveal');
  await p.getByRole('button', { name: 'Hide password' }).click();
  let loginPayload;
  await p.route('**/api/auth/login', async route => {
    loginPayload = route.request().postDataJSON();
    await new Promise(resolve => setTimeout(resolve, 450));
    await route.fulfill({ status: 401, json: { error: 'We couldn’t sign you in. Check your details and try again.' } });
  });
  await p.getByRole('button', { name: 'Sign in', exact: true }).click();
  assert(await p.getByRole('button', { name: 'Signing in…' }).isDisabled(), 'login busy');
  await p.getByRole('alert').filter({ hasText: 'We couldn’t sign you in.' }).waitFor();
  assert(loginPayload.identifier === 'test_scholar' && loginPayload.password === 'TestPassword123!', 'login payload');
  await p.screenshot({ path: `${root}/login-error.png`, fullPage: true });
  results.interactions = { lantern: true, pause: paused, passwordFocus: true, keyboardReveal: true, loginPayload: true, loginLoading: true, loginError: true, verificationMessage: true };

  await p.goto(`${base}/register`);
  await p.getByLabel('Display Name').fill('Test Scholar');
  await p.getByLabel('Username', { exact: true }).fill('taken');
  await p.getByRole('status').filter({ hasText: 'already taken' }).waitFor();
  assert(await p.getByLabel('Username', { exact: true }).getAttribute('aria-invalid') === 'true', 'taken state');
  await p.getByLabel('Username', { exact: true }).fill('QA-Scholar!');
  await p.getByRole('status').filter({ hasText: 'Username is available' }).waitFor();
  assert(await p.getByLabel('Username', { exact: true }).inputValue() === 'qascholar', 'username normalization');
  await p.getByLabel('Email Address').fill('qa@example.test');
  await p.getByLabel('Password', { exact: true }).fill('TestPassword123!');
  await p.route('**/api/auth/register', route => route.fulfill({ status: 503, json: { error: 'Please try again in a moment.' } }));
  await p.getByRole('button', { name: 'Create account', exact: true }).click();
  await p.getByRole('alert').filter({ hasText: 'Please try again in a moment.' }).waitFor();
  assert(await p.getByLabel('Display Name').inputValue() === 'Test Scholar', 'registration values survive error');
  results.interactions.registrationValidation = true;
  results.interactions.registrationRetry = true;
  await p.screenshot({ path: `${root}/register-validation.png`, fullPage: true });

  await p.emulateMedia({ reducedMotion: 'reduce' });
  await p.goto(`${base}/login`);
  const animations = await p.locator('section[aria-label=Authentication]').evaluate(el => el.parentElement.parentElement.getAnimations({ subtree: true }).length);
  assert(animations === 0, 'reduced motion must stop all auth animations');
  assert(await p.getByRole('button', { name: 'Pause scene animation' }).count() === 0, 'redundant reduced-motion control hidden');
  results.interactions.reducedMotion = true;
  await p.emulateMedia({ reducedMotion: 'no-preference' });
  await p.reload();
  await p.waitForTimeout(700);
  const cdp = await context.newCDPSession(p);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  results.performance = await p.evaluate(async () => {
    const intervals = []; let last = 0;
    await new Promise(resolve => {
      const measure = timestamp => { if (last) intervals.push(timestamp - last); last = timestamp; if (intervals.length < 120) requestAnimationFrame(measure); else resolve(); };
      requestAnimationFrame(measure);
    });
    intervals.sort((a, b) => a - b);
    return { cpuThrottle: 4, frames: intervals.length, medianFrameMs: +intervals[60].toFixed(2), p95FrameMs: +intervals[114].toFixed(2), maxFrameMs: +intervals[119].toFixed(2), svgNodes: document.querySelectorAll('aside svg *').length, activeAnimations: document.querySelector('aside').getAnimations({ subtree: true }).length };
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await p.setViewportSize({ width: 390, height: 500 });
  await p.goto(`${base}/register`);
  await p.getByRole('button', { name: 'Create account', exact: true }).scrollIntoViewIfNeeded();
  await p.waitForTimeout(100);
  assert(await p.locator('aside').getAttribute('data-active') === 'false', 'offscreen scene paused');
  results.interactions.offscreenPause = true;
  await context.close();
  return results;
}
