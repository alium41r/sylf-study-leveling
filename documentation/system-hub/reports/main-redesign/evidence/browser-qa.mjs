// Browser-only visual fixtures. Never imported by the application.
// Reuse the local preview's existing cookie only for page routing. Intercept all
// API calls in an isolated context; no account or database changes are made.
import { mkdir, writeFile } from "node:fs/promises";
const base = "http://127.0.0.1:3000";
const out = "/Users/aliumair/Desktop/sylf/documentation/system-hub/reports/main-redesign/evidence";
const user = { id: 424242, name: "Alex Morgan", username: "alexm", email: "preview@example.invalid", hunterRank: "C", level: 24, currentXP: 1380, xpToNextLevel: 2400, hp: 90, maxHp: 100, streakDays: 6, totalStudyMinutes: 7312, totalStudySeconds: 438750, sylph: 720, hasCompletedOnboarding: true, timezone: "Asia/Karachi", createdAt: "2026-04-01T00:00:00Z" };
const dailyMinutes = [25,45,0,70,30,55,0,40,90,60,25,0,45,65,50,30,95,0,60,45,25,80,50,35,105,70,0,90,60,45.3];
const subjects = [ {name:"Physics",color:"#42b89b",minutes:540.3,sessions:18}, {name:"Mathematics",color:"#8199e6",minutes:345,sessions:12}, {name:"Computer science",color:"#c9a16b",minutes:280,sessions:9}, {name:"Literature",color:"#b989b5",minutes:125,sessions:5} ];
const detail = { user, todayDate:"2026-10-16", dailyStudy: dailyMinutes.map((minutes,i)=>({date:new Date(Date.UTC(2026,8,17+i)).toISOString().slice(0,10),minutes})), subjectBreakdown:subjects, sessionLog: Array.from({length:18},(_,i)=>({id:i+1,startedAt:new Date(Date.UTC(2026,9,16-Math.floor(i/3),10-i%3*2)).toISOString(),endedAt:new Date(Date.UTC(2026,9,16-Math.floor(i/3),11-i%3*2)).toISOString(),durationMinutes:[45,25,60][i%3],durationSeconds:i===0?2718:[2700,1500,3600][i%3],breakSeconds:i%4?300:0,focusRate:84+i%6,subjectName:subjects[i%4].name,subjectColor:subjects[i%4].color,questTitle:i%3===0?"Review the foundations":null})), questStats:{total:48,completed:36,failed:3,pending:6,inProgress:3,totalXPEarned:4680},goalStats:{total:8,active:3,completed:5},summary:{totalSessions:44,avgSessionMinutes:29,avgSessionSeconds:1760,activeDaysLast30:25,longestSession:105,longestSessionSeconds:6300,accountAgeDays:198,completionRate:75}};
const names = ["Jamie Chen","Noor Ahmed","Sofia Rivera","Alex Morgan","Theo Park","Sam Taylor","Lena Ross","Ari Nakamura","Casey Brooks","Morgan Lee"];
const ranked = names.map((name,i)=>({id:i===3?user.id:i+1,username:name.toLowerCase().replaceAll(' ','_'),name,hunterRank:i<3?"B":"C",level:30-i*2,totalStudyMinutes:9500-i*700,studyHours:Math.round((9500-i*700)/6)/10,streakDays:10-i,questsCompleted:60-i*4,isCurrentUser:i===3,rank:i+1}));
const abilities = [ ["endurance","Endurance","Aegis","Each tier: +5 max HP and −5% HP damage from missed daily goals.",40], ["tenacity","Tenacity","Iron Will","Each tier reduces the weekly milestone requirement by 5%.",35], ["velocity","Velocity","Flow State","Each tier: +2% XP from every focus session.",30], ["discipline","Discipline","Regimen","Each tier: +1 AI chat message per day.",25], ["synthesis","Synthesis","Insight","Each tier: +5% syllabus-node mastery progress.",20] ].map(([key,label,perkName,perkLadder,value])=>({key,label,perkName,perkLadder,value,tier:2,maxTier:6,nextTierAt:50,investable:true,costSp:3,costSylph:180}));
let context, preview, mode="populated", rankingError=false, statsError=false, delay=0, posts=[];
export const results=[];
function check(name,pass,extra={}){results.push({name,pass,...extra});if(!pass)throw new Error(name);}
export async function setup(sourcePage){
  await mkdir(out,{recursive:true});
  const cookies=(await sourcePage.context().cookies(base)).filter(c=>c.name==='hunter_token');
  context=await sourcePage.context().browser().newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  await context.addCookies(cookies);
  await context.addInitScript(()=>{for(const key of Object.keys(localStorage))if(key.startsWith('sylf_cache:'))localStorage.removeItem(key);if(!localStorage.getItem('main_hub_qa_initialized')){localStorage.setItem('app_mode','dark');localStorage.setItem('app_theme','#6bc9aa');localStorage.setItem('app_background','#111715');localStorage.setItem('main_hub_qa_initialized','true');}});
  await context.route('**/api/**',async route=>{
    const req=route.request(),path=new URL(req.url()).pathname;
    let data=[];let status=200;
    if(req.method()!=='GET'&&req.method()!=='HEAD'){
      posts.push({path,body:req.postDataJSON()});
      if(path==='/api/cognitive-stats/invest'){const body=req.postDataJSON(),a=abilities.find(a=>a.key===body.stat);a.value+=5;data={ability:a,amount:5,cost:3};}
      else data={success:true};
    }else if(path==='/api/user/stats')data=user;
    else if(path==='/api/user/detailed-stats'){
      if(delay)await new Promise(r=>setTimeout(r,delay));
      if(statsError){data={error:'Unavailable'};status=503;}
      else data=mode==='empty'?{...detail,dailyStudy:detail.dailyStudy.map(d=>({...d,minutes:0})),subjectBreakdown:[],sessionLog:[],summary:{...detail.summary,totalSessions:0,avgSessionSeconds:0,activeDaysLast30:0,longestSessionSeconds:0},questStats:{total:0,completed:0,failed:0,pending:0,inProgress:0,totalXPEarned:0},goalStats:{total:0,active:0,completed:0}}:detail;
    }else if(path==='/api/user/rankings'){
      if(rankingError){data={error:'Unavailable'};status=503;}
      else {const sorted=[...ranked].sort((a,b)=>{const key={level:'level',studyHours:'studyHours',streak:'streakDays',quests:'questsCompleted'}[new URL(req.url()).searchParams.get('sortBy')]||'level';return b[key]-a[key];}).map((r,i)=>({...r,rank:i+1}));data={global:sorted,friends:mode==='solo'?[{...sorted.find(r=>r.isCurrentUser),friendRank:1}]:sorted.filter(r=>[2,424242,8].includes(r.id)).map((r,i)=>({...r,friendRank:i+1})),currentUserRank:sorted.find(r=>r.isCurrentUser).rank,totalPlayers:128};}
    }else if(path==='/api/cognitive-stats/invest')data={skillPoints:12,sylph:720,cap:100,abilities};
    else if(path==='/api/subjects')data={subjects:[]};
    else if(path.includes('notifications'))data={notifications:[],unreadCount:0};
    else if(path.includes('invites'))data=[];
    else if(path.includes('focus-part'))data={parties:[],invites:[]};
    await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  });
  preview=await context.newPage();
  sourcePage.__sylfPreview = preview;
  return {isolated:true,cookies: cookies.length};
}
async function navigate(route){await preview.goto(`${base}/settings/${route}`);await preview.getByRole('heading',{name:route[0].toUpperCase()+route.slice(1),exact:true}).waitFor(); if(route==='stats')await preview.getByRole('region',{name:'Study overview'}).waitFor();if(route==='rankings')await preview.getByRole('table').waitFor();if(route==='modes')await preview.getByRole('region',{name:/ settings$/}).waitFor();await preview.evaluate(()=>document.querySelector('nextjs-portal')?.style.setProperty('display','none'));}
async function capture(name){await preview.screenshot({path:`${out}/${name}.png`,fullPage:true});const measure=await preview.evaluate(()=>({overflow:document.documentElement.scrollWidth-innerWidth,headingFont:getComputedStyle(document.querySelector('h1')).fontFamily,background:getComputedStyle(document.documentElement).getPropertyValue('--app-canvas')}));check(name,measure.overflow<=0,measure);}
export async function desktop(){for(const route of ['stats','rankings','modes']){await navigate(route);await capture(`${route}-desktop-dark`);}return results;}
export async function responsive(){for(const [name,width,height] of [['tablet',1024,1000],['mobile',390,844],['small-mobile',320,740]]){await preview.setViewportSize({width,height});for(const route of ['stats','rankings','modes']){await navigate(route);await capture(`${route}-${name}-dark`);}}return results;}
export async function appearance(){await preview.setViewportSize({width:1440,height:1000});for(const [name,appMode,canvas,accent] of [['light','light','simple','#6b57c2'],['custom-dark-in-light','light','#123d3c','#ffcf5c'],['custom-light-in-dark','dark','#e6eadf','#2c6658']]){await preview.evaluate(({appMode,canvas,accent})=>{localStorage.setItem('app_mode',appMode);localStorage.setItem('app_background',canvas);localStorage.setItem('app_theme',accent);},{appMode,canvas,accent});for(const route of ['stats','rankings','modes']){await navigate(route);await capture(`${route}-${name}`);}}return results;}
export async function interactions(){
  await preview.goto(base);
  await preview.evaluate(()=>localStorage.removeItem('study_mode_config'));
  await preview.setViewportSize({width:390,height:844});await navigate('modes');
  const choose=async name=>preview.getByRole('region',{name:'Choose a study mode'}).getByRole('button',{name:new RegExp(name)}).click();
  await choose('Sprint Mode');await preview.getByRole('slider',{name:'Sprint Duration'}).focus();await preview.keyboard.press('ArrowRight');await preview.getByRole('switch',{name:'Auto-trigger Next Sprint'}).click();await preview.getByRole('button',{name:'Extreme',exact:true}).click();await preview.getByRole('button',{name:'Use Sprint Mode'}).click();
  let saved=await preview.evaluate(()=>JSON.parse(localStorage.getItem('study_mode_config')));check('Sprint settings and activation persist',saved.modes.find(m=>m.isActive).id==='sprint'&&saved.modes.find(m=>m.id==='sprint').settings.find(s=>s.key==='sprintDuration').value===11);await preview.reload();await preview.getByRole('region',{name:'Sprint Mode settings'}).waitFor();check('Active mode survives reload',await preview.getByRole('button',{name:'Current mode'}).isDisabled());await capture('modes-mobile-sprint');
  await choose('Free Flow');check('Free Flow has no unrelated controls',await preview.getByRole('slider').count()===0);await preview.getByRole('button',{name:'Use Free Flow'}).click();await capture('modes-mobile-freeflow');
  await choose('Flowtime');await preview.getByRole('switch',{name:'Proportional Break Calculation'}).click();await capture('modes-mobile-flowtime');
  await navigate('stats');await preview.getByRole('button',{name:'7 days',exact:true}).click();check('7-day chart updates',await preview.getByLabel('Daily study time').getByRole('button').count()===7);await preview.getByLabel('Daily study time').getByRole('button').first().focus();await preview.getByRole('button',{name:'Show more',exact:true}).click();check('Session history expands',await preview.getByRole('region',{name:'Session history'}).locator('time').count()===16);
  await preview.getByRole('button',{name:/Cognitive attributes/}).click();await preview.getByRole('button',{name:'12 SP'}).click();await preview.getByRole('button',{name:'Invest in Endurance with SP'}).click();await preview.getByText(/Endurance increased to/).waitFor();check('Investment uses existing API payload',posts.some(p=>p.path==='/api/cognitive-stats/invest'&&p.body.currency==='sp'&&p.body.stat==='endurance'));await capture('stats-mobile-attributes');
  await navigate('rankings');await preview.getByRole('combobox',{name:'Rank by'}).selectOption('streak');await preview.getByRole('table').waitFor();check('Weekly units retained',await preview.getByRole('table').getByText('7 weeks',{exact:true}).count()===1);await preview.getByRole('button',{name:'Friends',exact:true}).click();await preview.getByRole('region',{name:'Friends leaderboard'}).waitFor();await capture('rankings-mobile-friends');
  mode='solo';await navigate('rankings');await preview.getByRole('button',{name:'Friends',exact:true}).click();await preview.getByText('Better with a study circle').waitFor();await capture('rankings-solo-friends');mode='populated';
  mode='empty';await navigate('stats');await preview.getByText('No subject focus yet.').waitFor();await capture('stats-mobile-empty');mode='populated';
  statsError=true;await preview.goto(`${base}/settings/stats`);await preview.getByRole('button',{name:'Try again'}).waitFor();await capture('stats-mobile-error');statsError=false;await preview.getByRole('button',{name:'Try again'}).click();await preview.getByRole('region',{name:'Study overview'}).waitFor();check('Stats retries recover',true);
  rankingError=true;await preview.goto(`${base}/settings/rankings`);await preview.getByRole('button',{name:'Try again'}).waitFor();await capture('rankings-mobile-error');rankingError=false;await preview.getByRole('button',{name:'Try again'}).click();await preview.getByRole('table').waitFor();check('Rankings retries recover',true);
  delay=2000;await preview.goto(`${base}/settings/stats`);await preview.getByRole('heading',{name:'Loading your progress…'}).waitFor();await capture('stats-mobile-loading');delay=0;await preview.getByRole('region',{name:'Study overview'}).waitFor();
  await preview.getByRole('navigation',{name:'System Hub Main'}).getByRole('link',{name:'Modes',exact:true}).click();await preview.getByRole('heading',{name:'Modes',exact:true}).waitFor();check('Direct Main navigation works',true);
  await preview.getByRole('button',{name:'Back to System Hub'}).click();await preview.getByRole('heading',{name:'SYSTEM HUB',exact:true}).waitFor();check('Back reopens System Hub',true);
  await writeFile(`${out}/browser-results.json`,JSON.stringify({results,fixtureOnly:true,apiWritesSentToServer:0},null,2));return results;
}
export async function finish(){await writeFile(`${out}/browser-results.json`,JSON.stringify({results,fixtureOnly:true,apiWritesSentToServer:0},null,2));await context.close();return {checks:results.length,passed:results.filter(r=>r.pass).length};}
