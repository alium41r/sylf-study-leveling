async (page) => {
  const context = await page.context().browser().newContext({ viewport: { width: 1280, height: 900 } });
  const p = await context.newPage();
  const base = 'http://127.0.0.1:3001';
  let onboarded = true;
  const requests = [];
  await context.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    requests.push({ path, method: route.request().method() });
    if (path === '/api/auth/login' || path === '/api/auth/register') return route.fulfill({ json: { user: { id: 900000, name: 'QA Scholar', username: 'qa_scholar', email: 'qa@example.test', level: 1, currentXP: 0, hp: 100, maxHp: 100, hasCompletedOnboarding: onboarded } } });
    if (path === '/api/auth/check-username') return route.fulfill({ json: { available: true } });
    if (path === '/api/auth/oauth/google') return route.fulfill({ contentType: 'text/html', body: '<h1>Google OAuth dispatch reached</h1>' });
    return route.fulfill({ status: 401, json: { error: 'Unauthenticated QA context' } });
  });
  await context.route(/\/(dashboard|onboarding|focus)(\?.*)?$/, route => route.fulfill({ contentType: 'text/html', body: '<h1>Expected authentication destination</h1>' }));
  const results = [];
  const logIn = async (url, completed, expected) => {
    onboarded = completed;
    await p.goto(`${base}${url}`);
    await p.getByLabel('Email or Username').fill('qa_scholar');
    await p.getByLabel('Password', { exact: true }).fill('TestPassword123!');
    await p.getByRole('button', { name: 'Sign in', exact: true }).click();
    await p.waitForURL(`${base}${expected}`);
    results.push({ input: url, onboarded: completed, destination: new URL(p.url()).pathname + new URL(p.url()).search });
  };
  await logIn('/login', true, '/dashboard');
  await logIn('/login', false, '/onboarding');
  await logIn('/login?redirect=%2Ffocus%3Fmode%3Dstudy', true, '/focus?mode=study');
  await logIn('/login?redirect=https%3A%2F%2Fexample.test', true, '/dashboard');
  await p.goto(`${base}/register`);
  await p.getByLabel('Display Name').fill('QA Scholar');
  await p.getByLabel('Username', { exact: true }).fill('qa_scholar');
  await p.getByLabel('Email Address').fill('qa@example.test');
  await p.getByLabel('Password', { exact: true }).fill('TestPassword123!');
  await p.getByRole('button', { name: 'Create account', exact: true }).click();
  await p.waitForURL(`${base}/onboarding`);
  results.push({ registration: true, destination: '/onboarding' });
  await p.goto(`${base}/login`);
  await p.getByRole('link', { name: 'Create an account', exact: true }).click();
  await p.waitForURL(`${base}/register?force=true`);
  await p.getByRole('link', { name: 'Sign in', exact: true }).click();
  await p.waitForURL(`${base}/login`);
  await p.getByRole('button', { name: 'Continue with Google' }).click();
  await p.waitForURL(`${base}/api/auth/oauth/google`);
  results.push({ authLinks: true, googleDispatch: true });
  await context.close();
  return { results, credentialRequests: requests.filter(r => r.path === '/api/auth/login' || r.path === '/api/auth/register'), note: 'All API calls and destination pages intercepted in an isolated context. No real accounts or provider sessions changed.' };
}
