// End-to-end test of the DANS API over HTTPS: sign-in sessions, security protections, roles, the full report
// lifecycle, alerts, evacuation centers, notifications and user management.
//
// Usage (with the API running):  node tests/api-smoke-test.mjs [baseUrl]
// Requires the demo data (Seed:DemoData = true). It ADDS test records (reports, alerts, a test user), so run it on a
// development database only. It restores the demo passwords, assignments and evacuation centers it changes, so it can
// be run again. Delete backend/Dans.Api/dans.db afterwards for a clean demo.
import { X509Certificate } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import https from 'node:https';
import { fileURLToPath } from 'node:url';

// The ASP.NET Core development certificate is a self-signed leaf certificate. Recent Node versions no longer accept
// such a certificate as a trust anchor (NODE_EXTRA_CA_CERTS / --use-system-ca fail with DEPTH_ZERO_SELF_SIGNED_CERT),
// so the test PINS it instead: every HTTPS response must come from exactly the exported development certificate.
const certFile = fileURLToPath(new URL('../frontend/certs/localhost.pem', import.meta.url));
if (!existsSync(certFile)) {
  console.error('Development certificate not found. Run "npm start" in frontend once (it exports frontend/certs/localhost.pem).');
  process.exit(1);
}
const pinnedFingerprint = new X509Certificate(readFileSync(certFile)).fingerprint256;
// No TLS session resumption: a resumed session does not present the certificate again, so it could not be checked.
const agent = new https.Agent({ maxCachedSessions: 0, rejectUnauthorized: false });

const base = process.argv[2] ?? 'https://localhost:7180';
const httpBase = process.argv[3] ?? base.replace('https://', 'http://').replace(':7180', ':5180');
let failures = 0;

/** A signed-in client: holds the session cookie like a browser would. */
class Session {
  constructor(cookie, user) { this.cookie = cookie; this.user = user; }
}

function cookieFrom(headers) {
  const raw = headers.getSetCookie().find((c) => c.startsWith('__Host-dans_auth='));
  return raw ? { header: raw, pair: raw.split(';')[0] } : null;
}

