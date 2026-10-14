'use strict';
/* eslint-disable @typescript-eslint/no-require-imports -- macOS diagnostic process management. */
const { spawn, execFileSync } = require('node:child_process');
async function preventSleep() {
  if (process.platform !== 'darwin') throw new Error('SLEEP_GUARD_UNAVAILABLE');
  const child = spawn('/usr/bin/caffeinate', ['-dis', '-w', String(process.pid)], { stdio: 'ignore' });
  let failed = false; child.on('error', () => { failed = true; }); child.on('exit', () => { failed = true; });
  const check = () => {
    if (failed || !child.pid) throw new Error('SLEEP_GUARD_LOST');
    const text = execFileSync('/usr/bin/pmset', ['-g', 'assertions'], { encoding: 'utf8', timeout: 3000 });
    const owned = text.split('\n').filter(line => line.includes(`pid ${child.pid}(caffeinate)`));
    if (!owned.some(line => line.includes('PreventUserIdleSystemSleep'))) throw new Error('SLEEP_ASSERTION_UNVERIFIED');
    return { pid: child.pid, ownerPid: process.pid, assertions: owned.map(line => line.trim()), verifiedAt: new Date().toISOString() };
  };
  try {
    let initial;
    for (let n = 0; n < 20; n++) {
      try { initial = check(); break; } catch { await new Promise(resolve => setTimeout(resolve, 50)); }
    }
    if (!initial) throw new Error('SLEEP_ASSERTION_UNVERIFIED');
    return { initial, check, release: () => child.kill() };
  } catch (error) { child.kill(); throw error; }
}
module.exports = { preventSleep };
