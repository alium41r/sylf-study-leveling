/** Invoke from a scheduler every five minutes. No dependency on a browser. */
const origin = process.env.CALENDAR_PUBLIC_URL;
const secret = process.env.CRON_SECRET;
if (!origin || !secret) throw new Error("Set CALENDAR_PUBLIC_URL and CRON_SECRET in the scheduler environment.");
const url = new URL("/api/cron/calendar-sync", origin);
if(url.protocol!=="https:")throw new Error("A public HTTPS deployment is required.");
const response=await fetch(url,{headers:{Authorization:`Bearer ${secret}`},redirect:"error",signal:AbortSignal.timeout(65000)});
if(!response.ok)throw new Error(`Calendar sync returned HTTP ${response.status}.`);
console.log("Calendar sync completed",await response.json());
