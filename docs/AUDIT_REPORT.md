# DANS — System Audit, Repair and Test Report

**System:** Disaster Alert and Notification System (DANS) · Angular 22 + ASP.NET Core 10 Web API + SignalR + EF Core (SQLite)
**Date:** November 21, 2026
**Backup of the code before any change:** `Desktop\backups\DANS-before-audit-2026-11-21.tar.gz` (source, settings and the old development database)

---

## 1. What was inspected

Every source file was read before changing anything: 47 backend files (controllers, entities, DTOs, services, SignalR
hub, security middleware, seeding), 62 frontend files (core services, stores, guards, layout, 20 pages, shared
components, global styles), configuration, the README and the existing API test. The system was then built and run, and
the existing API test was run as a baseline.

| Item | Baseline result |
|---|---|
| `dotnet build` | Succeeded, 0 warnings |
| Angular development and production builds | Succeeded; production bundle 440 kB (115 kB compressed), within budget |
| `npm audit` / `dotnet list package --vulnerable` | 0 known vulnerabilities |
| Existing API test (`tests/api-smoke-test.mjs`) | **Crashed before testing anything** on the installed Node 24.19 (see A-1). After the fix: 54/54 checks passed |

---

## 2. Findings and fixes

Severity: **High** = wrong or unsafe behaviour users would meet; **Medium** = data or security weakness; **Low** = polish.
"Verified by" names the automated check that proves the fix (API = `tests/api-smoke-test.mjs`, UI = `tests/ui-check.mjs`).

