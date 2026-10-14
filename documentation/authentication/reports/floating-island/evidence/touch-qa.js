async (page) => {
  const context = await page.context().browser().newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
  const p = await context.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await context.route('**/api/**', r => r.fulfill({status:401,json:{}}));
  await p.goto('http://127.0.0.1:3001/login');
  // A real touch can hit the gently drifting companion; locator.tap waits indefinitely for CSS motion to stop.
  const target = await p.getByRole('button', {name:'Say hello to Sylf'}).boundingBox();
  await p.touchscreen.tap(target.x + target.width / 2, target.y + target.height / 2);
  await p.locator('[data-sylf-companion][data-action=HELLO]').waitFor();
  await p.locator('[data-sylf-companion][data-action=READING]').waitFor();
  await p.getByRole('button', {name:'Lantern light'}).tap();
  const dimmed = await p.locator('aside').getAttribute('data-lit') === 'false';
  await p.getByRole('button', {name:'Lantern light'}).tap();
  await p.waitForTimeout(700);
  const cdp = await context.newCDPSession(p);
  await cdp.send('Emulation.setCPUThrottlingRate', {rate:4});
  const performance = await p.evaluate(async () => {
    const intervals=[]; let last=0;
    await new Promise(resolve=>{
      const frame = t=>{if(last)intervals.push(t-last);last=t;if(intervals.length<120)requestAnimationFrame(frame);else resolve();};
      requestAnimationFrame(frame);
    });
    intervals.sort((a,b)=>a-b);
    return {frames:120,cpuThrottle:4,medianFrameMs:+intervals[60].toFixed(2),p95FrameMs:+intervals[114].toFixed(2),maxFrameMs:+intervals[119].toFixed(2)};
  });
  await cdp.send('Emulation.setCPUThrottlingRate', {rate:1});
  await p.getByRole('button', {name:'Pause scene animation'}).tap();
  const paused = await p.locator('aside').getAttribute('data-paused') === 'true';
  await p.getByRole('button', {name:'Pause scene animation'}).tap();
  const visibility = await p.locator('aside').evaluate(el=>{
    Object.defineProperty(document,'hidden',{configurable:true,value:true});
    document.dispatchEvent(new Event('visibilitychange'));
    const hidden = el.getAttribute('data-active') === 'false' && el.querySelector('[data-sylf-companion]').getAttribute('data-animation') === 'paused';
    delete document.hidden;
    document.dispatchEvent(new Event('visibilitychange'));
    return {hidden,restored:el.getAttribute('data-active') === 'true'};
  });
  await p.screenshot({path:'/Users/aliumair/Desktop/sylf/documentation/authentication/reports/floating-island/evidence/login-touch-final.png',fullPage:true});
  if(!dimmed||!paused||!visibility.hidden||!visibility.restored||errors.length) throw new Error('Touch/visibility verification failed');
  await context.close();
  return {viewport:{width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true},touchGreeting:true,returnToReading:true,touchLamp:dimmed,touchPause:paused,visibility,performance,errors};
}
