/** File control channel; the existing journey owns cancellation and finance. */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
export function requestCancellation(output, reason) {
  if(typeof reason!=='string'||!reason.trim()||reason.length>1000)throw new Error('CANCELLATION_REASON_REQUIRED');
  const control=JSON.parse(readFileSync(resolve(output,'control.json'),'utf8'));
  if(control.schemaVersion!==1||!control.runId||!control.rootRequestId)throw new Error('C01_CONTROL_IDENTITY_REQUIRED');
  const request={schemaVersion:1,runId:control.runId,rootRequestId:control.rootRequestId,reason,requestedAt:new Date().toISOString()};
  writeFileSync(resolve(output,'cancel-request.json'),JSON.stringify(request,null,2)+'\n',{flag:'wx',mode:0o600});return request;
}
export function readCancellation(output, runId, rootRequestId) {
  const request=JSON.parse(readFileSync(resolve(output,'cancel-request.json'),'utf8'));
  if(request.schemaVersion!==1||request.runId!==runId||request.rootRequestId!==rootRequestId||typeof request.reason!=='string'||!request.reason.trim()||request.reason.length>1000)throw new Error('CANCELLATION_IDENTITY_MISMATCH');
  return request;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const [action,output,reason,...extra]=process.argv.slice(2);
  if(action!=='cancel'||!output||extra.length)throw new Error('Use cancel /absolute/run-output "reason"');
  console.log(JSON.stringify(requestCancellation(output,reason)));
}
