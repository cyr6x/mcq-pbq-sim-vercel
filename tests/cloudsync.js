// Cloud sync end to end: two browser profiles ("devices") sync through the
// real supabase/schema.sql. Supabase's REST gateway is stood in by
// tests/fakerest (or any server on FAKE_REST) that runs each RPC as `anon`
// against a Postgres with the schema applied. Requests the app makes to
// https://test-proj.supabase.co are routed there by Playwright.
const BASE = process.env.BASE_URL || 'http://localhost:8000/index.html';
const REST = process.env.FAKE_REST || 'http://localhost:54321';
const PSQL = process.env.PSQL || '';           // optional: shell command printing row count
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const URL_ = 'https://test-proj.supabase.co', KEY = 'sb_publishable_testkey_0123456789';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL: ' + m); } };
const dbCount = () => PSQL ? +execSync(PSQL).toString().trim() : null;

async function device(b, name) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
  await ctx.route(URL_ + '/**', async route => {
    const r = route.request();
    const resp = await route.fetch({ url: REST + new URL(r.url()).pathname, headers: r.headers() }).catch(() => null);
    if (!resp) return route.abort('connectionrefused');
    route.fulfill({ response: resp, headers: { ...resp.headers(), 'access-control-allow-origin': '*' } });
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('dialog', d => d.accept());
  await p.goto(BASE); await p.waitForTimeout(400);
  const W = s => p.evaluate(x => window.eval(x), s);
  return { ctx, p, W, errs, name };
}
async function connect(d, url, key, syncKey) {
  await d.W(`location.hash='#/settings'`); await d.p.waitForTimeout(200);
  await d.p.fill('#cloud-url', url); await d.p.fill('#cloud-key', key);
  if (syncKey) await d.p.fill('#cloud-sync-key', syncKey);
  await d.p.click('button:has-text("Connect")');
  await d.p.waitForFunction(() => ['online', 'error'].includes(window.eval('_cloud.status')), null, { timeout: 15000 });
  return d.W(`({status:_cloud.status,msg:_cloud.message,cfg:cloudCfg()})`);
}
const takeDrill = d => d.W(`_doLaunch({mode:'study',count:10,explain:false});S.questions.forEach((q,i)=>{if(i%2)S.answers[q.id]=q.options?q.options.find(o=>o.correct).id:undefined});submitExam();exitReviewMode();restartExam();`);
const waitIdle = d => d.p.waitForFunction(() => !window.eval('_cloud.busy') && window.eval('_cloud.status') !== 'connecting', null, { timeout: 15000 });

(async () => {
  const b = await chromium.launch();
  const start = dbCount();

  // --- bad inputs never get saved
  const A = await device(b, 'A');
  let r = await connect(A, URL_, 'sb_publishable_WRONGKEY_000000000000');
  ok(r.status === 'error' && /rejected the API key/.test(r.msg) && !r.cfg, 'wrong key → clear error, nothing saved: ' + r.msg);
  await A.W(`location.hash='#/';route()`);
  r = await connect(A, URL_, 'sb_secret_abcdefghijklmnopqrstuvwxyz');
  ok(r.status === 'error' && /secret key/.test(r.msg) && !r.cfg, 'secret key refused client-side');
  await A.W(`location.hash='#/';route()`);
  r = await connect(A, 'http://evil.example.com', KEY);
  ok(r.status === 'error' && !r.cfg, 'non-Supabase URL refused');

  // --- device A connects, a new sync key is generated
  await A.W(`location.hash='#/';route()`);
  r = await connect(A, URL_, KEY);
  ok(r.status === 'online' && r.cfg && /^sk_[A-Za-z0-9_-]{43}$/.test(r.cfg.syncKey), 'A connects with a fresh 256-bit sync key');
  const syncKey = r.cfg.syncKey;
  ok(await A.p.isVisible('#cloud-sync-show'), 'settings shows the sync key field');

  // --- an attempt on A is pushed automatically
  await takeDrill(A); await A.p.waitForTimeout(500); await waitIdle(A);
  ok(await A.W(`_cloud.status`) === 'online', 'auto-sync after attempt: ' + await A.W(`_cloud.message`));
  if (PSQL) ok(dbCount() === start + 1, 'one row stored server-side');

  // --- reload: still configured, auto-syncs on load
  await A.p.reload(); await A.p.waitForTimeout(500); await waitIdle(A);
  ok(await A.W(`_cloud.status`) === 'online' && await A.W(`document.getElementById('nav-cloud-state').textContent`) === 'Cloud synced', 'auto-sync on page load');

  // --- device B (empty browser) joins with the same sync key and gets the history
  const B = await device(b, 'B');
  ok(await B.W(`_loadJson(ATTEMPTS_KEY,[]).length`) === 0, 'B starts empty');
  r = await connect(B, URL_, KEY, syncKey);
  ok(r.status === 'online' && r.cfg.syncKey === syncKey, 'B connects with A\'s sync key');
  ok(await B.W(`_loadJson(ATTEMPTS_KEY,[]).length`) === 1, 'B pulled A\'s attempt');
  await B.W(`location.hash='#/analytics'`); await B.p.waitForTimeout(300);
  ok(/1 full-length · 0 drills|0 full-length · 1 drill/.test(await B.p.textContent('#analytics-root')), 'B analytics reflect the pulled attempt');

  // --- B records an attempt; A sees it after Sync now
  await takeDrill(B); await B.p.waitForTimeout(500); await waitIdle(B);
  await A.W(`location.hash='#/settings'`); await A.p.waitForTimeout(200);
  await A.p.click('button:has-text("Sync now")'); await waitIdle(A);
  ok(await A.W(`_loadJson(ATTEMPTS_KEY,[]).length`) === 2, 'A pulls B\'s attempt (2 total)');
  if (PSQL) ok(dbCount() === start + 2, 'two rows server-side, no duplicates after repeated syncs');

  // --- offline: attempt kept locally, synced when back online
  await A.ctx.setOffline(true);
  await takeDrill(A); await A.p.waitForTimeout(500);
  ok(await A.W(`_cloud.status`) === 'offline' && await A.W(`_loadJson(ATTEMPTS_KEY,[]).length`) === 3, 'offline attempt kept locally');
  await A.ctx.setOffline(false); await A.p.waitForTimeout(800); await waitIdle(A);
  ok(await A.W(`_cloud.status`) === 'online', 'back online → synced');
  if (PSQL) ok(dbCount() === start + 3, 'offline attempt reached the server');

  // --- different sync key sees nothing
  const C = await device(b, 'C');
  r = await connect(C, URL_, KEY);
  ok(r.status === 'online' && await C.W(`_loadJson(ATTEMPTS_KEY,[]).length`) === 0, 'a different sync key cannot see this history');

  // --- turn off keeps data; delete cloud copy removes server rows only
  await A.W(`location.hash='#/settings'`); await A.p.waitForTimeout(200);
  await A.p.click('button:has-text("Delete cloud copy")'); await A.p.waitForTimeout(600);
  ok(!(await A.W(`cloudCfg()`)) && await A.W(`_loadJson(ATTEMPTS_KEY,[]).length`) === 3, 'delete cloud copy: sync off, local history kept');
  if (PSQL) ok(dbCount() === start, 'server rows for that key deleted');

  for (const d of [A, B, C]) ok(d.errs.length === 0, d.name + ' page errors: ' + d.errs.join(' | '));
  console.log(`cloudsync: ${pass} passed, ${fail} failed`);
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
