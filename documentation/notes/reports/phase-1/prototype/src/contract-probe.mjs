// EXPERIMENT ONLY: Phase 1 contract probes; not a production Notes repository.
import Dexie from 'dexie';
import * as Y from 'yjs';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';

export function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  }
  throw new Error('Unsupported canonical value');
}
export const sha = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(n => n.toString(16).padStart(2,'0')).join('');
export const idOf = async value => sha(strToU8(canonical(value)));

export function database(name) {
  const db = new Dexie(name);
  db.version(1).stores({journal:'&id,[owner+library+doc]',outbox:'&id,[owner+library]',state:'&key',meta:'&key'});
  return db;
}
export function assertSession(captured, current) {
  if (canonical(captured) !== canonical(current)) throw new Error('Stale owner/library/session epoch');
}
export async function persist(db, entry, { failAfterJournal = false, current = entry.session } = {}) {
  assertSession(entry.session, current);
  const key = canonical([entry.owner,entry.library,entry.doc]);
  await db.transaction('rw',db.journal,db.outbox,db.state,async () => {
    await db.journal.put(entry);
    if (failAfterJournal) throw new Error('Injected transaction failure');
    await db.outbox.put({id:entry.id,owner:entry.owner,library:entry.library,status:'pending'});
    await db.state.put({key,revision:entry.id});
  });
  return {localRevision:entry.id};
}
export class FileTarget {
  objects = new Map();
  failAfterWrite = false;
  corruptRead = false;
  writes = 0;
  async put(id,bytes) {
    if (!this.objects.has(id)) { this.objects.set(id,new Uint8Array(bytes)); this.writes++; }
    if (this.failAfterWrite) { this.failAfterWrite = false; throw new Error('Lost upload acknowledgement'); }
    return id;
  }
  async get(id) {
    if (!this.objects.has(id)) throw new Error('Missing object');
    const b = new Uint8Array(this.objects.get(id));
    if (this.corruptRead) { this.corruptRead=false; b[0] ^= 1; }
    return b;
  }
  async list() { return [...this.objects.keys()]; }
}
export async function verifiedPut(target,id,bytes) {
  try { await target.put(id,bytes); } catch (error) {
    // Unknown acknowledgement is reconciled with the immutable identity.
    try { if (await sha(await target.get(id)) !== id) throw error; } catch { throw error; }
  }
  if (await sha(await target.get(id)) !== id) throw new Error('Checksum mismatch');
}
export async function publish(target, manifest, objects, captured, current) {
  assertSession(captured,current());
  for (const item of objects) {
    await verifiedPut(target,item.id,item.bytes);
    assertSession(captured,current());
  }
  // A manifest cannot become cloud-acknowledged with missing/corrupt dependencies.
  for (const id of manifest.required) if (await sha(await target.get(id)) !== id) throw new Error('Dependency corrupt');
  const bytes = strToU8(canonical(manifest)), id = await sha(bytes);
  await verifiedPut(target,id,bytes);
  assertSession(captured,current());
  return {cloudRevision:id};
}
export function recover(updates) {
  const doc = new Y.Doc();
  updates.forEach(bytes => Y.applyUpdate(doc,bytes));
  return doc;
}
export function deletedConcurrently(deletion, edit, ancestors = new Map()) {
  const reaches = (commit, id, seen = new Set()) => {
    if (commit.id === id) return true;
    if (seen.has(commit.id)) return false;
    seen.add(commit.id);
    return commit.parents.some(parent => parent === id || (ancestors.has(parent) && reaches(ancestors.get(parent), id, seen)));
  };
  return !reaches(edit,deletion.id) && !reaches(deletion,edit.id);
}
export function treeProjection(moves) {
  // Stable last operation by logical counter/writer; never wall-clock.
  const chosen = new Map();
  for (const m of [...moves].sort((a,b)=>a.seq-b.seq || a.writer.localeCompare(b.writer))) chosen.set(m.id,m.parent);
  const recovered=[];
  for (const id of [...chosen.keys()].sort()) {
    const seen=new Set([id]); let at=chosen.get(id);
    while (at) {
      if (seen.has(at)) {chosen.set(id,null);recovered.push(id);break;}
      seen.add(at);at=chosen.get(at);
    }
  }
  return {parents:Object.fromEntries(chosen),recovered};
}
export function archive(manifest,entries) {
  return zipSync({'manifest.json':strToU8(canonical(manifest)),...entries},{level:0});
}
export function readArchive(bytes) {
  if (bytes.byteLength > 2_000_000) throw new Error('Archive input limit');
  let total=0,count=0;
  const entries=unzipSync(bytes,{filter(file) {
    count++;total+=file.originalSize;
    if(count>64 || total>4_000_000 || file.originalSize>2_000_000 || file.name.startsWith('/') || file.name.includes('..') || file.name.includes('\\')) throw new Error('Unsafe archive');
    return true;
  }});
  const manifest=JSON.parse(strFromU8(entries['manifest.json']));
  if(manifest.formatVersion!==1 || manifest.minimumReaderVersion>1) throw new Error('Read-only future format');
  return {manifest,entries};
}

