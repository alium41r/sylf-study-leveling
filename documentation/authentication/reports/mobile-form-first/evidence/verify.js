async (page) => {
  const c=await page.context().browser().newContext();
  const p=await c.newPage();
  const root='/Users/aliumair/Desktop/sylf/documentation/authentication/reports/mobile-form-first/evidence';
  const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await c.route('**/api/**',r=>r.fulfill({status:401,json:{}}));
  await p.goto('http://localhost:3000/login?force=true');
  const results=[];
  for(const [name,route,width,height,mode,bg,accent] of [
    ['login-desktop','login',1366,768,'dark','simple','#06b6d4'],
    ['login-wide','login',1920,1080,'dark','simple','#7c3aed'],
    ['register-light','register',1440,1000,'light','simple','#7c3aed'],
    ['login-mobile','login',390,844,'dark','simple','#06b6d4'],
    ['register-small','register',320,568,'light','simple','#7c3aed'],
    ['login-tablet','login',768,1024,'dark','simple','#7c3aed'],
    ['register-narrow-desktop','register',1024,768,'dark','simple','#7c3aed'],
    ['login-mobile-breakpoint','login',900,900,'dark','simple','#06b6d4'],
    ['login-desktop-breakpoint','login',901,900,'dark','simple','#06b6d4'],
    ['login-custom-light','login',1366,768,'dark','#f5e8d6','#a24732'],
    ['register-custom-dark','register',390,844,'light','#112b29','#9edabe'],
  ]) {
    await p.setViewportSize({width,height});
    await p.evaluate(({mode,bg,accent})=>{localStorage.setItem('app_mode',mode);localStorage.setItem('app_background',bg);localStorage.setItem('app_theme',accent);},{mode,bg,accent});
    await p.goto(`http://localhost:3000/${route}?force=true`);
    await p.locator('h1').waitFor();await p.locator('[data-sylf-companion][data-animation]').waitFor({state:'attached'});await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(500);
    const layout=await p.evaluate(()=>{
      const h=document.querySelector('h1');const scene=document.querySelector('aside');const intro=scene.querySelector('header');const world=intro.nextElementSibling;const form=document.querySelector('#auth-form');
      const a=intro.getBoundingClientRect(),b=world.getBoundingClientRect(),d=h.getBoundingClientRect();
      return {headingCount:document.querySelectorAll('h1').length,headingInScene:scene.contains(h),headingInForm:form.contains(h),greetingAboveIsland:a.bottom<=b.top+1,greetingLeftOfIsland:a.right<=b.left+1,formFirst:form.getBoundingClientRect().bottom<=scene.getBoundingClientRect().top+1,desktopSideBySide:form.getBoundingClientRect().right<=scene.getBoundingClientRect().left+1,badgeRemoved:!document.body.textContent.includes('CONTINUE YOUR JOURNEY'),mobile:innerWidth<=900,headingInBounds:d.left>=0&&d.right<=innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,formAboveFold:form.getBoundingClientRect().top<innerHeight,edgeLanes:document.querySelectorAll('[data-celestial-decor="auth"] [data-side]').length,sceneCanopies:scene.querySelectorAll('svg[viewBox="0 0 170 300"]').length,edgeIgnoresPointer:getComputedStyle(document.querySelector('[data-celestial-decor="auth"]')).pointerEvents==='none',edgeWithinMargin:[...document.querySelectorAll('[data-celestial-decor="auth"] [data-side]')].every(lane=>{const x=lane.getBoundingClientRect(),field=document.querySelector('input').getBoundingClientRect();return x.right<=field.left||x.left>=field.right;})};
    });
    if(layout.headingCount!==1||layout.headingInScene||!layout.headingInForm||(layout.mobile?(!layout.formFirst||!layout.greetingLeftOfIsland):(!layout.desktopSideBySide||!layout.greetingAboveIsland))||!layout.badgeRemoved||!layout.headingInBounds||layout.overflow||layout.edgeLanes!==2||layout.sceneCanopies!==0||!layout.edgeIgnoresPointer||!layout.edgeWithinMargin)throw new Error(name+JSON.stringify(layout));
    await p.screenshot({path:`${root}/${name}.png`,fullPage:true});results.push({name,width,height,...layout});
  }
  await p.getByLabel('Password',{exact:true}).fill('samplepassword');
  await p.locator('[data-eye-expression="SLEEPY"]').waitFor();
  await p.emulateMedia({reducedMotion:'reduce'});
  await p.goto('http://localhost:3000/login?force=true');
  await p.locator('[data-sylf-companion][data-animation]').waitFor({state:'attached'});const reduced=await p.locator('aside').evaluate(el=>el.getAnimations({subtree:true}).length===0)&&await p.locator('[data-celestial-decor="auth"]').evaluate(el=>el.getAnimations({subtree:true}).length===0);
  if(!reduced||errors.length)throw new Error(JSON.stringify({reduced,errors}));
  await c.close();return{results,passwordPrivacy:true,reducedMotion:reduced,errors};
}