/** HTTPS request that only trusts the pinned development certificate. Resolves with status, headers and body text. */
function request(url, { method, headers, body }) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method, headers, agent }, (res) => {
      const peer = res.socket.getPeerX509Certificate?.();
      if (!peer || peer.fingerprint256 !== pinnedFingerprint) {
        res.destroy();
        reject(new Error('The server certificate does not match frontend/certs/localhost.pem. Delete frontend/certs and run "npm start" once to re-export it.'));
        return;
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const responseHeaders = new Headers();
        for (let i = 0; i < res.rawHeaders.length; i += 2) responseHeaders.append(res.rawHeaders[i], res.rawHeaders[i + 1]);
        resolve({ status: res.statusCode, headers: responseHeaders, text: Buffer.concat(chunks).toString('utf8') });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function call(method, path, { session, body, csrf = true, headers = {}, waitOnLimit = true } = {}) {
  const payload = body ? JSON.stringify(body) : undefined;
  const res = await request(base + path, {
    method,
    headers: {
      ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
      ...(csrf ? { 'X-Requested-With': 'XMLHttpRequest' } : {}),
      ...(session ? { Cookie: session.cookie } : {}),
      ...headers,
    },
    body: payload,
  });
  // Sign-in and registration are limited to 20 requests a minute per IP. This test makes more than that, so it
  // waits for the next one-minute window instead of failing.
  if (res.status === 429 && waitOnLimit && path.startsWith('/api/auth/')) {
    console.log('  ...  sign-in rate limit reached (as designed); waiting 61 seconds for the next window');
    await new Promise((resolve) => setTimeout(resolve, 61_000));
    return call(method, path, { session, body, csrf, headers, waitOnLimit: false });
  }
  let data = null;
  try { data = res.text ? JSON.parse(res.text) : null; } catch { data = res.text; }
  return { status: res.status, data, headers: res.headers, cookie: cookieFrom(res.headers) };
}

function check(name, condition, extra) {
  if (condition) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name}`, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ''); }
}

async function login(email, password = 'Demo@123') {
  const r = await call('POST', '/api/auth/login', { body: { email, password } });
  if (r.status !== 200 || !r.cookie) throw new Error(`login ${email} failed: ${r.status} ${JSON.stringify(r.data)}`);
  return Object.assign(new Session(r.cookie.pair, r.data.user), { setCookie: r.cookie.header, body: r.data });
}

console.log('HTTPS and security headers');
const redirect = await fetch(`${httpBase}/api/alerts`, { redirect: 'manual' });
check('plain HTTP is redirected to HTTPS', [307, 308].includes(redirect.status) && redirect.headers.get('location')?.startsWith('https://'), redirect.status);
const pub = await call('GET', '/api/alerts');
check('security headers on API responses',
  pub.headers.get('x-content-type-options') === 'nosniff' && pub.headers.get('x-frame-options') === 'DENY'
  && pub.headers.get('content-security-policy')?.includes("default-src 'none'") && pub.headers.get('cache-control') === 'no-store',
  Object.fromEntries(pub.headers));
check('server software is not advertised', !pub.headers.get('server'), pub.headers.get('server'));

console.log('Sign-in sessions');
const official = await login('official@dans.local');
const resident = await login('resident@dans.local');
const responder = await login('responder@dans.local');
const volunteer = await login('volunteer@dans.local');
const admin = await login('admin@dans.local', 'Admin@123');
check('login returns the user but no token in the body', official.body.user.role === 'Official' && !('token' in official.body), official.body);
check('session cookie is __Host-, HttpOnly, Secure, SameSite=Strict',
  /HttpOnly/i.test(official.setCookie) && /Secure/i.test(official.setCookie) && /SameSite=Strict/i.test(official.setCookie) && /Path=\//i.test(official.setCookie),
  official.setCookie);

const anonymous = await call('GET', '/api/auth/session');
check('session endpoint for visitors returns no user', anonymous.status === 200 && anonymous.data.user === null, anonymous);
const me = await call('GET', '/api/auth/session', { session: resident });
check('session endpoint recognises the cookie', me.data.user?.email === 'resident@dans.local', me.data);
const forged = await call('GET', '/api/auth/me', { session: new Session('__Host-dans_auth=not-a-real-token') });
check('forged cookie is rejected (401)', forged.status === 401, forged.status);

const bad = await call('POST', '/api/auth/login', { body: { email: 'official@dans.local', password: 'Wrong-pass1' } });
check('wrong password -> 401 with generic message', bad.status === 401 && bad.data?.detail === 'Invalid email or password.', bad);
const unknown = await call('POST', '/api/auth/login', { body: { email: 'nobody@dans.local', password: 'Wrong-pass1' } });
check('unknown email gives the same message', unknown.status === 401 && unknown.data?.detail === 'Invalid email or password.', unknown);

console.log('Cross-site request forgery protection');
const noHeader = await call('POST', '/api/reports', { session: resident, csrf: false, body: {} });
check('change without X-Requested-With header is blocked (403)', noHeader.status === 403, noHeader);
const evilOrigin = await call('POST', '/api/auth/logout', { session: resident, headers: { Origin: 'https://evil.example' } });
check('change from a foreign Origin is blocked (403)', evilOrigin.status === 403, evilOrigin.status);

console.log('Registration and passwords');
const weak = await call('POST', '/api/auth/register', {
  body: { fullName: 'Weak Pass', email: `weak${Date.now()}@example.com`, phoneNumber: '09171234567', password: 'password1', barangayId: 9 },
});
check('weak password rejected on registration', weak.status === 400 && JSON.stringify(weak.data).includes('uppercase'), weak.data);
const common = await call('POST', '/api/auth/register', {
  body: { fullName: 'Common Pass', email: `common${Date.now()}@example.com`, phoneNumber: '09171234567', password: 'Password123', barangayId: 9 },
});
check('very common password rejected', common.status === 400 && JSON.stringify(common.data).includes('too common'), common.data);
const invalid = await call('POST', '/api/auth/register', { body: { fullName: 'X', email: 'not-an-email', phoneNumber: '123', password: 'short' } });
check('invalid registration -> 400 validation errors', invalid.status === 400 && invalid.data?.errors, invalid);

const unique = Date.now();
const testEmail = `test${unique}@example.com`;
const reg = await call('POST', '/api/auth/register', {
  body: { fullName: 'Test Resident', email: testEmail, phoneNumber: '0917-123-4567', password: 'Sunrise-2026', barangayId: 9, address: 'Purok 1', acceptPrivacyNotice: true },
});
check('register resident (signed in by cookie)', reg.status === 200 && reg.cookie && reg.data.user.role === 'Resident' && reg.data.user.phoneNumber === '09171234567', reg.data);
const otherResident = new Session(reg.cookie.pair, reg.data.user);
const noConsent = await call('POST', '/api/auth/register', {
  body: { fullName: 'No Consent', email: `noconsent${unique}@example.com`, phoneNumber: '09171234567', password: 'Sunrise-2026', barangayId: 9 },
});
check('registration without accepting the privacy notice is rejected (400)', noConsent.status === 400 && JSON.stringify(noConsent.data).includes('privacy notice'), noConsent.data);
const duplicate = await call('POST', '/api/auth/register', {
  body: { fullName: 'Same Email', email: testEmail.toUpperCase(), phoneNumber: '09171234567', password: 'Sunrise-2026', barangayId: 9, acceptPrivacyNotice: true },
});
check('registering an email that is already used -> 409', duplicate.status === 409, duplicate);

console.log('Alerts (public)');
const alerts = await call('GET', '/api/alerts?status=active');
check('active alerts list is public', alerts.status === 200 && alerts.data.length >= 1, alerts);
check('alert dates end in Z and enums are strings', alerts.data[0].issuedAt.endsWith('Z') && alerts.data[0].severity === 'High', alerts.data[0]);
const noAuthCreate = await call('POST', '/api/alerts', { body: {} });
check('visitor cannot issue alerts (401)', noAuthCreate.status === 401, noAuthCreate.status);
const residentCreate = await call('POST', '/api/alerts', { session: resident, body: { title: 'Hello world', message: 'Some message here', type: 'Flood', severity: 'Low', barangayIds: [] } });
check('resident cannot issue alerts (403)', residentCreate.status === 403, residentCreate.status);

console.log('Report lifecycle');
const created = await call('POST', '/api/reports', {
  session: resident,
  body: { type: 'Fire', severity: 'Critical', barangayId: 12, location: 'Purok 5, beside the bakery', description: 'Smoke and fire coming from a two-storey house.', peopleAffected: 5, latitude: 7.67, longitude: 126.09 },
});
check('resident creates report', created.status === 201 && created.data.status === 'Pending' && /^RPT-\d{4}-\d{5}$/.test(created.data.referenceNo), created);
const reportId = created.data.id;
const managerNotes = await call('GET', '/api/notifications?unreadOnly=true', { session: official });
check('official notified about new report', managerNotes.data.some((n) => n.link === `/reports/${reportId}`), managerNotes.data);
const residentList = await call('GET', '/api/reports', { session: resident });
check('resident cannot list all reports (403)', residentList.status === 403, residentList.status);
const forbidden = await call('GET', `/api/reports/${reportId}`, { session: otherResident });
check("resident cannot view someone else's report (403)", forbidden.status === 403, forbidden);
const search = await call('GET', `/api/reports?search=${encodeURIComponent(created.data.referenceNo)}`, { session: official });
check('search by reference number', search.data.items.length === 1 && search.data.items[0].id === reportId, search.data);
const notAssigned = await call('POST', `/api/reports/${reportId}/updates`, { session: responder, body: { status: 'Responding' } });
check('unassigned responder cannot update (403)', notAssigned.status === 403, notAssigned);
const verified = await call('POST', `/api/reports/${reportId}/updates`, { session: official, body: { status: 'Verified', note: 'Confirmed by tanod.', notifyResidents: true } });
check('official verifies report', verified.status === 200 && verified.data.report.status === 'Verified' && verified.data.hasActiveAlert, verified);
const autoAlert = (await call('GET', '/api/alerts?status=active')).data.find((a) => a.reportId === reportId);
check('verification auto-issued an area alert with safety tips', autoAlert && autoAlert.barangays[0].name === 'Poblacion' && autoAlert.instructions?.length > 0, autoAlert);
const assignable = await call('GET', '/api/users/assignable', { session: official });
const responderId = assignable.data.find((u) => u.role === 'Responder').id;
const assigned = await call('PUT', `/api/reports/${reportId}/assignment`, { session: official, body: { assigneeId: responderId } });
check('official assigns responder', assigned.status === 200 && assigned.data.report.assignedToName === 'Pedro Reyes', assigned);
const dismissTry = await call('POST', `/api/reports/${reportId}/updates`, { session: responder, body: { status: 'Dismissed' } });
check('responder cannot dismiss (403)', dismissTry.status === 403, dismissTry);
const responding = await call('POST', `/api/reports/${reportId}/updates`, { session: responder, body: { status: 'Responding', note: 'On the way.' } });
check('assigned responder marks Responding', responding.status === 200 && responding.data.report.status === 'Responding', responding);
const resolved = await call('POST', `/api/reports/${reportId}/updates`, { session: responder, body: { status: 'Resolved', note: 'Fire out.' } });
check('responder resolves report; timeline complete', resolved.status === 200 && resolved.data.report.closedAt && resolved.data.updates.length === 5, resolved.data);
const reopenTry = await call('POST', `/api/reports/${reportId}/updates`, { session: responder, body: { status: 'Responding' } });
check('assigned responder cannot reopen a closed report (403)', reopenTry.status === 403, reopenTry);
const closedNote = await call('POST', `/api/reports/${reportId}/updates`, { session: responder, body: { note: 'Site cleared, team back at base.' } });
check('assigned responder can still add a note to a closed report', closedNote.status === 200 && closedNote.data.report.status === 'Resolved', closedNote);
const badRange = await call('GET', '/api/reports?from=2026-11-10T00:00:00Z&to=2026-11-01T00:00:00Z', { session: official });
check('records filter with start date after end date -> 400', badRange.status === 400, badRange);
check('resolving lifted the automatic alert', !resolved.data.hasActiveAlert && !(await call('GET', '/api/alerts?status=active')).data.some((a) => a.reportId === reportId));

console.log('Alerts, centers, dashboard');
const issued = await call('POST', '/api/alerts', {
  session: official,
  body: { title: 'Flash Flood Warning', message: 'River levels rising quickly near the riverbank.', instructions: 'Evacuate now.', type: 'Flood', severity: 'Critical', barangayIds: [12, 14], expiresAt: new Date(Date.now() + 3600e3).toISOString() },
});
check('official issues alert', issued.status === 201 && issued.data.barangays.length === 2, issued);
const lifted = await call('POST', `/api/alerts/${issued.data.id}/lift`, { session: official });
check('official lifts alert', lifted.status === 200 && !lifted.data.isActive, lifted);
const centers = await call('GET', '/api/evacuation-centers');
const closed = centers.data.find((c) => c.status === 'Closed');
const occ = await call('PATCH', `/api/evacuation-centers/${closed.id}/occupancy`, { session: volunteer, body: { currentOccupancy: 10, status: 'Open' } });
check('volunteer opens a center and updates occupancy', occ.status === 200 && occ.data.status === 'Open', occ);
const closedWithPeople = centers.data.find((c) => c.status === 'Closed' && c.id !== closed.id);
const ghost = await call('PATCH', `/api/evacuation-centers/${closedWithPeople.id}/occupancy`, { session: volunteer, body: { currentOccupancy: 5 } });
check('a closed center cannot be given evacuees (400)', ghost.status === 400, ghost);
const atCapacity = await call('PATCH', `/api/evacuation-centers/${closed.id}/occupancy`, { session: volunteer, body: { currentOccupancy: closed.capacity } });
check('an open center that reaches capacity becomes Full', atCapacity.status === 200 && atCapacity.data.status === 'Full', atCapacity.data);
const spaceAgain = await call('PATCH', `/api/evacuation-centers/${closed.id}/occupancy`, { session: volunteer, body: { currentOccupancy: 3 } });
check('a full center with space again re-opens', spaceAgain.status === 200 && spaceAgain.data.status === 'Open', spaceAgain.data);
const formClosed = await call('PUT', `/api/evacuation-centers/${closedWithPeople.id}`, {
  session: official,
  body: { ...closedWithPeople, currentOccupancy: 12, status: 'Closed' },
});
check('center form rejects a closed center with evacuees (400)', formClosed.status === 400, formClosed);
const reclosed = await call('PATCH', `/api/evacuation-centers/${closed.id}/occupancy`, { session: volunteer, body: { currentOccupancy: 0, status: 'Closed' } });
check('closing a center with 0 evacuees works', reclosed.status === 200 && reclosed.data.status === 'Closed', reclosed.data);
const badHotline = await call('POST', '/api/emergency-contacts', { session: official, body: { name: 'Test hotline', number: 'call the mayor', sortOrder: 50 } });
check('hotline number must be a phone number (400)', badHotline.status === 400, badHotline.data);
const goodHotline = await call('POST', '/api/emergency-contacts', { session: official, body: { name: 'Test hotline', number: '(082) 123-4567', sortOrder: 50 } });
check('hotline with a landline number is accepted', goodHotline.status === 200, goodHotline.data);
if (goodHotline.status === 200) await call('DELETE', `/api/emergency-contacts/${goodHotline.data.id}`, { session: official });
const residentOcc = await call('PATCH', `/api/evacuation-centers/${closed.id}/occupancy`, { session: resident, body: { currentOccupancy: 1 } });
check('resident cannot update occupancy (403)', residentOcc.status === 403, residentOcc.status);
const dash = await call('GET', '/api/dashboard', { session: responder });
check('dashboard for staff', dash.status === 200 && dash.data.byStatus.length === 5, dash.data);
const dashResident = await call('GET', '/api/dashboard', { session: resident });
check('dashboard forbidden for residents (403)', dashResident.status === 403, dashResident.status);
const unknownApi = await call('GET', '/api/does-not-exist');
check('unknown API route returns 404 problem details', unknownApi.status === 404, unknownApi.status);

console.log('Account lockout');
for (let i = 0; i < 5; i++) await call('POST', '/api/auth/login', { body: { email: testEmail, password: 'Wrong-pass1' } });
const locked = await call('POST', '/api/auth/login', { body: { email: testEmail, password: 'Sunrise-2026' } });
check('5 wrong passwords lock the account, even for the right password (423)', locked.status === 423 && locked.data.detail.includes('locked'), locked);

console.log('Session revocation');
const second = await login('volunteer@dans.local');
const logout = await call('POST', '/api/auth/logout', { session: second });
check('logout succeeds and clears the cookie', logout.status === 204 && /expires=Thu, 01 Jan 1970/i.test(logout.cookie?.header ?? ''), logout.cookie);
const reused = await call('GET', '/api/auth/me', { session: second });
check('a signed-out cookie cannot be reused (401)', reused.status === 401, reused.status);
const stillIn = await call('GET', '/api/auth/me', { session: volunteer });
check("signing out one browser keeps the user's other sessions", stillIn.status === 200, stillIn.status);

const promote = await call('PUT', `/api/users/${otherResident.user.id}/role`, { session: admin, body: { role: 'Volunteer' } });
check('admin promotes user to Volunteer', promote.status === 200 && promote.data.role === 'Volunteer', promote);
const stale = await call('GET', '/api/auth/me', { session: otherResident });
check('role change signs the user out immediately (401)', stale.status === 401, stale.status);
const assignedBefore = (await call('GET', '/api/reports?activeOnly=true&pageSize=200', { session: official })).data.items.filter((r) => r.assignedToId === responder.user.id);
const deactivate = await call('PUT', `/api/users/${responder.user.id}/status`, { session: admin, body: { isActive: false } });
const afterDeactivate = await call('GET', '/api/auth/me', { session: responder });
check('deactivation signs the user out immediately (401)', deactivate.status === 200 && afterDeactivate.status === 401, afterDeactivate.status);
const assignedAfter = (await call('GET', '/api/reports?activeOnly=true&pageSize=200', { session: official })).data.items.filter((r) => r.assignedToId === responder.user.id);
check('deactivating a responder unassigns their open reports', assignedBefore.length > 0 && assignedAfter.length === 0, [assignedBefore.length, assignedAfter.length]);
const released = await call('GET', `/api/reports/${assignedBefore[0]?.id}`, { session: official });
check('the unassignment is recorded in the report timeline', released.data?.updates?.some((u) => u.note?.includes('was deactivated')), released.data?.updates);
const reassignNote = await call('GET', '/api/notifications?unreadOnly=true', { session: official });
check('officials are asked to assign someone else', reassignNote.data.some((n) => n.title.includes('need a new responder')), reassignNote.data);
await call('PUT', `/api/users/${responder.user.id}/status`, { session: admin, body: { isActive: true } });
for (const r of assignedBefore) await call('PUT', `/api/reports/${r.id}/assignment`, { session: official, body: { assigneeId: responder.user.id } });
const sameRole = await call('PUT', `/api/users/${official.user.id}/role`, { session: admin, body: { role: 'Official' } });
const officialStill = await call('GET', '/api/auth/me', { session: official });
check('saving the same role does not sign the user out', sameRole.status === 200 && officialStill.status === 200, [sameRole.status, officialStill.status]);
const selfRole = await call('PUT', `/api/users/${admin.user.id}/role`, { session: admin, body: { role: 'Resident' } });
check('admin cannot change own role', selfRole.status === 400, selfRole);

const residentPhone = await login('resident@dans.local');
const change = await call('POST', '/api/auth/me/password', { session: residentPhone, body: { currentPassword: 'Demo@123', newPassword: 'Bagyo-Ready-77' } });
check('password change succeeds', change.status === 204, change);
const oldDevice = await call('GET', '/api/auth/me', { session: resident });
const currentDevice = await call('GET', '/api/auth/me', { session: residentPhone });
check('password change signs out other devices but keeps this one', oldDevice.status === 401 && currentDevice.status === 200, [oldDevice.status, currentDevice.status]);
// Put the demo resident's password back so the demo accounts keep working and the test can run again.
const restored = await call('POST', '/api/auth/me/password', { session: residentPhone, body: { currentPassword: 'Bagyo-Ready-77', newPassword: 'Demo@123' } });
check('password can be changed back', restored.status === 204, restored);
const everywhere = await call('POST', '/api/auth/logout-all', { session: residentPhone });
const afterEverywhere = await call('GET', '/api/auth/me', { session: residentPhone });
check('sign out everywhere ends all sessions', everywhere.status === 204 && afterEverywhere.status === 401, afterEverywhere.status);

console.log('Notifications');
const count = await call('GET', '/api/notifications/unread-count', { session: official });
check('unread count', count.status === 200 && typeof count.data.count === 'number', count.data);
await call('POST', '/api/notifications/read-all', { session: official });
const count2 = await call('GET', '/api/notifications/unread-count', { session: official });
check('mark all read', count2.data.count === 0, count2.data);

console.log('Rate limiting');
let limited = false;
for (let i = 0; i < 25 && !limited; i++) {
  const attempt = await call('POST', '/api/auth/login', { body: { email: 'nobody@dans.local', password: 'Wrong-pass1' }, waitOnLimit: false });
  limited = attempt.status === 429;
}
check('more than 20 sign-in attempts a minute from one IP are refused (429)', limited);

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
