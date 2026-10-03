// Optional full browser regression. npm test remains dependency/browser free.
// npm run build && node scripts/browser-regression.mjs
// PLAYWRIGHT_MODULE may point to an existing Playwright installation; otherwise
// import('playwright') is used. CHROMIUM_PATH is optional.
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createBrowserFixture, selectedPoi, tripName } from './browser-fixture.mjs';

const moduleName = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(path.isAbsolute(moduleName) ? pathToFileURL(moduleName).href : moduleName).catch(error => {
  throw new Error('Playwright is required only for this optional browser check. Install it locally or set PLAYWRIGHT_MODULE to its existing module path.', { cause: error });
});
const screenshots = await mkdtemp(path.join(os.tmpdir(), 'time-master-browser-screenshots-'));
const fixture = await createBrowserFixture();
let browser;
let page;
const failures = [];
const requests = [];
const expectedAuthErrors = [];
const expectedKeys = ['xining', selectedPoi.key, 'huzhu'];
const topology = day => [day.legs[0]?.from.key, ...day.legs.map(leg => leg.to.key)];
const checks = [];
const pass = description => { checks.push(description); console.log(`PASS ${description}`); };

async function assertSelectedTrip(trip) {
  assert.deepEqual(trip.customStops['1'], expectedKeys);
  assert.equal(trip.customPois[selectedPoi.key].name, selectedPoi.name);
  assert.equal(trip.customPois[selectedPoi.key].lng, selectedPoi.lng);
  assert.equal(trip.customPois[selectedPoi.key].lat, selectedPoi.lat);
  assert.deepEqual(topology(trip.days[0]), expectedKeys);
  assert.equal(trip.days[0].legs.length, 2);
  assert.deepEqual(topology(trip.days[1]), ['huzhu', 'chaka']);
}

