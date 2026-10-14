async (page) => {
  const rows=[];
  const read=()=>page.evaluate(()=>{
    const c=document.querySelector('[data-editor-canvas]'), e=c?.getContext('2d').getImageData(0,0,c.width,c.height).data;
    const h=window.__pixelDashboard?.handle,d=h?.display,b=d?.framebuffer.data;
    const digest=(bytes)=>{let hash=2166136261,lit=0; if(bytes)for(let i=0;i<bytes.length;i++){hash=Math.imul(hash^bytes[i],16777619)>>>0;if(i%4===3&&bytes[i])lit++;}return {hash,lit};};
    return {editor:digest(e),preview:digest(b),baseId:h?.runtime?.content?.composition?.base.id,previewFrames:h?.runtime?.content?.composition?.base?.animation?.frameDurationsMs.length,documentFrames:document.querySelectorAll('[data-frame]').length};
  });
  const record=async(name)=>{await page.waitForTimeout(90);rows.push({name,...await read()});};
  await record('opened saved three-frame animation');
  await page.getByRole('button',{name:'Frame 3',exact:true}).click();await page.getByRole('button',{name:'Delete frame',exact:true}).click();
  await page.getByRole('button',{name:'Frame 2',exact:true}).click();await page.getByRole('button',{name:'Delete frame',exact:true}).click();
  await record('deleted two frames but preview keeps old three');
  if(await page.locator('[data-mirror]').getAttribute('aria-pressed')==='true')await page.locator('[data-mirror]').click();
  await page.getByRole('button',{name:'Draw',exact:true}).click();
  const canvas=page.locator('[data-editor-canvas]');
  const tap=async(x,y)=>{await canvas.scrollIntoViewIfNeeded();const b=await canvas.boundingBox();await page.mouse.click(b.x+(x+.5)*b.width/48,b.y+(y+.5)*b.height/48);};
  for(let x=8;x<28;x++){await page.locator('[data-swatch="'+(x%2===0?5:8)+'"]').click();await tap(x,18);}
  await record('edited same name; preview still old');
  await page.locator('[data-name-field]').fill('Audit Pattern');await record('rename forces preview to accept latest drawing');
  await page.locator('[data-swatch="7"]').click();await tap(32,32);await record('new same-name dot editor changes preview does not');
  await page.locator('[data-name-field]').fill('Audit Pattern X');await record('another rename refreshes preview');
  await page.locator('[data-name-field]').fill('Audit Pattern');
  const responsePromise=page.waitForResponse(r=>r.url().endsWith('/api/pixel-creations')&&r.request().method()==='POST');await page.locator('[data-save-creation]').click();const response=await responsePromise;const payload=await response.json();
  rows.push({name:'static drawing saved',status:response.status(),slug:payload.creation?.slug,sourceLit:payload.creation?.data.frames[0].rows.join('').replace(/\./g,'').length});
  await page.locator('[data-equip-creation]').click();
  await page.getByRole('button',{name:'← Studio',exact:true}).click();
  await page.getByRole('button',{name:'Save All Changes',exact:true}).click();
  await page.getByRole('button',{name:'Customize Companion',exact:true}).click();
  await page.getByRole('tab',{name:'Pixel size',exact:true}).click();
  await page.evaluate(r=>window.__previewAudit=r,rows);
  return rows;
}
