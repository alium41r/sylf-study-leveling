/** Calls a LOCAL backend as the seeded student and prints the JSON. node scripts/dev/api.mjs /api/quests/weekly [--as bob] */
const path = process.argv[2];
const as = process.argv.includes("--as") ? process.argv[process.argv.indexOf("--as") + 1] : "alice";
const base = "http://127.0.0.1:3111";
const login = await fetch(`${base}/api/auth/native/login`, { method: "POST", headers: { "Content-Type": "application/json", "x-real-ip": "10.60.0.9" }, body: JSON.stringify({ identifier: `${as}@local.test`, password: "a-long-enough-password", clientName: "Dev probe" }) });
const token = (await login.json()).session?.accessToken;
const response = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } });
console.log(response.status, JSON.stringify(await response.json().catch(() => null), null, 1).slice(0, 4000));