try {
  await fixture.start({ seed: true });
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: ['--disable-background-networking', '--disable-component-update', '--disable-domain-reliability'],
  });
  const context = await browser.newContext({
    baseURL: fixture.origin, viewport: { width: 1440, height: 1000 },
    locale: 'zh-CN', timezoneId: 'UTC', serviceWorkers: 'block',
  });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== fixture.origin) {
      failures.push(`External browser request blocked: ${url.origin}${url.pathname}`);
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  page = await context.newPage();
  page.on('request', request => requests.push(request.url()));
  page.on('requestfailed', request => failures.push(`Browser request failed: ${request.url()} (${request.failure()?.errorText})`));
  page.on('pageerror', error => failures.push(`Uncaught browser exception: ${error.message}`));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const location = message.location().url;
    if (location === `${fixture.origin}/login` && /Failed to load resource.*\b401\b/.test(message.text())) {
      expectedAuthErrors.push(message.text());
    } else failures.push(`Browser console: ${message.text()} (${location})`);
  });
  page.on('response', response => {
    if (response.status() >= 400 && !(response.url() === `${fixture.origin}/login` && response.status() === 401)) {
      failures.push(`Unexpected HTTP ${response.status()}: ${response.url()}`);
    }
  });

  const direct = await context.request.get('/trips', { maxRedirects: 0 });
  assert.equal(direct.status(), 303);
  assert.equal(direct.headers().location, '/login');
  assert.match(direct.headers()['cache-control'], /no-store/);
  const index = await readFile(path.join(fixture.dir, 'dist/index.html'), 'utf8');
  const assetPaths = [...index.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)].map(match => match[1]);
  assert.ok(assetPaths.some(asset => asset.endsWith('.js')), 'Build must contain a JavaScript asset');
  for (const asset of ['/index.html', ...assetPaths]) {
    const response = await context.request.get(asset, { maxRedirects: 0 });
    assert.equal(response.status(), 303, `Unauthenticated static resource: ${asset}`);
    assert.equal(response.headers().location, '/login');
  }
  for (const api of ['/api/health', '/api/settings', '/api/places', '/api/events', '/api/trip', '/api/auth/session']) {
    assert.equal((await context.request.get(api, { maxRedirects: 0 })).status(), 401, `Unauthenticated API: ${api}`);
  }
  await page.goto('/trips');
  await page.getByLabel('个人密码').waitFor();
  assert.equal(new URL(page.url()).pathname, '/login');
  assert.equal(await page.locator('.shell-nav').count(), 0);
  await page.screenshot({ path: path.join(screenshots, '01-login.png'), fullPage: true });
  pass('anonymous deep links, index, JS/CSS assets and private APIs are protected');

  await page.getByLabel('个人密码').fill('deliberately-wrong-test-password');
  const rejected = page.waitForResponse(response => response.url() === `${fixture.origin}/login` && response.request().method() === 'POST');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  assert.equal((await rejected).status(), 401);
  await page.getByRole('alert').waitFor();
  assert.equal((await context.request.get('/api/trip')).status(), 401);
  pass('wrong password is rejected and does not create an authenticated session');

  async function login() {
    await page.getByLabel('个人密码').fill(fixture.password);
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await page.waitForURL(`${fixture.origin}/`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: '退出登录', exact: true }).waitFor();
    const cookies = await context.cookies();
    const session = cookies.find(cookie => cookie.name === 'tm_session');
    assert.ok(session?.httpOnly, 'Session cookie must be HttpOnly');
    assert.equal(session.sameSite, 'Strict');
    return session.value;
  }
  const oldSession = await login();
  pass('valid password logs in with an HttpOnly, SameSite=Strict cookie');

  async function openTrip() {
    await page.getByRole('link', { name: '摩旅规划', exact: true }).click();
    await page.locator('.tr-title').filter({ hasText: tripName }).waitFor();
    await page.locator('.tr-poi-card').filter({ hasText: selectedPoi.name }).waitFor();
    await page.waitForLoadState('networkidle');
  }
  await openTrip();
  const poiCard = page.locator('.tr-poi-card').filter({ hasText: selectedPoi.name });
  const checkbox = poiCard.getByRole('checkbox');
  assert.equal(await checkbox.isChecked(), false);
  const added = page.waitForResponse(response => response.url().endsWith('/api/trip/days/1/stops') && response.request().method() === 'PUT');
  // The checkbox is controlled by the last saved trip; wait for the PUT rather
  // than requiring Playwright's check() to observe an optimistic local toggle.
  await checkbox.click();
  const addResponse = await added;
  assert.equal(addResponse.status(), 200, await addResponse.text());
  const submittedStops = addResponse.request().postDataJSON().stops;
  assert.equal(typeof submittedStops[1], 'object', 'Frontend must submit the complete external POI snapshot');
  assert.equal(submittedStops[1].key, selectedPoi.key);
  await assertSelectedTrip((await addResponse.json()).data);
  await page.locator('.tr-stop-chip').filter({ hasText: selectedPoi.name }).waitFor();
  await page.waitForFunction(name => {
    const label = [...document.querySelectorAll('.tr-poi-card')].find(item => item.textContent.includes(name));
    return label?.querySelector('input').checked === true;
  }, selectedPoi.name, { timeout: 5000 });
  assert.equal(await page.locator('.tr-drive-card').count(), 2);
  await assertSelectedTrip((await (await context.request.get('/api/trip')).json()).data);
  await assertSelectedTrip(await fixture.readTrip());
  await page.screenshot({ path: path.join(screenshots, '02-selected-trip.png'), fullPage: true });
  pass('UI selection persists a complete ctrip POI snapshot, checked state and two connected route legs');

  // Verify switching days neither leaks day-one selection nor loses its state.
  await page.locator('.tr-tab').nth(1).click();
  await page.waitForLoadState('networkidle');
  assert.equal(await page.locator('.tr-drive-card').count(), 1);
  assert.equal(await checkbox.isChecked(), false);
  await page.locator('.tr-tab').nth(0).click();
  await page.waitForLoadState('networkidle');
  assert.equal(await checkbox.isChecked(), true);
  pass('day navigation keeps the selected stop scoped to its own day');

  const beforeRestart = await fixture.readTrip();
  await fixture.stop('SIGKILL');
  await fixture.start(); // Same directory, same port, new Node process; no reseed.
  assert.deepEqual(await fixture.readTrip(), beforeRestart);
  assert.equal((await context.request.get('/api/trip')).status(), 401, 'Old session must fail after restart');
  await page.reload();
  await page.getByLabel('个人密码').waitFor();
  assert.equal(new URL(page.url()).pathname, '/login');
  assert.equal(await page.locator('.shell-nav').count(), 0);
  const newSession = await login();
  assert.notEqual(newSession, oldSession);
  await openTrip();
  assert.equal(await checkbox.isChecked(), true);
  await assertSelectedTrip((await (await context.request.get('/api/trip')).json()).data);
  pass('hard Node restart preserves the same DATA_DIR but invalidates the old browser session');

  const recalculated = page.waitForResponse(response => response.url().endsWith('/api/trip/days/1/recalc'));
  await page.getByRole('button', { name: '重算当天', exact: true }).click();
  const recalcResponse = await recalculated;
  assert.equal(recalcResponse.status(), 200, await recalcResponse.text());
  await assertSelectedTrip((await recalcResponse.json()).data);
  await page.waitForLoadState('networkidle');
  assert.equal(await checkbox.isChecked(), true);
  assert.equal(await page.locator('.tr-drive-card').count(), 2);
  assert.equal(await page.locator('.tr-stop-chip').filter({ hasText: selectedPoi.name }).count(), 1);
  await assertSelectedTrip(await fixture.readTrip());
  await page.screenshot({ path: path.join(screenshots, '03-after-restart-recalc.png'), fullPage: true });
  pass('recalculation after reauthentication retains the custom stop, route topology and UI selection');

  const loggedOut = page.waitForResponse(response => response.url().endsWith('/api/auth/logout'));
  await page.getByRole('button', { name: '退出登录', exact: true }).click();
  assert.equal((await loggedOut).status(), 200);
  await page.getByLabel('个人密码').waitFor();
  assert.equal((await context.request.get('/api/trip')).status(), 401);
  assert.equal((await context.cookies()).some(cookie => cookie.name === 'tm_session'), false);
  await page.reload();
  await page.getByLabel('个人密码').waitFor();
  await page.goBack();
  await page.getByLabel('个人密码').waitFor();
  assert.equal(await page.locator('.shell-nav').count(), 0);
  assert.equal((await context.request.get('/api/trip')).status(), 401);
  await page.goto('/trips');
  await page.getByLabel('个人密码').waitFor();
  await page.screenshot({ path: path.join(screenshots, '04-logged-out.png'), fullPage: true });
  pass('logout clears the cookie and refresh, Back, deep links and API requests remain locked');

  assert.equal(fixture.output.includes('FORBIDDEN_EXTERNAL_IO'), false, fixture.output);
  assert.equal(fixture.output.includes('[ERR]'), false, fixture.output);
  assert.ok(requests.length > 0);
  assert.ok(requests.every(url => new URL(url).origin === fixture.origin), 'Browser traffic must remain on the isolated local server');
  assert.deepEqual(failures, [], failures.join('\n'));
  pass('no unexpected browser exceptions, console errors, failed HTTP responses or external service calls');
  console.log(JSON.stringify({ passed: checks.length, screenshots, expectedRejectedLoginConsoleErrors: expectedAuthErrors.length }, null, 2));
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: path.join(screenshots, 'failure.png'), fullPage: true }).catch(() => {});
  console.error(`Screenshots: ${screenshots}`);
  if (failures.length) console.error(failures.join('\n'));
  throw error;
} finally {
  try { await browser?.close(); } finally { await fixture.dispose(); }
}
