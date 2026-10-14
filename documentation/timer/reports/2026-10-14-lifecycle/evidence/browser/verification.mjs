import { chromium } from '/Users/aliumair/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const evidence='/Users/aliumair/Desktop/sylf/documentation/timer/reports/2026-10-14-lifecycle/evidence/browser';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const results=[];
try {
 for(const variant of [{name:'desktop-dark',width:1440,height:960,mode:'dark',accent:'#8b5cf6',background:'#090d16'},{name:'mobile-light',width:390,height:844,mode:'light',accent:'#006b5e',background:'#f5f2e8'},{name:'desktop-custom',width:1280,height:900,mode:'dark',accent:'#f97316',background:'#ecf4df'},{name:'desktop-light',width:1440,height:960,mode:'light',accent:'#006b5e',background:'#f5f2e8'},{name:'mobile-dark-offline',width:390,height:844,mode:'dark',accent:'#8b5cf6',background:'#090d16',fullOffline:true}]) {
  const context=await browser.newContext({viewport:{width:variant.width,height:variant.height}});
  const page=await context.newPage();let offline=true;let accepted=null;const errors=[];const requests=[];
  page.on('pageerror',error=>errors.push(error.stack));
  await context.route('**/api/**',async route=>{
    const url=new URL(route.request().url());const method=route.request().method();let data=[];
    if(url.pathname==='/api/sessions') {
      requests.push({method,body:route.request().postDataJSON()});
      if(offline) return route.abort('internetdisconnected');
      if(method==='POST') {
        const startedAt=route.request().postDataJSON().startedAt;
        accepted={id:101,durationSeconds:0,breakSeconds:0,startedAt,endedAt:null,execution:{schemaVersion:2,sessionId:101,ownerId:7,questId:null,state:'RUNNING',executionVersion:1,acceptedFocusSeconds:0,acceptedBreakSeconds:0,startedAt,endedAt:null,actualCivilDate:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Karachi'}).format(new Date(startedAt)),timezone:'Asia/Karachi'}};
      }
      if(method==='PATCH') {
        const body=route.request().postDataJSON().executionTransition;
        const state=body.action==='END'?'ENDED':body.action==='PAUSE'?'PAUSED':body.action==='RESUME'?'RUNNING':accepted.execution.state;
        const endedAt=state==='ENDED'?body.occurredAt:null;
        accepted={...accepted,durationSeconds:body.cumulativeFocusSeconds,breakSeconds:body.cumulativeBreakSeconds,endedAt,execution:{...accepted.execution,state,endedAt,executionVersion:accepted.execution.executionVersion+3,acceptedFocusSeconds:body.cumulativeFocusSeconds,acceptedBreakSeconds:body.cumulativeBreakSeconds}};
      }
      data=accepted;
    } else if(url.pathname==='/api/user/stats') data={id:7,email:'timer-test@local.invalid',username:'timer_test',name:'Timer Test',hunterRank:'E',level:1,currentXP:0,xpToNextLevel:182,hp:100,maxHp:100,streakDays:0,totalStudyMinutes:0,totalStudySeconds:accepted?.durationSeconds??0,todayStudySeconds:accepted?.durationSeconds??0,completedTodaySeconds:accepted?.durationSeconds??0,sylph:0,hasCompletedOnboarding:true,timezone:'Asia/Karachi',createdAt:'2026-08-01T00:00:00.000Z',activeTheme:variant.accent,activeBackground:variant.background};
    else if(url.pathname==='/api/focus-backgrounds') data={categories:[]};
    else if(url.pathname==='/api/focus-backgrounds/preference') data={source:'classic',categorySlug:'classic-sylf',backgroundId:null,preferenceVersion:0};
    else if(url.pathname==='/api/focus-party') data={activeParty:null,pendingInvites:[]};
    else if(/subjects|quests|acoustics|audio|messages|notifications|cosmetics/.test(url.pathname)) data=[];
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  await context.addInitScript(({variant})=>{
    localStorage.setItem('app_mode',variant.mode);localStorage.setItem('app_theme',variant.accent);localStorage.setItem('app_background',variant.background);
    localStorage.setItem('study_mode_config',JSON.stringify({modes:[{id:'freeflow',name:'Free Flow',isActive:true,settings:[]}]}));
    if(!localStorage.getItem('timer-test-initialized')) {
      const now=Date.now();localStorage.setItem('runningTimerState_general_none_7',JSON.stringify({v:2,cacheVersion:3,ownerId:7,startedAt:new Date(now-43000).toISOString(),focusMs:40000,breakMs:0,runningSinceMs:now-3000,isPaused:false,phase:'focus',remainingMs:null,timestamp:now}));
      localStorage.setItem('timer-test-initialized','1');
    }
  },{variant});
  await page.goto('http://127.0.0.1:4196/#/focus');
  await page.waitForTimeout(1500);
  await page.screenshot({path:`${evidence}/${variant.name}-initial.png`});
  await page.getByRole('button',{name:/End Session/i}).waitFor({timeout:5000});
  await page.screenshot({path:`${evidence}/${variant.name}-focus.png`});
  const before=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,mode:document.documentElement.getAttribute('data-mode')}));
  if(variant.name==='mobile-light') {
    await page.evaluate(()=>{window.__timerSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.includes('sylf_timer_journal_v1:')&&key.endsWith('op:END'))throw new DOMException('storage full','QuotaExceededError');return window.__timerSetItem.call(this,key,value);};});
    await page.getByRole('button',{name:/End Session/i}).click();
    await page.getByRole('alert').waitFor({timeout:2000});
    if(!await page.getByText(/Couldn't save the ended session/).count()) throw Error('Local storage error was not visible');
    await page.screenshot({path:`${evidence}/${variant.name}-storage-error.png`});
    await page.evaluate(()=>{Storage.prototype.setItem=window.__timerSetItem;});
  }
  await page.evaluate(()=>{
    document.querySelectorAll('button').forEach(button=>{if(/End Session/i.test(button.textContent)) button.addEventListener('click',()=>{window.__timerEndAt=performance.now();},{once:true,capture:true});});
    const observer=new MutationObserver(()=>{if(window.__timerEndAt&&!document.querySelector('[data-focus-workspace="true"]')) {window.__timerEndMs=performance.now()-window.__timerEndAt;observer.disconnect();}});observer.observe(document.body,{childList:true,subtree:true});
  });
  if(variant.fullOffline) await context.setOffline(true);
  const began=Date.now();await page.getByRole('button',{name:/End Session/i}).click();
  if(variant.fullOffline) {await page.getByRole('heading',{name:'Session ended',exact:true}).waitFor({timeout:2000});await page.screenshot({path:`${evidence}/${variant.name}-closed.png`});} else await page.waitForURL('**/#/timer',{timeout:2000});
  const automationMs=Date.now()-began;
  if(variant.fullOffline) {await context.setOffline(false);await page.waitForURL('**/#/timer',{timeout:5000});}
  await page.getByRole('heading',{name:'Timer',exact:true}).waitFor({timeout:5000});
  const endMs=await page.evaluate(()=>window.__timerEndMs);
  await page.screenshot({path:`${evidence}/${variant.name}-ended.png`});
  const pending=await page.evaluate(()=>Object.keys(localStorage).filter(key=>key.includes('sylf_timer_journal_v1:7:')&&key.endsWith('op:END')).length);
  await page.reload();await page.getByRole('heading',{name:'Timer',exact:true}).waitFor({timeout:10000});
  const restored=await page.evaluate(()=>Object.keys(localStorage).filter(key=>key.includes('sylf_timer_journal_v1:7:')&&key.endsWith('op:END')).length);
  offline=false;await page.evaluate(()=>window.dispatchEvent(new Event('online')));
  await page.waitForFunction(()=>Object.keys(localStorage).filter(key=>key.includes('sylf_timer_journal_v1:7:')&&key.endsWith('op:END')).length===0,null,{timeout:10000});
  if(!Number.isFinite(endMs)||endMs>500||pending!==1||restored!==1||!accepted?.endedAt||errors.length||before.overflow) throw Error(`Invalid recovery result for ${variant.name}: ${JSON.stringify({endMs,pending,restored,accepted,errors,before})}`);
  results.push({name:variant.name,endMs,automationMs,pending,restored,accepted,storageRecovery:variant.name==='mobile-light',fullOffline:!!variant.fullOffline,overflow:before.overflow,mode:before.mode,errors,requests:requests.length});
  await context.close();
 }
} finally {await browser.close();fs.writeFileSync(`${evidence}/results.json`,JSON.stringify(results,null,2)+'\n');}
console.log(JSON.stringify(results,null,2));
