// End-to-end UI test of DANS in headless Google Chrome (DevTools protocol, no extra packages).
// It signs in as every role, walks through the main workflows, checks for JavaScript errors, verifies real-time
// behaviour (alert popup, closing a revoked user's live connection), checks the mobile layout, and saves
// screenshots to docs/screenshots for the documentation.
//
// Usage (API and "npm start" running, demo data loaded):  node tests/ui-check.mjs [https://localhost:4200]
// Presentation mode (present.ps1):  node tests/ui-check.mjs https://<this computer's IP>:7180
// It ADDS a test account and a test report, so run it on a development database only.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const base = process.argv[2] ?? 'https://localhost:4200';
// SCREENSHOT_DIR keeps the documentation screenshots untouched, e.g. when testing presentation mode.
const outDir = process.env.SCREENSHOT_DIR ?? fileURLToPath(new URL('../docs/screenshots/', import.meta.url));
mkdirSync(outDir, { recursive: true });

const chromePath = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => p && existsSync(p));
if (!chromePath) {
  console.error('Google Chrome was not found. Set CHROME_PATH to chrome.exe.');
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let failures = 0;
function check(name, condition, extra) {
  if (condition) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}`, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : '');
  }
}

// ---------- Minimal DevTools-protocol client ----------
class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.nextId = 0;
    this.pending = new Map();
    this.listeners = new Set();
  }
  open() {
    return new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id) {
          const call = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) call?.reject(new Error(`${msg.error.message} (${call.method})`));
          else call?.resolve(msg.result);
        } else for (const listener of this.listeners) listener(msg);
      };
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.nextId;
    this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject, method }));
  }
}

/** One browser tab in its own private context (separate cookies), like a separate person's browser. */
class Tab {
  constructor(cdp, sessionId, name) {
    this.cdp = cdp;
    this.sessionId = sessionId;
    this.name = name;
    this.errors = [];
    this.sockets = new Map(); // requestId -> { url, closed }
    cdp.listeners.add((msg) => {
      if (msg.sessionId !== sessionId) return;
      const p = msg.params;
      if (msg.method === 'Runtime.exceptionThrown') this.errors.push(p.exceptionDetails.exception?.description ?? p.exceptionDetails.text);
      if (msg.method === 'Runtime.consoleAPICalled' && p.type === 'error') this.errors.push(p.args.map((a) => a.value ?? a.description).join(' '));
      if (msg.method === 'Log.entryAdded' && p.entry.level === 'error') this.errors.push(`${p.entry.text} ${p.entry.url ?? ''}`);
      if (msg.method === 'Network.webSocketCreated') this.sockets.set(p.requestId, { url: p.url, closed: false });
      if (msg.method === 'Network.webSocketClosed' && this.sockets.has(p.requestId)) this.sockets.get(p.requestId).closed = true;
    });
  }

  static async open(cdp, name, { width = 1366, height = 900, mobile = false } = {}) {
    const { browserContextId } = await cdp.send('Target.createBrowserContext');
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank', browserContextId });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const tab = new Tab(cdp, sessionId, name);
    for (const domain of ['Page', 'Runtime', 'Log', 'Network']) await tab.send(`${domain}.enable`);
    await tab.viewport(width, height, mobile);
    return tab;
  }

  send(method, params) {
    return this.cdp.send(method, params, this.sessionId);
  }

  async viewport(width, height, mobile = false) {
    this.width = width;
    await this.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  }

  async eval(expression) {
    const result = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(`${this.name}: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`);
    return result.result.value;
  }

  async waitFor(condition, what, timeout = 15_000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      if (await this.eval(condition).catch(() => false)) return true;
      await sleep(150);
    }
    throw new Error(`${this.name}: timed out waiting for ${what}`);
  }

  waitForSelector(selector, timeout) {
    return this.waitFor(`!!document.querySelector(${JSON.stringify(selector)})`, selector, timeout);
  }

  waitForText(text, timeout) {
    return this.waitFor(`document.body.innerText.includes(${JSON.stringify(text)})`, `"${text}"`, timeout);
  }

  /** Resolves when the browser reports the given event for this tab. */
  nextEvent(method, timeout = 20_000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.cdp.listeners.delete(listener);
        reject(new Error(`${this.name}: no ${method} within ${timeout} ms`));
      }, timeout);
      const listener = (msg) => {
        if (msg.sessionId !== this.sessionId || msg.method !== method) return;
        clearTimeout(timer);
        this.cdp.listeners.delete(listener);
        resolve(msg.params);
      };
      this.cdp.listeners.add(listener);
    });
  }

  /** Opens a page and waits until it has loaded, the routed page has rendered and its fonts (icons) are ready. */
  async goto(path, readySelector = '.page, .auth-layout') {
    const loaded = this.nextEvent('Page.loadEventFired');
    await this.send('Page.navigate', { url: base + path });
    await loaded;
    await this.waitForSelector(readySelector);
    await this.waitFor(`!document.querySelector('.loading')`, 'page data', 15_000).catch(() => undefined);
    await this.eval('document.fonts.ready.then(() => true)');
    await sleep(500);
  }

  path() {
    return this.eval('location.pathname');
  }

  type(selector, value) {
    return this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) throw new Error('not found: ' + ${JSON.stringify(selector)});
      el.focus();
      el.value = ${JSON.stringify(value)};
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
      return true;
    })()`);
  }

  /** Chooses the <option> whose text contains the given text. */
  select(selector, optionText) {
    return this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      const option = [...el.options].find((o) => o.textContent.includes(${JSON.stringify(optionText)}));
      if (!option) throw new Error('option not found: ' + ${JSON.stringify(optionText)});
      el.value = option.value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
  }

  click(selector) {
    return this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) throw new Error('not found: ' + ${JSON.stringify(selector)});
      el.click();
      return true;
    })()`);
  }

  /** Clicks the first element matching the selector whose text contains the given text. */
  clickText(selector, text) {
    return this.eval(`(() => {
      const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => e.textContent.includes(${JSON.stringify(text)}));
      if (!el) throw new Error('not found: ' + ${JSON.stringify(selector)} + ' with text ' + ${JSON.stringify(text)});
      el.click();
      return true;
    })()`);
  }

  /** Saves a PNG. A full-page shot temporarily makes the window as tall as the page, so fixed parts (sidebar) span it. */
  async screenshot(file, { fullPage = true } = {}) {
    let restoreHeight;
    if (fullPage) {
      const { cssContentSize, cssLayoutViewport } = await this.send('Page.getLayoutMetrics');
      const height = Math.ceil(Math.min(cssContentSize.height, 5000));
      if (height > cssLayoutViewport.clientHeight) {
        restoreHeight = cssLayoutViewport.clientHeight;
        await this.send('Emulation.setDeviceMetricsOverride', { width: this.width, height, deviceScaleFactor: 1, mobile: this.width < 768 });
        await sleep(400);
      }
    }
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(outDir, file), Buffer.from(data, 'base64'));
    if (restoreHeight) await this.send('Emulation.setDeviceMetricsOverride', { width: this.width, height: restoreHeight, deviceScaleFactor: 1, mobile: this.width < 768 });
  }

  async login(email, password = 'Demo@123') {
    await this.goto('/login');
    await this.type('input[formcontrolname="email"]', email);
    await this.type('input[formcontrolname="password"]', password);
    await this.click('button[type="submit"]');
    await this.waitFor(`location.pathname !== '/login'`, 'redirect after sign-in');
    await this.waitForSelector('app-user-menu .user-button');
    await sleep(800);
  }

  /** Calls the API from inside the page (with the page's own sign-in cookie), like the app does. */
  api(method, url, body) {
    return this.eval(`fetch(${JSON.stringify(url)}, {
      method: ${JSON.stringify(method)},
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: ${body ? JSON.stringify(JSON.stringify(body)) : 'undefined'},
    }).then(async (r) => ({ status: r.status, data: await r.json().catch(() => null) }))`);
  }

  async noHorizontalScroll() {
    return this.eval('document.documentElement.scrollWidth <= window.innerWidth + 1');
  }

  takeErrors() {
    const errors = this.errors;
    this.errors = [];
    return errors;
  }
}

// ---------- Start Chrome ----------
const port = 9333;
const profile = mkdtempSync(join(tmpdir(), 'dans-ui-'));
// The development certificate is only valid for "localhost". On a network address (present.ps1) people click
// through the browser's certificate warning; this test skips that warning instead.
const certFlags = new URL(base).hostname === 'localhost' ? [] : ['--ignore-certificate-errors'];
const chrome = spawn(chromePath, [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--hide-scrollbars', '--mute-audio',
  ...certFlags, 'about:blank',
], { stdio: 'ignore' });

let browserUrl;
for (let i = 0; i < 60 && !browserUrl; i++) {
  try {
    browserUrl = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl;
  } catch {
    await sleep(250);
  }
}
const cdp = new Cdp(browserUrl);
await cdp.open();

async function finish() {
  try { await cdp.send('Browser.close'); } catch { /* already closed */ }
  chrome.kill();
  await sleep(500);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome may still hold files */ }
}

try {
  // ======================================================================
  console.log('Visitor (not signed in)');
  const visitor = await Tab.open(cdp, 'visitor');
  await visitor.goto('/');
  check('home page shows the active demo alert', await visitor.eval(`document.querySelectorAll('app-alert-card').length >= 1`));
  check('alert banner is shown under the top bar', await visitor.eval(`!!document.querySelector('app-alert-banner .alert-banner')`));
  await visitor.screenshot('01-home-visitor.png');
  for (const [path, file, text] of [
    ['/alerts', '02-alerts.png', 'Emergency alerts'],
    ['/evacuation-centers', '03-evacuation-centers.png', 'Evacuation centers'],
    ['/safety-guides', '04-safety-guides.png', 'Safety guides'],
    ['/safety-guides/1', '05-safety-guide-detail.png', 'Before'],
    ['/hotlines', '06-hotlines.png', 'Emergency hotlines'],
    ['/privacy', '07-privacy-notice.png', 'Privacy notice'],
  ]) {
    await visitor.goto(path);
    if (path.includes('evacuation') || path === '/') await sleep(1500); // map tiles
    check(`${path} renders`, await visitor.eval(`document.body.innerText.includes(${JSON.stringify(text)})`));
    await visitor.screenshot(file);
  }
  check('no JavaScript errors on public pages', visitor.takeErrors().length === 0, visitor.errors);

  // Registration with the privacy consent
  await visitor.goto('/register');
  await visitor.click('button[type="submit"]');
  await sleep(300);
  check('empty registration shows field errors', await visitor.eval(`document.querySelectorAll('.error-text').length >= 4`));
  const unique = Date.now();
  await visitor.type('input[formcontrolname="fullName"]', 'Rosa Mae Villanueva');
  await visitor.type('input[formcontrolname="email"]', `rosa${unique}@example.com`);
  await visitor.type('input[formcontrolname="phoneNumber"]', '0918 765 4321');
  await visitor.select('select[formcontrolname="barangayId"]', 'Poblacion');
  await visitor.type('input[formcontrolname="address"]', 'Purok 4');
  await visitor.type('input[formcontrolname="password"]', 'Ligtas-2026');
  await visitor.type('input[formcontrolname="confirmPassword"]', 'Ligtas-2026');
  await visitor.click('button[type="submit"]');
  await sleep(300);
  check('registration is blocked until the privacy notice is accepted',
    (await visitor.path()) === '/register' && (await visitor.eval(`document.body.innerText.includes('Please agree to the privacy notice')`)));
  await visitor.screenshot('08-register-consent-required.png');
  await visitor.click('input[formcontrolname="acceptPrivacyNotice"]');
  await visitor.click('button[type="submit"]');
  await visitor.waitFor(`location.pathname === '/'`, 'home after registering');
  await visitor.waitForSelector('app-user-menu .user-button');
  check('new resident is signed in after registering', await visitor.eval(`document.querySelector('app-user-menu').innerText.includes('Rosa Mae')`));
  visitor.takeErrors();

  // A signed-in user is sent away from /login; sign out first to capture the page.
  await visitor.api('POST', '/api/auth/logout');
  await visitor.goto('/login', '.auth-layout');
  await visitor.screenshot('09-sign-in.png');

  // ======================================================================
  console.log('Resident');
  const resident = await Tab.open(cdp, 'resident');
  await resident.login('resident@dans.local');
  check('resident lands on the home page', (await resident.path()) === '/');
  await resident.screenshot('10-home-resident.png');

  await resident.goto('/report');
  await resident.clickText('label.choice', 'Flood');
  await resident.clickText('label.choice', 'High');
  await resident.type('input[formcontrolname="location"]', 'Purok 6, beside the day-care center');
  await resident.type('textarea[formcontrolname="description"]', 'Flood water is knee-deep on the road and still rising. Two elderly residents need help leaving their house.');
  await resident.type('input[formcontrolname="peopleAffected"]', '6');
  await sleep(1200);
  await resident.screenshot('11-report-form.png');
  await resident.click('button[type="submit"]');
  await resident.waitFor(`/^\\/reports\\/\\d+$/.test(location.pathname)`, 'report detail after submitting');
  await resident.waitForText('RPT-');
  const reportPath = await resident.path();
  check('report submitted and opened with a reference number', /^\/reports\/\d+$/.test(reportPath));
  await sleep(600);
  await resident.screenshot('12-report-detail-resident.png');
  await resident.goto('/my-reports');
  check('report appears in My reports as Pending', await resident.eval(`document.querySelector('.report-list').innerText.includes('Pending')`));
  await resident.screenshot('13-my-reports.png');
  check('no JavaScript errors for the resident', resident.takeErrors().length === 0, resident.errors);

  // ======================================================================
  console.log('Official');
  const official = await Tab.open(cdp, 'official');
  await official.login('official@dans.local');
  check('official lands on the dashboard', (await official.path()) === '/dashboard');
  await official.waitForSelector('.stat-row');
  await official.screenshot('14-dashboard.png');
  await official.goto('/monitor');
  await sleep(1500);
  check('new report is on the incident monitor', await official.eval(`document.querySelector('.board').innerText.includes('beside the day-care center')`));
  await official.screenshot('15-incident-monitor.png');

  // Verify the report with "alert residents" → the resident gets the real-time popup.
  await resident.goto('/');
  await official.goto(reportPath);
  await official.select('select[formcontrolname="status"]', 'Verified');
  await sleep(200);
  check('"Alert residents" is offered and ticked for a flood', await official.eval(`document.querySelector('input[formcontrolname="notifyResidents"]')?.checked === true`));
  await official.screenshot('16-report-detail-official.png');
  await official.clickText('button', 'Save update');
  await official.waitForText('An alert for this incident is active');
  await resident.waitForSelector('app-incoming-alert [role="alertdialog"]', 8000);
  check('resident sees the emergency popup in real time', await resident.eval(`document.querySelector('app-incoming-alert').innerText.includes('Flood emergency')`));
  await resident.screenshot('17-incoming-alert-popup.png', { fullPage: false });
  await resident.clickText('app-incoming-alert button', 'I understand');
  await resident.goto(reportPath);
  check('resident sees the report as Verified', await resident.eval(`document.querySelector('.page-header').innerText.includes('Verified')`));

  // Confirmation dialog when lifting an alert (cancelled, so nothing changes).
  await official.goto('/alerts');
  const activeBefore = await official.eval(`document.querySelectorAll('app-alert-card').length`);
  await official.clickText('button', 'Lift alert');
  await official.waitForSelector('app-confirm-dialog [role="alertdialog"]');
  check('lifting an alert asks for confirmation', await official.eval(`document.querySelector('app-confirm-dialog').innerText.includes('Lift this alert?')`));
  check('focus starts on Cancel (the safe choice)', await official.eval(`document.activeElement?.textContent.trim() === 'Cancel'`));
  await official.screenshot('18-confirm-dialog.png', { fullPage: false });
  await official.clickText('app-confirm-dialog button', 'Cancel');
  await sleep(400);
  check('cancelling keeps the alert active', (await official.eval(`document.querySelectorAll('app-alert-card').length`)) === activeBefore
    && !(await official.eval(`!!document.querySelector('app-confirm-dialog [role="alertdialog"]')`)));

  await official.goto('/alerts/new');
  await official.type('input[formcontrolname="title"]', 'Landslide Warning for Upland Puroks');
  await official.select('select[formcontrolname="type"]', 'Landslide');
  await official.type('textarea[formcontrolname="message"]', 'Continuous rain has saturated the slopes above the upland puroks. Cracks were reported on the barangay road.');
  await official.clickText('button', 'tips');
  await official.clickText('.check-grid label', 'Ngan');
  await sleep(300);
  await official.screenshot('19-issue-alert-form.png');
  await official.goto('/records');
  await official.screenshot('20-incident-records.png');
  await official.goto('/evacuation-centers');
  await sleep(1500);
  await official.screenshot('21-evacuation-centers-official.png');
  await official.goto('/evacuation-centers/1/edit');
  await sleep(1200);
  await official.screenshot('22-evacuation-center-form.png');
  check('no JavaScript errors for the official', official.takeErrors().length === 0, official.errors);

  // ======================================================================
  console.log('Responder');
  const responder = await Tab.open(cdp, 'responder');
  await responder.login('responder@dans.local');
  await responder.goto('/monitor');
  const assigned = await responder.eval(`[...document.querySelectorAll('.incident')].find((a) => a.innerText.includes('Pedro Reyes'))?.getAttribute('href')`);
  check('responder sees the report assigned to them', !!assigned);
  if (assigned) {
    await responder.goto(assigned);
    check('assigned responder gets the quick status buttons', await responder.eval(`document.body.innerText.includes('Your assignment') && document.body.innerText.includes('Mark resolved')`));
    await sleep(800);
    await responder.screenshot('23-report-detail-responder.png');
  }
  check('no JavaScript errors for the responder', responder.takeErrors().length === 0, responder.errors);

  // ======================================================================
  console.log('Administrator');
  const admin = await Tab.open(cdp, 'admin');
  await admin.login('admin@dans.local', 'Admin@123');
  await admin.goto('/admin/users');
  await admin.screenshot('24-users.png');
  await admin.goto('/admin/barangays');
  await admin.screenshot('25-barangays.png');
  check('no JavaScript errors for the administrator', admin.takeErrors().length === 0, admin.errors);

  // A deactivated user's live connection is closed at once (not only their HTTP requests).
  console.log('Session revocation (real-time connection)');
  const volunteer = await Tab.open(cdp, 'volunteer');
  await volunteer.login('volunteer@dans.local');
  await volunteer.waitFor(`document.querySelector('.live')?.classList.contains('on')`, 'live connection');
  const volunteerId = await volunteer.eval(`fetch('/api/auth/me').then((r) => r.json()).then((u) => u.id)`);
  const hubSockets = () => [...volunteer.sockets.values()].filter((s) => s.url.includes('/hubs/notifications'));
  const signedInSockets = hubSockets().filter((s) => !s.closed); // opened while signed in
  check('volunteer has an open real-time connection', signedInSockets.length > 0);
  const deactivated = await admin.api('PUT', `/api/users/${volunteerId}/status`, { isActive: false });
  check('admin deactivates the volunteer', deactivated.status === 200, deactivated);
  const end = Date.now() + 6000;
  while (Date.now() < end && !signedInSockets.every((s) => s.closed)) await sleep(100);
  check("the server closes the deactivated user's live connection immediately", signedInSockets.every((s) => s.closed));
  // (The app then reconnects as a visitor, which only receives public alerts.)
  await volunteer.waitFor(`location.pathname === '/login'`, 'sign-in page after deactivation', 15_000).catch(() => undefined);
  check('the deactivated user is sent to the sign-in page', (await volunteer.path()) === '/login');
  await admin.api('PUT', `/api/users/${volunteerId}/status`, { isActive: true });

  // ======================================================================
  console.log('Connection problems');
  const offline = await Tab.open(cdp, 'offline');
  await offline.send('Network.setBlockedURLs', { urls: ['*/api/alerts*'] });
  await offline.goto('/');
  await offline.waitForSelector('.banner-offline');
  check('home warns that alerts cannot be checked (no false "all clear")',
    await offline.eval(`document.body.innerText.includes('Could not check for new alerts') && !document.body.innerText.includes('No active alerts')`));
  await offline.screenshot('26-alerts-unavailable.png', { fullPage: false });
  await offline.goto('/alerts');
  check('alerts page shows an error with Try again instead of "No active alerts"',
    await offline.eval(`!!document.querySelector('app-load-error') && !document.body.innerText.includes('No active alerts')`));

  // ======================================================================
  console.log('Mobile layout (390 x 844)');
  const phone = await Tab.open(cdp, 'phone', { width: 390, height: 844, mobile: true });
  await phone.goto('/');
  check('home fits the phone screen (no sideways scrolling)', await phone.noHorizontalScroll());
  await phone.screenshot('27-mobile-home.png');
  await phone.click('.menu-btn');
  await sleep(400);
  check('menu button opens the navigation', await phone.eval(`document.querySelector('.shell').classList.contains('nav-open')`));
  await phone.screenshot('28-mobile-menu.png', { fullPage: false });
  for (const path of ['/alerts', '/evacuation-centers', '/hotlines', '/register']) {
    await phone.goto(path);
    check(`${path} fits the phone screen`, await phone.noHorizontalScroll());
  }
  await phone.login('resident@dans.local');
  await phone.goto('/report');
  check('report form fits the phone screen', await phone.noHorizontalScroll());
  await sleep(1000);
  await phone.screenshot('29-mobile-report-form.png');
  check('no JavaScript errors on mobile', phone.takeErrors().length === 0, phone.errors);
} catch (error) {
  failures++;
  console.log('  FAIL', error.message);
} finally {
  await finish();
}

console.log(failures === 0 ? '\nALL UI CHECKS PASSED' : `\n${failures} UI CHECK(S) FAILED`);
console.log(`Screenshots: ${outDir}`);
process.exit(failures === 0 ? 0 : 1);
