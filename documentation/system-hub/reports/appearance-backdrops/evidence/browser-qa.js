// Isolated browser QA fixtures; never imported by the product.
// All API requests are intercepted, including writes. Run with Playwright MCP.
(async (sourcePage) => {
 if(sourcePage.__phase2)await sourcePage.__phase2.context.close();
 const base='http://127.0.0.1:3000', out='/Users/aliumair/Desktop/sylf/documentation/system-hub/reports/appearance-backdrops/evidence';
 const cookies=(await sourcePage.context().cookies(base)).filter(c=>c.name==='hunter_token');
 const context=await sourcePage.context().browser().newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 await context.addCookies(cookies);
 await context.addInitScript(()=>{if(!localStorage.getItem('appearance_qa')){localStorage.setItem('app_mode','dark');localStorage.setItem('app_theme','#6bc9aa');localStorage.setItem('app_background','#111715');localStorage.setItem('appearance_qa','1');}});
 const image='https://gjkwkdqdoekzllmnsejo.supabase.co/storage/v1/object/public/focus-backgrounds/landscapes/bg_1789023716312_877081ed7695fd71.jpg';
 const user={id:424242,name:'Alex Morgan',username:'alexm',email:'preview@example.invalid',hunterRank:'C',level:24,currentXP:1380,xpToNextLevel:2400,hp:90,maxHp:100,streakDays:6,totalStudyMinutes:7312,totalStudySeconds:438750,sylph:720,hasCompletedOnboarding:true,timezone:'Asia/Karachi',createdAt:'2026-04-01T00:00:00Z'};
 const bg={id:7,categoryId:2,name:'Forest light',storagePath:'forest.jpg',width:1920,height:1080,aspectRatio:16/9,focalX:.65,focalY:.4,timerPosition:'left',sortOrder:0,isActive:true,publicUrl:image};
 const catalog={categories:[{id:2,slug:'landscapes',name:'Landscapes',layoutKey:'landscape',sortOrder:0,isActive:true,backgrounds:[bg]},{id:3,slug:'quiet',name:'Quiet spaces',layoutKey:'fantasy',sortOrder:1,isActive:true,backgrounds:[{...bg,id:8,categoryId:3,name:'Evening retreat',timerPosition:'right'}]}]};
 const state={library:[{id:7,userId:424242,name:'My quiet place',width:1920,height:1080,aspectRatio:16/9,focalX:.5,focalY:.5,timerPosition:'auto',layoutKey:'landscape',fileSize:2048,mimeType:'image/jpeg',createdAt:'2026-10-17T00:00:00Z',signedUrl:image}],preference:{initialized:true,isClassic:true,source:'classic',categorySlug:'classic-sylf',backgroundId:null,version:1},quotaMax:5,libraryError:false,saveError:false,delay:0,posts:[],results:[],errors:[]};
 await context.route('**/api/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname,method=req.method();let data=[],status=200;
  if(method!=='GET'&&method!=='HEAD'){
   let body;try{body=req.postDataJSON();}catch{body='multipart';}state.posts.push({path,method,body});
   if(path==='/api/cosmetics'){status=state.saveError?503:200;data=state.saveError?{error:'Unavailable'}:{success:true};}
   else if(path==='/api/focus-backgrounds/preference'){state.preference={...state.preference,...body,version:state.preference.version+1};data={...state.preference,isClassic:state.preference.source==='classic',categorySlug:state.preference.source==='classic'?'classic-sylf':'landscapes',customBackground:state.preference.source==='custom'?state.library.find(x=>x.id===state.preference.backgroundId):null};}
   else if(path==='/api/user/focus-backgrounds/7'&&method==='PATCH'){state.library=state.library.map(x=>x.id===7?{...x,...body}:x);data={background:state.library[0]};}
   else if(path==='/api/user/focus-backgrounds/7'&&method==='DELETE'){state.library=state.library.filter(x=>x.id!==7);data={success:true};}
   else if(path==='/api/user/focus-backgrounds'&&method==='POST'){const added={...state.library[0],id:9,name:'Uploaded backdrop',signedUrl:image,width:1920,height:1080,focalX:.5,focalY:.5,timerPosition:'center',layoutKey:'classic'};state.library.push(added);data={background:added};}
   else data={success:true};
  }else if(path==='/api/user/stats')data=user;
  else if(path==='/api/focus-backgrounds'){if(state.delay)await new Promise(r=>setTimeout(r,state.delay));data=catalog;}
  else if(path==='/api/focus-backgrounds/preference')data={...state.preference,isClassic:state.preference.source==='classic',categorySlug:state.preference.source==='classic'?'classic-sylf':'landscapes',customBackground:state.preference.source==='custom'?state.library.find(x=>x.id===state.preference.backgroundId):null};
  else if(path==='/api/user/focus-backgrounds'){status=state.libraryError?503:200;data=state.libraryError?{error:'Unavailable'}:{backgrounds:state.library,quota:{used:state.library.length,max:state.quotaMax}};}
  else if(path.includes('notifications'))data={notifications:[],unreadCount:0};
  else if(path.includes('invites'))data=[];
  else if(path.includes('focus-part'))data={parties:[],invites:[]};
  else if(path==='/api/subjects')data={subjects:[]};
  await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
 });
 const p=await context.newPage();p.on('pageerror',e=>state.errors.push(e.message));
 const check=(name,pass,detail={})=>{state.results.push({name,pass,...detail});if(!pass)throw new Error(name);};
 const navigate=async route=>{await p.goto(`${base}/settings/${route}`);await p.getByRole('heading',{name:route==='appearance'?'Appearance':'Backdrops',level:1,exact:true}).waitFor();await p.getByRole('region',{name:route==='appearance'?'Appearance preview':'Backdrop preview'}).waitFor();await p.evaluate(()=>document.querySelector('nextjs-portal')?.style.setProperty('display','none'));};
 const capture=async name=>{await p.evaluate(async()=>{await Promise.all([...document.images].filter(i=>i.loading!=='lazy').map(i=>i.complete?Promise.resolve():new Promise(r=>{i.addEventListener('load',r,{once:true});i.addEventListener('error',r,{once:true});setTimeout(r,8000)})))});await p.waitForTimeout(600);await p.screenshot({path:`${out}/${name}.png`,fullPage:true});const measurement=await p.evaluate(()=>({overflow:document.documentElement.scrollWidth-innerWidth}));check(name,measurement.overflow<=0,measurement);};
 sourcePage.__phase2={p,context,state,check,navigate,capture,out};
 await navigate('appearance');await capture('appearance-desktop-dark');
 await navigate('focus-backgrounds');await p.getByRole('button',{name:'Preview Forest light'}).click();await p.getByRole('img',{name:'Forest light'}).evaluate(async i=>{if(!i.complete)await new Promise(r=>{i.onload=r;i.onerror=r});});await capture('backdrops-desktop-dark');

 await p.evaluate(()=>{localStorage.setItem('app_mode','dark');localStorage.setItem('app_theme','#6bc9aa');localStorage.setItem('app_background','#111715');});
 for(const [label,width,height] of [['tablet',1024,1000],['mobile',390,844],['small-mobile',320,740]]) {
 await p.setViewportSize({width,height});await navigate('appearance');await capture('appearance-'+label+'-dark');
 await navigate('focus-backgrounds');await p.getByRole('button',{name:'Preview Forest light'}).click();await p.getByTestId('solo-timer-dock-landscape').waitFor();await capture('backdrops-'+label+'-dark');}
 await p.setViewportSize({width:1440,height:1000});
 for(const [label,mode,background,accent] of [['light','light','#f8fafc','#6b57c2'],['custom-dark-in-light','light','#123d3c','#ffcf5c'],['custom-light-in-dark','dark','#e6eadf','#2c6658']]) {
 await p.evaluate(({mode,background,accent})=>{localStorage.setItem('app_mode',mode);localStorage.setItem('app_background',background);localStorage.setItem('app_theme',accent);},{mode,background,accent});
 await navigate('appearance');await capture('appearance-'+label);await navigate('focus-backgrounds');await p.getByRole('button',{name:'Preview Forest light'}).click();await p.getByTestId('solo-timer-dock-landscape').waitFor();await capture('backdrops-'+label);}
 await p.getByRole('button',{name:/Your library/}).click();await p.getByRole('button',{name:'Preview My quiet place'}).click();await p.getByRole('button',{name:'Edit',exact:true}).click();
 for(const [label,width,height] of [['desktop',1440,1000],['mobile',390,844],['small-mobile',320,740]]) {await p.setViewportSize({width,height});await p.getByRole('dialog').waitFor();await p.screenshot({path:out+'/backdrops-'+label+'-edit.png',fullPage:false});check(label+' edit dialog fits',await p.getByRole('dialog').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&el.scrollWidth<=el.clientWidth;}));}
 const dialog=p.getByRole('dialog');await dialog.getByRole('button',{name:/Artwork focal point/}).focus();await p.keyboard.press('Shift+ArrowRight');await dialog.getByRole('button',{name:'Right',exact:true}).click();await dialog.getByRole('button',{name:'Save changes'}).click();await dialog.waitFor({state:'hidden'});check('Edit writes original metadata contract',state.posts.some(x=>x.method==='PATCH'&&x.path==='/api/user/focus-backgrounds/7'&&x.body.focalX===.6&&x.body.timerPosition==='right'));
 await p.getByRole('button',{name:'Edit',exact:true}).click();await p.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});check('Escape restores keyboard focus',await p.getByRole('button',{name:'Edit',exact:true}).evaluate(e=>e===document.activeElement));
 await p.getByRole('button',{name:'Add backdrop',exact:true}).click();await p.keyboard.press('Tab');for(let i=0;i<12;i++)await p.keyboard.press('Tab');check('Native dialog traps focus',await p.getByRole('dialog').evaluate(el=>el.contains(document.activeElement)));await p.keyboard.press('Escape');
 check('No page exceptions',state.errors.length===0,{errors:state.errors});const result={results:state.results,fixtureOnly:true,apiWritesSentToServer:0};await context.close();return result;

});
