async (page) => {
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:3,mobile:true});
  await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true});
  const records=[],canvas=page.locator('[data-editor-canvas]');
  const read=()=>page.evaluate(()=>{const c=document.querySelector('[data-editor-canvas]'),b=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let lit=0;for(let i=3;i<b.length;i+=4)if(b[i])lit++;const r=c.getBoundingClientRect();return{lit,css:[r.width,r.height],dpr:devicePixelRatio,frame:document.querySelector('[data-frame][aria-pressed="true"]')?.dataset.frame,tool:document.querySelector('[data-tool][aria-pressed="true"]')?.dataset.tool,color:document.querySelector('[data-swatch][aria-checked="true"]')?.dataset.swatch};});
  const record=async(name)=>{await page.waitForTimeout(60);records.push({name,...await read()});await page.evaluate(r=>window.__mobileAudit=r,records);};
  const touch=async(x,y)=>{await canvas.scrollIntoViewIfNeeded();const b=await canvas.boundingBox();const p={x:b.x+(x+.5)*b.width/48,y:b.y+(y+.5)*b.height/48};await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});};
  await page.getByRole('button',{name:'Delete frame',exact:true}).click();await touch(10,10);await record('touch draw mirrored');
  await page.getByRole('button',{name:'Erase',exact:true}).click();await touch(10,10);await record('touch erase leaves mirrored partner');
  await page.getByRole('button',{name:'Undo',exact:true}).click();await record('touch erase undo');
  await page.getByRole('button',{name:'Redo',exact:true}).click();await record('touch erase redo');
  await page.getByRole('button',{name:'Pick',exact:true}).click();await touch(37,10);await record('touch pick');
  await page.locator('[data-swatch="5"]').click();await page.getByRole('button',{name:'Fill',exact:true}).click();await touch(0,0);await record('touch fill');
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  for(const z of [4,6,8,12]){await page.locator('[data-zoom="'+z+'"]').click();await record('mobile zoom '+z);}
  await page.locator('[data-zoom="8"]').click();
  await canvas.scrollIntoViewIfNeeded();const b=await canvas.boundingBox();await page.mouse.move(b.x+40.5*b.width/48,b.y+12.5*b.height/48);
  records.push({name:'cursor alignment at cell 40',...await page.evaluate(()=>{const c=document.querySelector('[data-editor-canvas]').getBoundingClientRect(),u=document.querySelector('[data-cursor]').getBoundingClientRect();return{canvasWidth:c.width,expectedX:c.x+40*c.width/48,actualCursorX:u.x,errorPx:u.x-(c.x+40*c.width/48)};})});
  await page.getByRole('button',{name:'Duplicate frame',exact:true}).click();await record('mobile duplicate selection');
  await page.getByRole('button',{name:'Frame 2',exact:true}).click();await page.locator('[data-onion-toggle]').click();await record('mobile onion on');await page.locator('[data-onion-toggle]').click();
  await page.getByRole('button',{name:'Move frame 2 earlier',exact:true}).click();await record('mobile reorder');
  await page.locator('[data-play-toggle]').click();await page.waitForTimeout(350);await record('mobile animation playing');await page.locator('[data-play-toggle]').click();
  await page.getByRole('button',{name:'Frame 2',exact:true}).click();await page.getByRole('button',{name:'Delete frame',exact:true}).click();
  await page.locator('[data-name-field]').fill('Mobile Audit');
  const response=page.waitForResponse(r=>r.url().endsWith('/api/pixel-creations')&&r.request().method()==='POST');await page.locator('[data-save-creation]').click();records.push({name:'mobile save',status:(await response).status()});
  await page.locator('[data-equip-creation]').click();
  await page.getByRole('button',{name:'← Studio',exact:true}).click();await page.waitForTimeout(250);const saveAll=page.getByRole('button',{name:'Save All Changes',exact:true});if(await saveAll.count())await saveAll.click();
  await page.getByRole('button',{name:'Customize Companion',exact:true}).click();await page.getByRole('tab',{name:'Pixel size',exact:true}).click();
  for(const preset of ['chunky','balanced','detailed','finest']){await page.locator('[data-density-option="'+preset+'"]').click();await page.waitForTimeout(80);records.push({name:'mobile density '+preset,...await page.evaluate(()=>{const el=document.querySelector('[data-companion]'),c=el.querySelector('canvas'),r=c.getBoundingClientRect();return{density:el.dataset.density,css:[r.width,r.height],backing:[c.width,c.height],dpr:devicePixelRatio};})});}
  if(await page.locator('[data-customizer-save]').isEnabled())await page.locator('[data-customizer-save]').click();
  await page.evaluate(r=>window.__mobileAudit=r,records);
  return records;
}
