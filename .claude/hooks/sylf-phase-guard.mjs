#!/usr/bin/env node
// PreToolUse guard for the sylf-phase-implementer subagent (Sylf Native backend stage).
// It enforces the owner's safety rules mechanically. Exit 2 blocks the call and shows
// the reason to the agent. Run this file with --self-test to check every rule.

const LOCAL_DB = /\bDATABASE_URL=["']?postgres(ql)?:\/\/[^\s"']*(localhost|127\.0\.0\.1)[:/]/;

const BASH_RULES = [
  [/(^|[\s;&|(`/])adb(\s|$)/, "Tablet is out of bounds: no adb of any kind."],
  [/\bandroid:(smoke|install|workspace-check|spaces-check|home-check|interaction-check|design-check|memory-check|r15-check|scroll-check|pinch-check)\b/,
    "This script drives the tablet. Only android:build is allowed."],
  [/\bgit\s+(-[Cc]\s+\S+\s+|-\S+\s+)*(commit|push|pull|fetch|stash|reset|clean|rebase|merge|cherry-pick|revert|restore|checkout|switch|add|rm|mv|tag|am|apply|worktree)\b/,
    "No commits, and nothing that moves or rewrites the owner's uncommitted work. git status, diff, log, show and ls-files are fine."],
  [/\bgit\s+branch\s+-/, "Do not change branches."],
  [/\bgh\s+(pr|release|repo|issue|workflow|secret)\b/, "No GitHub writes in this stage."],
  [/(^|[\s;&|(])(npx\s+)?vercel(\s|$)/, "No deployments or Vercel access."],
  [/(^|[\s;&|(])(npx\s+)?supabase\s+(db|migration|functions|secrets|link|projects|storage|branches)\b/, "No hosted Supabase access."],
  [/\beas\s+(build|submit|update)\b|\bnpm\s+publish\b/, "No publishing."],
  [/pooler\.supabase\.com|gjkwkdqdoekzllmnsejo/, "Hosted database or project reference: never touch hosted data."],
  [/(^|[\s;&|(])(sudo|pmset|launchctl|networksetup|csrutil|spctl)(\s|$)|\bdefaults\s+write\b/, "No system settings changes."],
  [/\b(cat|head|tail|less|more|grep|rg|sed|awk|cut|source|cp|mv|xxd|strings|base64|node\s+-e)\b[^\n;|&]*(^|[\s"'/=])\.env(\.local|\.production|\.development)?(["'\s;|&]|$)/,
    "Do not read or copy real credential files. .env.example shows the variable names."],
  [/(^|[\s;&|(])\.\s+\S*\.env(\.local)?(\s|$)/, "Do not source real credential files."],
  [/\brm\s+-[a-zA-Z]*r[a-zA-Z]*\b[^\n;|&]*(^|[\s"'/])(scratch|archive|documentation|prisma|assets|public|lib|app|\.git|\.claude|~|\$HOME)(["'\s/;|&]|$)/,
    "Do not delete repository content or the owner's files."],
  [/\brm\s+-[a-zA-Z]*r[a-zA-Z]*\b\s+(-\S+\s+)*["']?\/?["']?(\s|$)/, "Do not delete from a root path."],
  [/\.claude\/(hooks|agents|orchestration|settings)/, "The orchestration configuration is the supervisor's. Do not change it."],
];

const LOCAL_ONLY_RULES = [
  [/\bprisma\s+(migrate\s+(deploy|dev|reset|resolve)|db\s+(push|pull|execute|seed))\b/,
    "Prisma against a database needs DATABASE_URL set to localhost on the same command."],
  [/\bnext\s+(dev|start|build)\b|\bnpm\s+run\s+(dev|start|build)\b(?!:)/,
    "Next.js loads the hosted .env file. Set DATABASE_URL to the disposable localhost database on the same command, and blank the other hosted services."],
  [/^(?!.*\bnative\b).*(\bvitest\b|\bnpm\s+(run\s+)?test\b)/s,
    "Root Vitest has stale mocks that can reach a real Prisma client (Phase 11 finding D-4). Set DATABASE_URL to localhost on the same command and blank the other hosted services. Native tests are exempt."],
];

const CREDENTIAL_FILE = /(^|\/)\.env(\.local|\.production|\.development)?$/;
const ORCHESTRATION_FILE = /(^|\/)\.claude\/(hooks|agents|orchestration|settings)/;

export function verdict(tool, input = {}) {
  if (tool === "Bash") {
    const command = String(input.command ?? "");
    for (const [rule, reason] of BASH_RULES) if (rule.test(command)) return reason;
    if (!LOCAL_DB.test(command)) {
      for (const [rule, reason] of LOCAL_ONLY_RULES) if (rule.test(command)) return reason;
    }
    return null;
  }
  const path = String(input.file_path ?? input.notebook_path ?? "");
  if (CREDENTIAL_FILE.test(path)) return "Do not open real credential files. .env.example shows the variable names.";
  if (tool !== "Read" && ORCHESTRATION_FILE.test(path)) return "The orchestration configuration is the supervisor's. Do not change it.";
  return null;
}

function selfTest() {
  const local = "DATABASE_URL=postgresql://postgres:x@127.0.0.1:5544/sylf";
  const deny = [
    "adb devices", "cd native && adb shell ls", "npm run android:smoke", "npm run android:memory-check -- --sweep=world",
    "git commit -m x", "git push", "git stash", "git -C native add .", "git reset --hard", "git checkout -- lib",
    "vercel deploy", "npx vercel --prod", "npx supabase db push", "gh pr create",
    "psql postgres://u:p@aws-0-ap-southeast-1.pooler.supabase.com/db", "sudo rm x", "defaults write com.x y 1",
    "cat .env", "grep JWT .env.local", "source .env", ". .env.local", "sed -n 1p ./.env",
    "npx prisma migrate deploy", "npx prisma db push", "npm run dev", "npx next build", "npm run build",
    "npx vitest --run", "npm run test -- --run __tests__/timer", "npm test",
    "rm -rf scratch", "rm -rf documentation/native", "rm -rf ~", "rm -rf /", "echo x >> .claude/hooks/sylf-phase-guard.mjs",
  ];
  const allow = [
    "git status --short", "git diff --stat", "git log -5", "git show HEAD:lib/auth.ts", "cat .env.example",
    `${local} npm run test -- --run __tests__/timer`, `${local} npx vitest --run`, "cd native && npx vitest run packages/spaces",
    "npm --prefix native test", "npm --prefix native run verify", "npm run android:build",
    "npm --prefix native run desktop:session-check", "npx prisma generate", "npx prisma validate",
    `${local} npx prisma migrate deploy`, `${local} npm run dev`, `${local} npx next build`,
    "node scripts/test/test-timer-postgres.mjs", "docker ps", "rm -rf native/apps/sylf/dist", "rm -rf /tmp/sylf-out",
    "grep -rn getSession app/api", "tsc --noEmit", "ls -la", "npm run mobile:build",
  ];
  let failed = 0;
  for (const command of deny) if (!verdict("Bash", { command })) { failed++; console.log("SHOULD DENY:", command); }
  for (const command of allow) {
    const reason = verdict("Bash", { command });
    if (reason) { failed++; console.log("SHOULD ALLOW:", command, "->", reason); }
  }
  const files = [
    ["Read", "/x/.env", true], ["Read", "/x/.env.local", true], ["Read", "/x/.env.example", false],
    ["Edit", "/x/.claude/hooks/a.mjs", true], ["Write", "/x/.claude/agents/a.md", true], ["Read", "/x/.claude/agents/a.md", false],
    ["Write", "/x/documentation/native/reports/phase-11/report.md", false], ["Edit", "/x/lib/auth.ts", false],
  ];
  for (const [tool, file_path, denied] of files) {
    if (Boolean(verdict(tool, { file_path })) !== denied) { failed++; console.log("WRONG:", tool, file_path); }
  }
  console.log(failed ? `${failed} failed` : `guard self-test passed (${deny.length + allow.length + files.length} cases)`);
  process.exit(failed ? 1 : 0);
}

if (process.argv.includes("--self-test")) selfTest();
else {
  let raw = "";
  process.stdin.on("data", chunk => { raw += chunk; });
  process.stdin.on("end", () => {
    let event;
    try { event = JSON.parse(raw); } catch { console.error("Guard could not parse its input, so the call is blocked."); process.exit(2); }
    const reason = verdict(event.tool_name, event.tool_input);
    if (reason) { console.error(`Blocked by the owner's safety guard: ${reason}`); process.exit(2); }
    process.exit(0);
  });
}
