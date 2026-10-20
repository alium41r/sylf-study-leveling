"use client";
import React,{useEffect,useState} from 'react';
import {BlockNoteEditor} from '@blocknote/core';
import {withCollaboration,blocksToYDoc} from '@blocknote/core/yjs';
import {BlockNoteViewRaw} from '@blocknote/react';
import * as Y from 'yjs';
import {getStroke} from 'perfect-freehand';
import * as pdfjs from 'pdfjs-dist';
import {database,persist,sha} from './contract-probe.mjs';
import {getAccentTokens,getBackgroundTokens,getContrastRatio} from './sylf-color';
import '@blocknote/core/style.css';
import '@blocknote/react/style.css';
import './lab.css';
pdfjs.GlobalWorkerOptions.workerSrc='/pdf.worker.mjs';

export default function Lab(){
 const [state,setState]=useState(null),[error,setError]=useState(''),[status,setStatus]=useState('Loading experiment'),[mode,setMode]=useState('light');
 useEffect(()=>{let cancelled=false;
  (async()=>{
   const db=database('sylf-notes-p1-real-browser'),a=new Y.Doc();
   const entries=await db.journal.toArray();
   if(entries.length)entries.forEach(e=>Y.applyUpdate(a,e.bytes));
   else{
    const seedEditor=BlockNoteEditor.create();
    const seed=blocksToYDoc(seedEditor,[{id:'p1-seed',type:'paragraph',content:'Qualification text'}],'body');
    const bytes=Y.encodeStateAsUpdate(seed);Y.applyUpdate(a,bytes);
    await persist(db,{id:await sha(bytes),owner:1,library:'synthetic',doc:'flow',session:{owner:1,library:'synthetic',epoch:1},bytes});
    seed.destroy();
   }
   const b=new Y.Doc();Y.applyUpdate(b,Y.encodeStateAsUpdate(a));
   const create=doc=>BlockNoteEditor.create(withCollaboration({collaboration:{fragment:doc.getXmlFragment('body'),user:{name:'Qualification',color:'#7c3aed'}}}));
   const editor=create(a),peer=create(b);let queue=Promise.resolve();const timings=[];
   const save=bytes=>{const started=performance.now();setStatus('Saving experiment');queue=queue.then(async()=>{
    await persist(db,{id:await sha(bytes),owner:1,library:'synthetic',doc:'flow',session:{owner:1,library:'synthetic',epoch:1},bytes});
    timings.push(performance.now()-started);setStatus('Saved locally (experiment)');
   }).catch(e=>{setError(e.message);throw e;});};
   a.on('update',save);
   window.probe={
    editor,peer,a,b,db,timings,bootMs:performance.now(),flush:()=>queue,
    renderedTheme:()=>{const hex=css=>"#"+(css.match(/[0-9]+/g)||[]).slice(0,3).map(n=>Number(n).toString(16).padStart(2,"0")).join("");const body=getComputedStyle(document.body),editorStyle=getComputedStyle(document.querySelector(".bn-editor"));return{bodyContrast:getContrastRatio(hex(body.backgroundColor),hex(body.color)),editorContrast:getContrastRatio(hex(editorStyle.backgroundColor),hex(editorStyle.color)),bodyBackground:body.backgroundColor,editorBackground:editorStyle.backgroundColor};},
    merge:()=>{const ua=Y.encodeStateAsUpdate(a),ub=Y.encodeStateAsUpdate(b);Y.applyUpdate(a,ub);Y.applyUpdate(b,ua);},
    snapshot:()=>({a:editor.document,b:peer.document,saveSamples:[...timings]}),
    append:(text,side='a')=>{const e=side==='a'?editor:peer; e.insertBlocks([{type:'paragraph',content:text}],e.document.at(-1),'after');},
    theme:(background,accent,selected='dark')=>{const bg=getBackgroundTokens(background,selected),ac=getAccentTokens(accent,bg['--surface-1']);
      for(const [k,v] of Object.entries({...bg,...ac}))document.documentElement.style.setProperty(k,v);
      document.documentElement.dataset.surfacePolarity=bg['--surface-polarity'];setMode(bg['--surface-polarity']);
      return {surface:bg['--surface-1'],text:bg['--text-primary'],contrast:getContrastRatio(bg['--surface-1'],bg['--text-primary'])};},
    async storageProbe(){
     const result={indexedDB:typeof indexedDB!=='undefined',estimate:await navigator.storage.estimate(),opfs:!!navigator.storage.getDirectory,persisted:await navigator.storage.persisted(),locks:!!navigator.locks,coalesced:typeof PointerEvent.prototype.getCoalescedEvents==='function'};
     if(result.opfs){const root=await navigator.storage.getDirectory(),file=await root.getFileHandle('phase1-probe',{create:true}),w=await file.createWritable();await w.write('probe');await w.close();result.opfsRead=(await (await file.getFile()).text())==='probe';await root.removeEntry('phase1-probe');}return result;
    },
    inkBenchmark(){
     const started=performance.now(),samples=[];
     for(let j=0;j<100;j++){const points=Array.from({length:256},(_,i)=>[i,Math.sin(i/12)*20,.25+(i%10)/20]);const s=performance.now();getStroke(points,{simulatePressure:false});samples.push(performance.now()-s);}
     const canvas=document.querySelector('#ink');const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);
     const outline=getStroke(Array.from({length:120},(_,i)=>[20+i*3,70+Math.sin(i/10)*30,.5]),{size:5,simulatePressure:false});
     ctx.beginPath();outline.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fillStyle='#182238';ctx.fill();
     return {samples,total:performance.now()-started,pointsPerStroke:256,iterations:100};
    },
    async pdfProbe(){const task=pdfjs.getDocument({url:'/fixture.pdf'}),doc=await task.promise,page=await doc.getPage(1),viewport=page.getViewport({scale:1}),canvas=document.querySelector('#pdf');
     canvas.width=viewport.width;canvas.height=viewport.height;await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
     const result={pages:doc.numPages,width:viewport.width,height:viewport.height,text:(await page.getTextContent()).items.map(i=>i.str).join(' '),workerVersion:pdfjs.version};
     await task.destroy();return result;},
    async catalogProbe(){const times=[];await db.meta.bulkPut(Array.from({length:10000},(_,i)=>({key:'catalog-'+String(i).padStart(5,'0'),title:'Document '+i})));
     for(let i=0;i<50;i++){const start=performance.now();await db.meta.orderBy('key').offset(i*10).limit(30).toArray();times.push(performance.now()-start);}return{count:10000,pageSize:30,samples:times};}
   };
   window.probe.theme('#ffffff','#7c3aed','light');setStatus('Saved locally (experiment)');
   if(!cancelled)setState({editor,peer});
  })().catch(e=>setError(e.stack||e.message));return()=>{cancelled=true;};
 },[]);
 return <main><header><h1>Notes technical qualification</h1><p>Synthetic local data · No cloud connection · Experimental fixture</p><p role="status">{status}</p></header>
 {error&&<pre role="alert">{error}</pre>}
 {state&&<><div className="toolbar"><button onClick={()=>window.probe.append('Local addition')}>Append test text</button><button onClick={()=>window.probe.merge()}>Merge disconnected peers</button></div>
 <div className="editors"><section aria-label="Local editor"><h2>Local editor</h2><BlockNoteViewRaw editor={state.editor} theme={mode} formattingToolbar={false} slashMenu={false} sideMenu={false} linkToolbar={false} filePanel={false} tableHandles={false}/></section><section aria-label="Disconnected peer"><h2>Disconnected peer</h2><BlockNoteViewRaw editor={state.peer} theme={mode} formattingToolbar={false} slashMenu={false} sideMenu={false} linkToolbar={false} filePanel={false} tableHandles={false}/></section></div></>}
 <section><h2>Ink geometry probe</h2><canvas id="ink" width="420" height="140"/></section><section><h2>PDF worker probe</h2><canvas id="pdf"/></section></main>;
}

