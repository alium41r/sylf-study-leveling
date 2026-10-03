// Diagnostic reproductions of CURRENT behavior, not implementation changes.
// jsdom commit counts are structural evidence, NOT browser frame-time benchmarks.
import React, { memo, Profiler, useCallback } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { AcousticsProvider, useAcoustics } from '@/app/components/AcousticsContext';
import { useFocusPartyRealtime } from '@/app/hooks/useFocusPartyRealtime';

const mocks=vi.hoisted(()=>({channels:0,unsubscribes:0}));
vi.mock('@/lib/acoustics/audio-engine',()=>({audioEngine:{playTrack:vi.fn(),getFrequencyData:()=>new Uint8Array(150).fill(80)}}));
vi.mock('@/lib/supabase-browser',()=>({isRealtimeConfigured:()=>true,attachRealtimeAuth:async()=>({channel:()=>{mocks.channels++; const channel={on:()=>channel,subscribe:()=>channel,unsubscribe:()=>{mocks.unsubscribes++;return Promise.resolve('ok');}};return channel;}})}));
const results:unknown[]=[];
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();fs.writeFileSync('documentation/performance/phase-0/artifacts/render-diagnostics.json',JSON.stringify({at:new Date().toISOString(),environment:'React development Profiler in jsdom; synthetic IO, counts only',results},null,2));});

it('measures audio context notifications to a volume-only consumer',async()=>{
 let controls:ReturnType<typeof useAcoustics>|undefined;let consumerRenders=0,unrelatedRenders=0,commits=0;
 const raf=new Map<number,FrameRequestCallback>();let id=0;
 vi.stubGlobal('requestAnimationFrame',(cb:FrameRequestCallback)=>{raf.set(++id,cb);return id;});vi.stubGlobal('cancelAnimationFrame',(key:number)=>raf.delete(key));
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({tracks:[]})})));
 vi.spyOn(HTMLMediaElement.prototype,'play').mockResolvedValue();
 const VolumeOnly=memo(()=>{const ctx=useAcoustics();controls=ctx;consumerRenders++;return <span>{ctx.masterVolume}</span>;});
 const Unrelated=memo(()=>{unrelatedRenders++;return <span>static</span>;});
 render(<Profiler id="audio" onRender={()=>commits++}><AcousticsProvider><VolumeOnly/><Unrelated/></AcousticsProvider></Profiler>);
 await act(flush);
 act(()=>controls!.playTrack({id:1,title:'synthetic',category:'test',frequency:null,audioUrl:'/synthetic.wav',duration:1,defaultVolume:1,description:null,tags:[],isPreset:false,orderIndex:0}));
 const before={consumerRenders,unrelatedRenders,commits};
 for(let i=0;i<60;i++)act(()=>{const callbacks=[...raf.values()];raf.clear();callbacks.forEach(cb=>cb(i*16.67));});
 const sample={case:'60 analyser frames',volumeOnlyRenders:consumerRenders-before.consumerRenders,unrelatedRenders:unrelatedRenders-before.unrelatedRenders,profilerCommits:commits-before.commits};results.push(sample);
 expect(sample.volumeOnlyRenders).toBe(60);expect(sample.unrelatedRenders).toBe(0);
});

it('measures the party subscription dependency mismatch with stable and inline callbacks',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>({ok:true,headers:new Headers({'content-type':'application/json'}),json:async()=>url.endsWith('/session')?{session:null}:{party:{id:77},members:[{userId:7}]}})));
 let commits=0;
 function Harness({stable,tick}:{stable:boolean,tick:number}){const fixed=useCallback(()=>{},[]);const state=useFocusPartyRealtime(77,7,{onEvent:stable?fixed:()=>{}});return <div>{state.party?.party.id}:{tick}</div>;}
 const a=render(<Profiler id="stable" onRender={()=>commits++}><Harness stable tick={0}/></Profiler>);await act(flush);
 const stableAfterLoad=mocks.channels;a.unmount();mocks.channels=0;mocks.unsubscribes=0;
 const b=render(<Profiler id="inline" onRender={()=>commits++}><Harness stable={false} tick={0}/></Profiler>);await act(flush);
 const before=mocks.channels;
 for(let tick=1;tick<=5;tick++){b.rerender(<Profiler id="inline" onRender={()=>commits++}><Harness stable={false} tick={tick}/></Profiler>);await act(flush);}
 const sample={case:'party callback identity',stableCallbackChannelsAfterDataLoad:stableAfterLoad,inlineCallbackChannelsBeforeTicks:before,inlineCallbackAdditionalChannelsForFiveRenders:mocks.channels-before,unsubscribes:mocks.unsubscribes,profilerCommits:commits};results.push(sample);
 expect(stableAfterLoad).toBe(0);expect(sample.inlineCallbackAdditionalChannelsForFiveRenders).toBeGreaterThanOrEqual(5);
});
