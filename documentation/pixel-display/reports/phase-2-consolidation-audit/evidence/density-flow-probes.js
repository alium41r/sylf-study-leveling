async (page) => {
  const records=[];
  const read=()=>page.evaluate(()=>{
    const h=window.__pixelDashboard?.handle,d=h?.display,b=d?.framebuffer.data,el=document.querySelector('[data-companion]'),c=el?.querySelector('canvas');
    let hash=2166136261,lit=0,minX=999,minY=999,maxX=-1,maxY=-1;const colors={};
    if(b)for(let i=0;i<b.length;i++){hash=Math.imul(hash^b[i],16777619)>>>0;if(i%4===3&&b[i]){lit++;const n=(i-3)/4,x=n%d.width,y=Math.floor(n/d.width);minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);const key=Array.from(b.slice(i-3,i)).join(',');colors[key]=(colors[key]??0)+1;}}
    return {baseId:h?.runtime?.content?.composition?.base.id,resolution:d?.width,css:el?.getBoundingClientRect().width,backing:c&&[c.width,c.height],dpr:devicePixelRatio,hash,lit,extent:[minX,minY,maxX,maxY],colors};
  });
  for(const preset of ['chunky','balanced','detailed','finest']){
    if(!await page.getByRole('tab',{name:'Pixel size',exact:true}).isVisible())throw Error('Not in customizer');
    await page.locator('[data-density-option="'+preset+'"]').click();
    await page.waitForFunction(()=>window.__pixelDashboard?.handle?.runtime?.content?.composition?.base.id==='user:audit-pattern');
    await page.waitForTimeout(100);
    records.push({surface:'customizer',preset,...await read()});
    await page.screenshot({path:'documentation/pixel-display/reports/phase-2-consolidation-audit/evidence/desktop-pattern-'+preset+'.png',fullPage:true});
    const save=page.locator('[data-customizer-save]');
    if(await save.isEnabled()){
      const response=page.waitForResponse(r=>r.url().endsWith('/api/profile/customization')&&r.request().method()==='PATCH');await save.click();records.push({surface:'save density',preset,status:(await response).status()});
    }
    await page.getByRole('link',{name:'Home',exact:true}).click();
    await page.waitForFunction(()=>window.__pixelDashboard?.handle?.runtime?.content?.composition?.base.id==='user:audit-pattern');
    await page.waitForTimeout(100);records.push({surface:'dashboard',preset,...await read()});
    await page.getByRole('link',{name:'Customize',exact:true}).click();await page.getByRole('button',{name:'Customize Companion',exact:true}).click();await page.getByRole('tab',{name:'Pixel size',exact:true}).click();
  }
  await page.evaluate(r=>window.__densityAudit=r,records);
  return records;
}
