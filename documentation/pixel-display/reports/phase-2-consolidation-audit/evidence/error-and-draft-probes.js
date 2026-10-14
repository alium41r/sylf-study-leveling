async (page) => {
  const records=[];
  await page.getByRole('link',{name:'Customize',exact:true}).click();await page.getByRole('button',{name:'Open Pixel Studio',exact:true}).click();
  await page.locator('[data-creation="audit-pattern"]').waitFor();await page.locator('[data-creation="audit-pattern"]').click();
  let posts=0;
  await page.route('**/api/pixel-creations',async route=>{if(route.request().method()==='POST'){posts++;await new Promise(r=>setTimeout(r,900));}await route.continue();});
  const saveResponse=page.waitForResponse(r=>r.url().endsWith('/api/pixel-creations')&&r.request().method()==='POST');
  await page.locator('[data-save-creation]').click();
  records.push({test:'creation pending save',disabled:await page.locator('[data-save-creation]').isDisabled(),text:await page.locator('[data-save-creation]').innerText()});
  await page.locator('[data-save-creation]').click();await saveResponse;await page.waitForTimeout(1200);records.push({test:'duplicate click posts',posts});await page.unroute('**/api/pixel-creations');
  const canvas=page.locator('[data-editor-canvas]');await canvas.scrollIntoViewIfNeeded();const b=await canvas.boundingBox();await page.getByRole('button',{name:'Draw',exact:true}).click();await page.mouse.click(b.x+30.5*b.width/48,b.y+30.5*b.height/48);
  await page.getByRole('button',{name:'← Studio',exact:true}).click();await page.getByRole('button',{name:'Open Pixel Studio',exact:true}).click();
  records.push({test:'leave and reopen unsaved editor',name:await page.locator('[data-name-field]').inputValue(),...await page.evaluate(()=>{const c=document.querySelector('[data-editor-canvas]'),b=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let lit=0;for(let i=3;i<b.length;i+=4)if(b[i])lit++;return{lit};})});
  await page.getByRole('button',{name:'← Studio',exact:true}).click();
  await page.route('**/api/pixel-creations',async route=>{if(route.request().method()==='GET')await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'audit simulated failure'})});else await route.continue();});
  await page.getByRole('button',{name:'Open Pixel Studio',exact:true}).click();await page.waitForTimeout(500);
  records.push({test:'creation listing HTTP 500',libraryMessage:await page.locator('[data-creation-list]').count()?'list':await page.getByText('Nothing saved yet. Draw something and press Save.',{exact:true}).count(),errorCount:await page.locator('[data-studio-error]').count()});
  await page.unroute('**/api/pixel-creations');
  await page.getByRole('button',{name:'← Studio',exact:true}).click();await page.getByRole('button',{name:'Customize Companion',exact:true}).click();await page.getByRole('tab',{name:'Pixel size',exact:true}).click();await page.locator('[data-density-option="chunky"]').click();
  await page.route('**/api/profile/customization',route=>route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'audit simulated failure'})}));
  const patch=page.waitForResponse(r=>r.url().endsWith('/api/profile/customization')&&r.request().method()==='PATCH');await page.locator('[data-customizer-save]').click();await patch;await page.waitForTimeout(100);
  records.push({test:'identity save HTTP 500',body:await page.locator('main').innerText(),errorCount:await page.locator('[role="alert"]').count()});
  await page.unroute('**/api/profile/customization');await page.getByRole('button',{name:'Reset',exact:true}).click();
  await page.evaluate(r=>window.__errorAudit=r,records);
  return records;
}
