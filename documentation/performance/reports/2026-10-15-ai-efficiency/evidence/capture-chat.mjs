// Isolated Chrome, actual ConversationPanel, synthetic data only. No AI calls.
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const captures=[['chat-desktop-dark',1440,1000,'mode=dark&filled'],['chat-desktop-light',1440,1000,'mode=light'],['chat-desktop-custom',1440,1000,'mode=dark&custom&filled'],['chat-mobile-dark',390,844,'mode=dark&filled'],['chat-mobile-light',390,844,'mode=light'],['chat-mobile-custom',390,844,'mode=light&custom&filled']];
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)), checks=[];
for(const [name,width,height,query] of captures){
 const profile=`/tmp/sylf-ai-${name}-${Date.now()}`;await mkdir(profile,{recursive:true});
 const child=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-sandbox','--disable-gpu','--disable-background-networking','--disable-component-update','--no-first-run','--no-default-browser-check',`--user-data-dir=${profile}`,'--remote-debugging-port=0','about:blank'],{stdio:'ignore'});let socket;
 try{
  let port;for(let i=0;i<100;i++){try{port=(await readFile(`${profile}/DevToolsActivePort`,'utf8')).split('\n')[0];break;}catch{await pause(100);}}
  if(!port)throw Error('Browser unavailable');
  const targets=await(await fetch(`http://127.0.0.1:${port}/json/list`,{signal:AbortSignal.timeout(8000)})).json();
  socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  let id=0;const pending=new Map();socket.onmessage=event=>{const message=JSON.parse(event.data);if(message.id){pending.get(message.id)?.(message);pending.delete(message.id);}};
  const send=(method,params={})=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('CDP timeout')),8000),key=++id;pending.set(key,message=>{clearTimeout(timer);message.error?reject(Error(message.error.message)):resolve(message.result);});socket.send(JSON.stringify({id:key,method,params}));});
  await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});await send('Page.navigate',{url:`http://127.0.0.1:4310/?${query}`});await pause(3500);
  for(let i=0;i<16;i++){const ready=await send("Runtime.evaluate",{expression:"Boolean(document.querySelector(\"textarea\"))",returnByValue:true});if(ready.result.value)break;await pause(500);}
  const layout=await send('Runtime.evaluate',{expression:'JSON.stringify({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,hasComposer:Boolean(document.querySelector("textarea"))})',returnByValue:true});
  const metrics=JSON.parse(layout.result.value);if(!metrics.hasComposer)throw Error("Chat did not render");const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile(new URL(`./${name}.png`,import.meta.url),Buffer.from(screenshot.data,'base64'));checks.push({name,...metrics,horizontalOverflow:metrics.scrollWidth>width});
 }finally{socket?.close();child.kill('SIGTERM');}
}
await writeFile(new URL('./chat-ui-checks.json',import.meta.url),JSON.stringify({fixture:'Synthetic actual active ConversationPanel; no production API calls',checks},null,2)+'\n');console.log(JSON.stringify(checks));