| # | Severity | Finding | Fix | Verified by |
|---|---|---|---|---|
| A-1 | High | The API test could not run: newer Node versions no longer trust the self-signed ASP.NET development certificate (`DEPTH_ZERO_SELF_SIGNED_CERT`), so the test crashed after one check. | The test now **pins** the exported certificate (accepts only that exact certificate by its SHA-256 fingerprint). | API (runs again) |
| A-2 | **High (safety)** | If the alert list could not be loaded (server down, network lost), the Home page said **"No active alerts — all clear"** and the Alerts page said "No active alerts". In a disaster system a failed check must never look like an all-clear. | The alert store now records the error and keeps the last known alerts. Home shows "Could not check for new alerts… call 911" with **Try again**, the top banner shows "Cannot check for alerts right now", and the Alerts page shows an error panel instead of "No active alerts". | UI "Connection problems" |
| A-3 | High | Pages that failed to load showed misleading states: the Dashboard and Users pages spun "Loading…" forever, Records showed a blank card, the Incident monitor showed empty columns ("Nothing here"), and Centers/Hotlines/Notifications/My reports showed "none yet". | A shared `app-load-error` panel (message + Try again) on all of these pages; when older data is already on screen, a warning says it may be out of date. | UI, manual review |
| A-4 | High | An alert with an end time (`expiresAt`) stayed on the banner, Home page and sidebar count after it ended, until some other event refreshed the list (possibly hours). | The store schedules a reload just after the next alert ends, and refreshes every 2 minutes as a safety net. | Code review |
| A-5 | Medium | An assigned responder or volunteer could **reopen a resolved or dismissed report** (set it back to Responding), which also cleared its closing time. | Only officials and administrators can change the status of a closed report; assigned staff can still add notes. | API "cannot reopen a closed report", "can still add a note" |
| A-6 | Medium | When a responder/volunteer was **deactivated or changed to Resident**, their open reports stayed assigned to them. Nobody else except officials could update them, and the monitor showed an assignee who could no longer act. | Their open reports are unassigned automatically, each timeline records why, and officials get a notification listing the reports to reassign. | API "unassigns their open reports", "recorded in the timeline", "officials are asked to assign someone else" |
| A-7 | Medium (security) | Revoking a session (sign-out, password change, role change, deactivation) blocked further HTTP requests, but a **real-time WebSocket opened earlier stayed connected** and kept receiving staff-only events (e.g. reporters' names and phone numbers) until the browser closed it. | New `HubConnectionRegistry` remembers which session opened each connection; the server closes those connections the moment the session ends. Connections also close when the sign-in token expires (`CloseOnAuthenticationExpiration`). | UI "the server closes the deactivated user's live connection immediately" |
| A-8 | Medium | Evacuation-center data could be inconsistent: a **Closed** center could hold evacuees (counted in the dashboard total), and the add/edit form allowed an **Open** center above capacity (only the quick update switched it to Full). The dashboard's "room for 980" was really total capacity, not free space. | Server rules: a Closed center must have 0 evacuees (clear error message; the quick editor sets 0 when Closed is chosen); an Open center that reaches capacity becomes Full in every path. Dashboard now shows the free places left. | API "closed center cannot be given evacuees", "becomes Full", "re-opens", "form rejects…"; UI screenshot |
| A-9 | Medium (privacy) | Registration collected name, email, mobile number, barangay and address with **no privacy notice or consent** (Data Privacy Act of 2012, RA 10173). | New `/privacy` page describing exactly what DANS stores, why, who can see it, outside services and the user's rights. Registration requires ticking the consent box (checked on the server too) and the consent time is stored in `Users.PrivacyConsentAt`. | API "registration without accepting the privacy notice is rejected"; UI "blocked until the privacy notice is accepted" |
| A-10 | Medium | Two registrations with the same email at the same moment made the unique index throw → **HTTP 500**. | Caught and answered with 409 "An account with this email address already exists." | API "email that is already used -> 409" |
| A-11 | Medium | Hotline numbers and evacuation-center contact numbers accepted any text (e.g. "call the mayor"), producing broken tap-to-call links. | Validation on the client and server: digits, spaces, +, - and parentheses, at least 3 digits (911, (082) 123-4567, 0917 123 4567). | API "hotline number must be a phone number", "landline number is accepted" |
| A-12 | Low | Incident records accepted a "From" date after the "To" date (silently returned nothing). | Server returns 400 with a clear message; the date pickers limit each other and the page explains the problem. | API "start date after end date -> 400" |
| A-13 | Low | Destructive and broadcast actions used the browser's plain `confirm()` box (10 places: send alert, lift alert, dismiss report, delete center/guide/hotline/barangay, change role, deactivate user, sign out everywhere), which cannot be styled and said little about consequences. | Reusable accessible confirmation dialog (`ConfirmService` + `app-confirm-dialog`): explains what will happen, red button for dangerous actions, focus starts on Cancel, Tab stays inside, Escape cancels, focus returns afterwards. | UI "asks for confirmation", "focus starts on Cancel", "cancelling keeps the alert active" |
| A-14 | Low | "Report verified — an alert was sent" was shown even when no alert was sent (one was already active). | The message reflects what the server actually did. | Code review |
| A-15 | Low | Saving a user's role unchanged still signed them out everywhere. | No change → no sign-out. | API "saving the same role does not sign the user out" |
| A-16 | Low | Barangay rename could only be saved with the Enter key (no visible button). | Save button added. | Manual review |
| A-17 | Low | Safety-guide requests had no limit on the number or length of tips. | At most 30 tips per phase, 500 characters per tip. | Code review |
| A-18 | Low | The database was created with `EnsureCreated()` only, which never updates an existing database; any schema change meant deleting data. | `SchemaUpgrades` applies small idempotent changes at start-up (first one: `PrivacyConsentAt`), with the same change as a SQL script in `database/migrations/`. `dotnet run -- --export-schema` writes the full CREATE scripts for SQLite and SQL Server. Tested by upgrading a database created before the change: the column was added and all data kept. | Startup log "Database upgraded: added column Users.PrivacyConsentAt" |
| A-19 | Low | The API test changed the demo resident's password, so it could only run once per database, and its many sign-ins tripped the API's own rate limit. | The test restores what it changes, waits for the rate-limit window when needed, and now also checks that the limit works. | API (passes 3 times in a row on one database) |

---

## 3. Reviewed and found sound (no change needed)

- **Passwords:** PBKDF2 hashing (ASP.NET Core Identity), strength rules on both sides, common passwords rejected, lockout after 5 wrong attempts, the same answer and timing for unknown emails.
- **Sessions:** JWT only inside a `__Host-` HttpOnly, Secure, SameSite=Strict cookie, checked against a server-side session on every request; sliding expiry.
- **CSRF, headers, transport:** custom-header + Origin check on every change, Content-Security-Policy and other security headers, HTTPS redirect, HSTS in production, 1 MB request limit, no `Server` header.
- **Authorization:** role checks on every endpoint; residents only see their own reports. All permission rules are covered by the API test.
- **SQL injection / XSS:** only EF Core parameterised queries (LIKE patterns are escaped); Angular escapes all output, map tooltips use `textContent`; CSV export guards against formula injection.
- **Production safety:** the API refuses to start without a real JWT key or with a weak first-admin password; demo accounts and the demo sign-in buttons exist only in Development.
- **Performance:** queries project only needed columns, lists are paged, indexes exist on report status/date, notifications (user, read) and alert date. The production bundle is small and pages are lazy-loaded.

## 4. Technology decisions

No framework or library was upgraded. Angular 22.3 and the .NET 11 packages are available, but there is no
vulnerability or bug they fix for DANS, and .NET 10 is the long-term-support release the project already targets.
Replacing `EnsureCreated()` with full EF Core migrations was considered and rejected for now: it needs a separate
migration set per database provider and adds tooling students must learn; the small `SchemaUpgrades` step gives the
same "no data loss" result for this project's needs.

---

## 5. Test results (final run, fresh development database)

| Test | Result |
|---|---|
| `dotnet build` (backend) | Succeeded — 0 warnings, 0 errors |
| `ng build` production (frontend) | Succeeded — 440 kB initial (115 kB compressed), no budget warnings |
| `tsc --noUnusedLocals --noUnusedParameters` | No issues |
| `node tests/api-smoke-test.mjs` | **71 / 71 passed** (also passed three runs in a row on the same database) |
| `node tests/ui-check.mjs` (headless Chrome) | **43 / 43 passed**, 29 screenshots in `docs/screenshots/` |
| `npm audit`, `dotnet list package --vulnerable` | 0 known vulnerabilities |

## 6. Feature verification checklist

Status: ✅ verified working by an automated test · 🟡 works, with a limitation noted in section 8.

| Objective / module | Status | How it was verified |
|---|---|---|
| Sign-in, registration (with privacy consent), sign-out, sign out everywhere, password change, lockout | ✅ | API + UI |
| Role-based access (Resident, Volunteer, Responder, Official, Admin) | ✅ | API (every role's allowed and refused actions) |
| Real-time alert popup for residents of the affected barangay | ✅ | UI (official verifies → resident's popup appears) |
| Automatic area alert on verification; lifted on resolve/dismiss | ✅ | API |
| Issue and lift alerts (with confirmation) | ✅ | API + UI |
| Alert delivery to people who are not using DANS at that moment | 🟡 | Saved to their inbox only; no SMS/push (section 8) |
| Evacuation centers: list, map, occupancy updates, capacity rules, notify residents when a center opens | ✅ | API + UI |
| Safety guides and hotlines (public read, official edit) | ✅ | API + UI |
| Report an emergency (map pin, rate limit), My reports, timeline | ✅ | API + UI |
| Incident monitor (live), assignment, responder updates | ✅ | API + UI |
| Dashboard and incident records (filters, paging, CSV export) | ✅ | API + UI (export endpoint by API) |
| Notifications inbox and bell | ✅ | API + UI |
| User and barangay administration | ✅ | API + UI |
| Responsive layout (390 px phone) | ✅ | UI (no sideways scrolling on 6 pages, menu opens) |
| SQL Server provider | 🟡 | Schema script generated; not run against a SQL Server in this audit |
| Production deployment (IIS/Kestrel with a real certificate) | 🟡 | Production build compiled; not deployed in this audit |

## 7. Files changed

**Added (13):**
`backend/Dans.Api/Hubs/HubConnectionRegistry.cs`, `backend/Dans.Api/Data/SchemaUpgrades.cs`,
`backend/Dans.Api/Data/SchemaExport.cs`, `backend/Dans.Api/Infrastructure/MustBeTrueAttribute.cs`,
`frontend/src/app/core/confirm.service.ts`, `frontend/src/app/layout/confirm-dialog.ts`,
`frontend/src/app/shared/load-error.ts`, `frontend/src/app/features/privacy/privacy-page.ts`,
`database/schema.sqlite.sql`, `database/schema.sqlserver.sql`, `database/migrations/001_add_privacy_consent.sql`,
`tests/ui-check.mjs`, `docs/` (this report, the system proposal and `docs/screenshots/`).

**Modified — backend (16):** `Program.cs`; `Controllers/` Auth, Barangays, Dashboard, EvacuationCenters, Reports,
SafetyGuides, Users; `Data/DbSeeder.cs`; `Dtos/AuthDtos.cs`, `Dtos/SafetyDtos.cs`; `Hubs/NotificationHub.cs`;
`Infrastructure/Text.cs`; `Models/Enums.cs`, `Models/User.cs`; `Services/AuthSessionService.cs`.

**Modified — frontend (33):** `app.ts`, `app.routes.ts`, `styles.css`; `core/` alerts-store, models, validators;
`layout/` alert-banner, shell.html; `features/` admin (barangays, users), alerts (alert-form, alerts-page .ts/.html),
auth (auth-brand, register .ts/.html), dashboard (.ts/.html), evacuation (center-form .ts/.html, centers-page .ts/.html),
guides/guide-form, home/home.html, hotlines, monitor (.ts/.html), notifications, profile, records (.ts/.html),
reports (my-reports, report-detail).

**Modified — other:** `README.md`, `tests/api-smoke-test.mjs`.

**Removed:** none. No working feature was removed.

**Database change:** one new nullable column, `Users.PrivacyConsentAt` (applied automatically; script in `database/migrations/`).

## 8. Remaining limitations and unresolved items

1. **Offline delivery:** alerts reach people who have DANS open (any tab) and are saved to every affected user's inbox, but there is no SMS or phone push notification. An SMS gateway (e.g. Semaphore) or Web Push would be needed to reach phones that are not using DANS.
2. **Forgotten passwords:** there is no "forgot password" (no email/SMS service) and administrators cannot reset a password. A user who forgets it needs a new account. Recommended next feature: an administrator-issued temporary password.
3. **Data subject requests:** users can correct their details, but deleting an account or report must be done by an administrator directly in the database; administrators can only deactivate accounts in the app. There is no automatic retention period for incident records.
4. **Single server:** the real-time connection registry and rate limits are kept in memory, which is correct for one server. Running several API servers would need a SignalR backplane (e.g. Redis).
5. **Account lockout can be triggered by someone else** typing wrong passwords for a known email (a standard trade-off of lockout); it lasts 15 minutes.
6. **Not tested in this audit:** SQL Server, a real production deployment, real phones (only a 390 px emulated viewport in Chrome), and browsers other than Chrome.
7. **Sample data:** demo evacuation centers, coordinates, reports and `0900…` phone numbers are invented for the demonstration; only 911 and the Red Cross 143 are real hotlines. Replace them with MDRRMO data before real use.
8. **Internet needed** for map tiles (OpenStreetMap) and fonts/icons (Google Fonts).
9. The master instruction's Shackman ISP modules (GCash, MikroTik, subscriber billing) do not apply to DANS and were intentionally not added.

## 9. Maintenance recommendations

- Run both tests after every change (`node tests/api-smoke-test.mjs`, then `node tests/ui-check.mjs`) and keep the counts in the README current.
- For every future database change, add an idempotent step to `Data/SchemaUpgrades.cs`, a matching script in `database/migrations/`, and re-export the schema.
- Keep the privacy notice (`/privacy`) in step with any change to the personal data DANS collects or shows.
- Review package updates each semester (`npm outdated`, `dotnet list package --outdated`) and apply security fixes promptly.
- Back up `dans.db` (or the SQL Server database) daily in production; it holds the incident records.
