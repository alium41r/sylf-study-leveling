// Tests are experiments for design choices; they are not production feature coverage.
import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import {getStroke} from 'perfect-freehand';
import {PDFDocument} from 'pdf-lib';
import {strToU8} from 'fflate';
import {database,persist,sha,idOf,FileTarget,publish,recover,archive,readArchive,deletedConcurrently,treeProjection} from '../src/contract-probe.mjs';

const session={owner:1,library:'lib-a',epoch:1};
const entry=n=>({id:'edit-'+n,owner:1,library:'lib-a',doc:'doc',session,bytes:Y.encodeStateAsUpdate(new Y.Doc())});
const withDB=async fn=>{const db=database('p1-'+crypto.randomUUID());try{await fn(db);}finally{await db.delete();}};
test('journal, outbox and revision commit together, then survive reopen',async()=>withDB(async db=>{
  await persist(db,entry(1));db.close();await db.open();
  assert.equal(await db.journal.count(),1);assert.equal(await db.outbox.count(),1);assert.equal((await db.state.toArray())[0].revision,'edit-1');
}));
test('interruption after journal rolls back every acknowledged-save component',async()=>withDB(async db=>{
  await assert.rejects(persist(db,entry(2),{failAfterJournal:true}));
  assert.equal(await db.journal.count(),0);assert.equal(await db.outbox.count(),0);assert.equal(await db.state.count(),0);
}));
test('owner switch fences old save without discarding its durable pending work',async()=>withDB(async db=>{
  await persist(db,entry(1));
  await assert.rejects(persist(db,entry(2),{current:{...session,owner:2,epoch:2}}),/Stale/);
  assert.equal(await db.journal.count(),1);
  assert.equal(await db.journal.where('[owner+library+doc]').equals([2,'lib-a','doc']).count(),0);
}));
test('quota exception inside storage transaction leaves no false saved revision',async()=>withDB(async db=>{
  const original=db.outbox.put.bind(db.outbox);db.outbox.put=()=>{throw new DOMException('Injected quota','QuotaExceededError');};
  await assert.rejects(persist(db,entry(1)));db.outbox.put=original;assert.equal(await db.state.count(),0);assert.equal(await db.journal.count(),0);
}));
test('100 replicated delivery trials with duplicates and reversed order converge under duplicate/offline Yjs updates',()=>{
 for(let seed=0;seed<100;seed++){
  const base=new Y.Doc();base.getText('body').insert(0,'seed');
  const snapshot=Y.encodeStateAsUpdate(base), a=recover([snapshot]),b=recover([snapshot]);
  a.getText('body').insert(0,'A');b.getText('body').insert(4,'B');
  const ua=Y.encodeStateAsUpdate(a),ub=Y.encodeStateAsUpdate(b);
  const one=recover(seed%2?[snapshot,ua,ub,ua]:[snapshot,ub,ua,ub]);
  const two=recover([snapshot,ub,ua]);assert.equal(one.getText('body').toString(),two.getText('body').toString());
  [base,a,b,one,two].forEach(d=>d.destroy());
 }
});
test('undo tracks local origin and retains remote text',()=>{
 const a=new Y.Doc(),b=new Y.Doc();const origin={local:true},text=a.getText('body');
 const undo=new Y.UndoManager(text,{trackedOrigins:new Set([origin])});
 a.transact(()=>text.insert(0,'mine'),origin);Y.applyUpdate(b,Y.encodeStateAsUpdate(a));
 b.getText('body').insert(4,' remote');Y.applyUpdate(a,Y.encodeStateAsUpdate(b));undo.undo();
 assert.equal(text.toString(),' remote');a.destroy();b.destroy();
});
test('full native checkpoints retain CRDT identity for future offline merge',()=>{
 const a=new Y.Doc();a.getText('body').insert(0,'abc');const b=recover([Y.encodeStateAsUpdate(a)]);
 a.getText('body').insert(1,'A');b.getText('body').insert(2,'B');
 const restored=recover([Y.encodeStateAsUpdate(a),Y.encodeStateAsUpdate(b)]);
 assert.equal(restored.getText('body').toString(),'aAbBc');[a,b,restored].forEach(d=>d.destroy());
});
test('lost upload response reconciles identity and retries without duplicate object',async()=>{
 const target=new FileTarget(),bytes=strToU8('editable payload'),id=await sha(bytes);target.failAfterWrite=true;
 const manifest={version:1,required:[id],parents:[],writer:'a',seq:1};
 const first=await publish(target,manifest,[{id,bytes}],session,()=>session);
 const second=await publish(target,manifest,[{id,bytes}],session,()=>session);
 assert.equal(first.cloudRevision,second.cloudRevision);assert.equal(target.objects.size,2);assert.equal(target.writes,2);
});
test('corrupt object blocks cloud acknowledgement',async()=>{
 const target=new FileTarget(),bytes=strToU8('payload'),id=await sha(bytes);target.corruptRead=true;
 await assert.rejects(publish(target,{required:[id]},[{id,bytes}],session,()=>session),/Checksum/);
 assert.equal(target.objects.size,1);
});
test('missing dependency blocks manifest publication',async()=>{
 const target=new FileTarget();await assert.rejects(publish(target,{required:['missing']},[],session,()=>session));assert.equal(target.objects.size,0);
});
test('account switch during upload cannot acknowledge for another owner',async()=>{
 const target=new FileTarget(),bytes=strToU8('payload'),id=await sha(bytes);let current=session;
 const original=target.put.bind(target);target.put=async(...args)=>{await original(...args);current={...session,epoch:2,owner:2};};
 await assert.rejects(publish(target,{required:[id]},[{id,bytes}],session,()=>current),/Stale/);assert.equal(target.objects.size,1);
});
test('fresh-device recovery discovers both concurrent heads without mutable index',async()=>{
 const target=new FileTarget(),a=new Y.Doc(),b=new Y.Doc();a.getText('body').insert(0,'A');b.getText('body').insert(0,'B');
 for(const [writer,doc] of [['a',a],['b',b]]){const bytes=Y.encodeStateAsUpdate(doc),id=await sha(bytes);await publish(target,{required:[id],writer,seq:1},[{id,bytes}],session,()=>session);}
 const docs=[];for(const id of await target.list()){const bytes=await target.get(id);try{const m=JSON.parse(new TextDecoder().decode(bytes));if(m.required)for(const dep of m.required)docs.push(await target.get(dep));}catch{}}
 const recovered=recover(docs);assert.match(recovered.getText('body').toString(),/A/);assert.match(recovered.getText('body').toString(),/B/);
 [a,b,recovered].forEach(d=>d.destroy());
});
test('portable archive round-trip keeps original binary hashes and refuses future schema',async()=>{
 const bytes=strToU8('original binary'),id=await sha(bytes),manifest={formatVersion:1,minimumReaderVersion:1,assets:[id]};
 const loaded=readArchive(archive(manifest,{['assets/'+id]:bytes}));assert.equal(await sha(loaded.entries['assets/'+id]),id);
 assert.throws(()=>readArchive(archive({...manifest,minimumReaderVersion:2},{})),/future/);
});
test('unsafe archive paths and input-size limits are rejected',()=>{
 assert.throws(()=>readArchive(archive({formatVersion:1,minimumReaderVersion:1},{'../escape':strToU8('x')})),/Unsafe/);
 assert.throws(()=>readArchive(new Uint8Array(2_000_001)),/input limit/);
});
test('canonical hashes ignore object key insertion order and reject nonfinite data',async()=>{
 assert.equal(await idOf({b:2,a:1}),await idOf({a:1,b:2}));
 await assert.rejects(idOf({value:Infinity}));
});
test('delete-versus-edit retains a conflict branch and tree merge repairs cycles',()=>{
 assert.equal(deletedConcurrently({id:'d',parents:['base']},{id:'e',parents:['base']}),true);
 const moves=[{id:'a',parent:'b',seq:1,writer:'x'},{id:'b',parent:'a',seq:1,writer:'y'}];
 assert.deepEqual(treeProjection(moves),treeProjection([...moves].reverse()));assert.equal(treeProjection(moves).recovered.length,1);
});
test('pressure geometry remains finite and changes for measured pressure',()=>{
 const points=[[0,0,.2],[5,2,.4],[10,8,.8],[20,8,.5]];
 const measured=getStroke(points,{simulatePressure:false}),uniform=getStroke(points.map(p=>[p[0],p[1],.5]),{simulatePressure:false});
 assert.ok(measured.flat().every(Number.isFinite));assert.notDeepEqual(measured,uniform);
});
test('PDF composition preserves page size, rotation and immutable source',async()=>{
 const source=await PDFDocument.create();const page=source.addPage([300,400]);page.setRotation({type:'degrees',angle:90});page.drawText('Qualification PDF');
 const original=await source.save(),hash=await sha(original);const copy=await PDFDocument.load(original);copy.getPage(0).drawLine({start:{x:20,y:20},end:{x:80,y:80}});
 const exported=await copy.save();assert.equal(await sha(original),hash);assert.notEqual(await sha(exported),hash);
 const opened=await PDFDocument.load(exported);assert.equal(opened.getPage(0).getRotation().angle,90);assert.deepEqual(opened.getPage(0).getSize(),{width:300,height:400});
});


test('transitive descendants of a deletion are not misclassified as concurrent',()=>{
 const deletion={id:'d',parents:['base']},middle={id:'m',parents:['d']},edit={id:'e',parents:['m']};
 assert.equal(deletedConcurrently(deletion,edit,new Map([['m',middle]])),false);
});
