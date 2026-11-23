# DANS — Disaster Alert and Notification System

Legacy College of Compostela · Institute of Information Technology

DANS warns residents of the Municipality of Compostela, Davao de Oro the moment a flood, earthquake, landslide,
fire or other emergency is confirmed. It shows where to evacuate and what to do, lets anyone report an emergency,
and gives officials and responders one place to monitor and resolve incidents.

- **Frontend:** Angular 22 (standalone components, signals, zoneless), Leaflet + OpenStreetMap, SignalR client
- **Backend:** ASP.NET Core 10 Web API, Entity Framework Core 10, SignalR, JWT in HttpOnly cookies with server-side sessions
- **Database:** SQLite by default (zero setup); SQL Server supported by changing one setting
- **Security:** HTTPS everywhere, cookie sessions JavaScript cannot read, CSRF protection, account lockout,
  Content-Security-Policy and other security headers (see [Security measures](#security-measures))

---

## How DANS meets each objective

| Objective | What the system does |
|---|---|
| Real-time alerts when a disaster or emergency is reported | Alerts are pushed through SignalR (WebSockets). Users in the target area see a full-screen alert with an alarm sound, and a desktop notification if the tab is in the background. A banner stays at the top of every page while an alert is active. |
| Automatically notify residents in their area | Every resident registers with a barangay. Alerts target one or more barangays (or the whole municipality) and reach only the people living there. When an official **verifies** a report, DANS automatically issues an area alert with safety tips for that hazard. The alert is **lifted automatically** when the report is resolved or dismissed. Residents are also notified when an evacuation center in their barangay opens. |
| Evacuation and safety instructions | Evacuation centers page with map, live capacity meters, facilities, contact person and Google Maps directions. Safety guides list what to do before, during and after each hazard; officials can insert a guide's tips into an alert with one click. There is also a tap-to-call hotlines page. |
| Report emergencies through the system | A guided report form (type, severity, barangay, landmark, description, people affected) with an optional map pin or "use my location". Every report gets a reference number such as `RPT-2026-00012`. |
| Help officials monitor reports and their status | A live **incident monitor** shows a map and Pending / Verified / Responding columns. Officials verify or dismiss reports and assign responders or volunteers; field staff mark incidents Responding or Resolved and add notes. The **dashboard** shows key numbers, charts and evacuation capacity, all updated live. |
| Keep records of incidents for future reference | Every status change, assignment and note is stored in the report's timeline. The **incident records** page searches and filters all reports by date, type, status and barangay, and exports them to CSV for Excel. Past alerts stay in the alert history. |

## User roles

| Role | Can do |
|---|---|
| Resident (anyone who registers) | Receive alerts for their barangay, report emergencies, follow their reports, view centers, guides and hotlines |
| Volunteer / Responder | Everything a resident can do, plus: see all incidents, the dashboard and records; update incidents assigned to them; update evacuation center counts |
| Official | Everything above, plus: verify, dismiss and assign reports; issue and lift alerts; manage evacuation centers, safety guides and hotlines; export records |
| Admin | Everything above, plus: manage users (change roles, deactivate accounts) and barangays |

Visitors who are not signed in can still read alerts, evacuation centers, safety guides and hotlines.

---

## Running the system

### Requirements

- [.NET 10 SDK](https://dotnet.microsoft.com/download)
- [Node.js](https://nodejs.org/) 22 or newer (npm is included)
- An internet connection for the map tiles and fonts

### 0. Trust the HTTPS development certificate (once per computer)

```powershell
dotnet dev-certs https --trust
```

Click **Yes** in the Windows dialog. Both the API and the Angular dev server use this certificate, so the browser
shows the padlock without warnings.

### 1. Start the backend (API)

```powershell
cd backend\Dans.Api
dotnet run
```

The API listens on **https://localhost:7180** (plain `http://localhost:5180` only redirects to HTTPS). On first start it
creates the SQLite database `dans.db` and fills it with the 16 barangays, safety guides, hotlines, an admin account and
(in Development) demo data.

### 2. Start the frontend

In a second PowerShell window:

```powershell
cd frontend
npm install
npm start
```

`npm install` is only needed the first time. Open **https://localhost:4200**. The first `npm start` exports the development
certificate to `frontend/certs/` (git-ignored). The Angular dev server forwards `/api` and `/hubs` to the API
(see `frontend/proxy.conf.json`), so both must be running.

> Windows PowerShell 5.1 does not support `&&`. Run the commands on separate lines (or join them with `;`).

### Demo accounts (Development only)

| Role | Email | Password |
|---|---|---|
| Admin | admin@dans.local | `Admin@123` |
| Official | official@dans.local | `Demo@123` |
| Responder | responder@dans.local | `Demo@123` |
| Volunteer | volunteer@dans.local | `Demo@123` |
| Resident | resident@dans.local | `Demo@123` |

The sign-in page also has one-click buttons for these accounts in development mode and in presentation mode (below).

### Try the real-time alerts (good for a presentation)

1. Open a normal browser window and sign in as **resident@dans.local** (lives in Barangay Poblacion).
2. Open a private/incognito window and sign in as **official@dans.local**.
3. As the resident, click **Report emergency** and send a report in Poblacion.
4. As the official, the report appears instantly on the **Incident monitor**. Open it, choose **Verified**, keep
   "Alert residents of Poblacion" checked and save.
5. The resident's window immediately shows the emergency popup with an alarm and safety instructions, and the report status updates.
6. As the official, assign the responder; then sign in as **responder@dans.local** and mark it **Resolved**. The area alert
   is lifted automatically and the resident is notified.

### Starting over

Stop the API and delete `backend/Dans.Api/dans.db`. A fresh database with demo data is created on the next start.
Demo data is only added to an empty database. After the demo data changes (for example the evacuation sites), start over
like this to see it.

### Presenting on a local network (instructor access)

Use this when other people, for example your instructor, should open DANS on their own laptop or phone during a
presentation. One server then provides the website, the API and the live updates at a single address.

**Once per computer:** let other devices through Windows Firewall. Open PowerShell with **Run as administrator** and run:

```powershell
New-NetFirewallRule -DisplayName 'DANS presentation (TCP 7180)' -Direction Inbound -Protocol TCP -LocalPort 7180 -RemoteAddress LocalSubnet -Action Allow
```

`LocalSubnet` only lets in devices on the same network. To remove the rule later:
`Remove-NetFirewallRule -DisplayName 'DANS presentation (TCP 7180)'`.

Clicking **Allow access** in the Windows Firewall pop-up for `Dans.Api` also works, but by default only on *private*
networks. School and public Wi-Fi is often set as a *public* network. Each time it starts, `present.cmd` checks the
firewall and says so if other devices would be blocked on the current network.

**Each time:**

1. Stop the normal `dotnet run` and `npm start` servers. Presentation mode uses the same port.
2. Connect this laptop and the other devices to the same Wi-Fi.
3. Double-click **`present.cmd`** in the DANS folder (or run `.\present.ps1`). To start with fresh demo data, run
   `.\present.cmd -Reset`. The first step builds the website, which takes about half a minute.
4. The window shows the addresses, for example:

   ```
   On this computer : https://localhost:7180
   Other devices    : https://192.168.1.8:7180
   ```

   The address changes from network to network, so read it from the window each time.
5. On the other device, type the **whole** address, including `https://`. The browser warns that the connection is not
   private, because the development certificate is only made for `localhost`. The connection is still encrypted.
   - Chrome / Edge: **Advanced** → **Proceed to 192.168.x.x (unsafe)**
   - Safari (iPhone, Mac): **Show Details** → **visit this website**
   - Firefox: **Advanced** → **Accept the Risk and Continue**
6. Sign in with the demo account buttons on the **Sign in** page.
7. Press **Ctrl+C** in the window to stop.

If the other device cannot open the page:

- Check that both devices are on the same Wi-Fi. Use the address that belongs to that connection; the window lists one
  address per network adapter (for example Wi-Fi and Ethernet).
- Check that the firewall rule above was added.
- "Didn't send any data" (ERR_EMPTY_RESPONSE) means the address was typed without `https://`.
- Some school and public Wi-Fi networks stop devices from reaching each other. In that case, turn on a phone's mobile
  hotspot, connect the laptop and the instructor's device to it, and start `present.cmd` again to see the new address.
- The map tiles and fonts come from the internet, so the other device needs internet access for the maps.

Presentation mode uses the Development settings and the same database as `dotnet run`. Anyone on the network who knows
the address can open DANS, and the demo passwords are listed in this README, so stop the server after the presentation.
It is not a real deployment; see "Production build" below for that.

---

## Configuration

Settings live in `backend/Dans.Api/appsettings.json` (overridden by `appsettings.Development.json` while developing).

| Setting | Purpose |
|---|---|
| `Database:Provider` | `Sqlite` (default) or `SqlServer` |
| `ConnectionStrings:Default` | e.g. `Data Source=dans.db`, or for SQL Server LocalDB: `Server=(localdb)\\MSSQLLocalDB;Database=DansDb;Trusted_Connection=True;TrustServerCertificate=True` |
| `Jwt:Key` | Secret used to sign the session token, at least 32 characters. In Development each computer creates its own random key on the first start (`backend/Dans.Api/dev-signing.key`, git-ignored; delete it to sign everyone out). Production **must** set its own (environment variable `Jwt__Key`) or the API refuses to start. |
| `Jwt:ExpiresInHours` | A session ends after this many hours without activity (default 72). It is extended automatically while in use. |
| `Seed:AdminEmail`, `Seed:AdminPassword` | The first administrator, created when the database is empty. Development uses `Admin@123`; in production a strong password is required (`Seed__AdminPassword`) or the API refuses to start. |
| `Seed:DemoData` | `true` adds sample users, reports, alerts and evacuation centers (on in Development only). |
| `AllowedHosts` | Host names the API answers to (default `localhost`). Set your real domain in production, e.g. `dans.example.gov.ph`. |
| `Cors:AllowedOrigins` | Extra origins allowed to send requests (the dev server `https://localhost:4200`). |
| `ReverseProxy:Enabled` | Set to `true` when IIS/nginx terminates HTTPS in front of the API, so the original scheme and client IP are used. |

### Database

The database is created automatically on the first start (`EnsureCreated()`). Later changes to the design are applied
to an existing database **without losing data** by `Data/SchemaUpgrades.cs` (each step is idempotent and also written
as a SQL script in `database/migrations/`). The complete CREATE scripts are in `database/schema.sqlite.sql` and
`database/schema.sqlserver.sql`; regenerate them after changing the entity classes with:

```powershell
cd backend\Dans.Api
dotnet run -- --export-schema ..\..\database
```

In Development only, a database from a much older version of DANS that cannot be upgraded is rebuilt with fresh demo data.

### Production build (one HTTPS address)

```powershell
cd frontend
npm run build
cd ..\backend\Dans.Api
dotnet publish -c Release -o ..\..\publish
```

`npm run build` writes the Angular app into `backend/Dans.Api/wwwroot`, so the API serves the website, the API and the
real-time hub from **one HTTPS origin** with the same security headers. For a quick local check, run `dotnet run` after
the build and open https://localhost:7180.

On the server:

- Set `ASPNETCORE_ENVIRONMENT=Production`, `Jwt__Key` (a long random secret), `Seed__AdminPassword` and `AllowedHosts`.
- Give Kestrel a real TLS certificate (`Kestrel__Certificates__Default__Path` / `__Password`), **or** host behind IIS/nginx
  with HTTPS and WebSockets enabled and set `ReverseProxy__Enabled=true`.
- HSTS (one year) is sent automatically in Production, so browsers will refuse plain HTTP afterwards.

---

## Project structure

```
DANS/
├─ Dans.slnx                         Visual Studio solution
├─ present.cmd, present.ps1          Presentation mode: one HTTPS address other devices on the network can open
├─ database/                         CREATE scripts (SQLite, SQL Server) and migrations/
├─ docs/                             System proposal, audit report, screenshots
├─ backend/Dans.Api/                 ASP.NET Core Web API
│  ├─ Controllers/                   REST endpoints (auth, alerts, reports, centers, guides, users, ...)
│  ├─ Models/                        Database entities and enums
│  ├─ Dtos/                          Request/response shapes and EF Core projections
│  ├─ Data/                          AppDbContext, DbSeeder (barangays, guides, demo data), SchemaUpgrades, SchemaExport
│  ├─ Services/                      AuthSessionService, TokenService, NotificationService, AlertService
│  ├─ Infrastructure/                Security headers, CSRF protection, auth cookie, password policy
│  ├─ Hubs/                          SignalR hub (barangay/staff groups) and HubConnectionRegistry
│  └─ Program.cs                     Startup: HTTPS, authentication, security middleware, SignalR
├─ frontend/                         Angular app
│  ├─ scripts/dev-cert.mjs           Exports the HTTPS dev certificate for "npm start"
│  └─ src/app/
│     ├─ core/                       API clients, auth, guards, real-time service, stores
│     ├─ layout/                     Shell, sidebar, alert banner, emergency popup, confirm dialog, toasts
│     ├─ shared/                     Map, charts, badges, alert card, load-error panel, pipes
│     └─ features/                   Pages: home, alerts, reports, monitor, records, dashboard,
│                                    evacuation, guides, hotlines, notifications, profile, privacy, admin
└─ tests/
   ├─ api-smoke-test.mjs             End-to-end API, business-rule and security test (71 checks)
   └─ ui-check.mjs                   Browser test of every role in headless Chrome (43 checks) + screenshots
```

## API overview

| Area | Endpoints |
|---|---|
| Auth | `GET /api/auth/session`, `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `POST /api/auth/logout-all`, `GET/PUT /api/auth/me`, `POST /api/auth/me/password` |
| Alerts | `GET /api/alerts?status=active\|past\|all&barangayId=`, `POST /api/alerts`, `POST /api/alerts/{id}/lift` |
| Reports | `POST /api/reports`, `GET /api/reports/mine`, `GET /api/reports` (filters + paging), `GET /api/reports/export`, `GET /api/reports/{id}`, `POST /api/reports/{id}/updates`, `PUT /api/reports/{id}/assignment` |
| Evacuation centers | `GET/POST /api/evacuation-centers`, `GET/PUT/DELETE /api/evacuation-centers/{id}`, `PATCH /api/evacuation-centers/{id}/occupancy` |
| Safety | `/api/safety-guides`, `/api/emergency-contacts` (CRUD) |
| Notifications | `GET /api/notifications`, `GET /api/notifications/unread-count`, `POST /api/notifications/{id}/read`, `POST /api/notifications/read-all` |
| Admin | `GET /api/users`, `GET /api/users/assignable`, `PUT /api/users/{id}/role`, `PUT /api/users/{id}/status`, `/api/barangays` (CRUD, `/stats`) |
| Dashboard | `GET /api/dashboard` |
| Real-time | SignalR hub at `/hubs/notifications`: events `alertIssued`, `alertsChanged`, `notification`, `reportChanged`, `centersChanged` |

Requests that change data must send the header `X-Requested-With: XMLHttpRequest`. Sample requests are in
`backend/Dans.Api/Dans.Api.http`. In Development the OpenAPI document is at `https://localhost:7180/openapi/v1.json`.

### Testing

With the API running on a development database (and `npm start` run once, so the certificate is exported):

```powershell
node tests/api-smoke-test.mjs
```

It checks HTTPS redirection, security headers, cookie flags, CSRF blocking, account lockout, rate limiting, session
revocation, every role's permissions, the whole report lifecycle and the business rules (closed reports, evacuation
center capacity, privacy consent, contact numbers, date ranges, releasing assignments of deactivated staff). The test
trusts only the exported development certificate (it pins its fingerprint). It makes more than 20 sign-in requests, so
it waits once for the sign-in rate limit to reset (about a minute). It restores the passwords, assignments and centers it
changes, so it can be run again.

With the dev server also running (`npm start`) and Google Chrome installed:

```powershell
node tests/ui-check.mjs
```

It opens the real app in headless Chrome as a visitor, a new resident, the demo resident, official, responder,
administrator and volunteer; registers an account, sends a report, verifies it and checks that the resident's emergency
popup appears in real time; checks confirmation dialogs, the "cannot check for alerts" warning, that a deactivated
user's live connection is closed, and that the main pages fit a phone screen without JavaScript errors. Screenshots are
saved in `docs/screenshots/`.

Both tests also run against presentation mode through the network address, for example
`node tests/api-smoke-test.mjs https://192.168.1.8:7180 http://localhost:5180` and
`node tests/ui-check.mjs https://192.168.1.8:7180`. Set `SCREENSHOT_DIR` to another folder to keep the documentation
screenshots unchanged.

Both tests add records (reports, alerts, test accounts). Delete `dans.db` afterwards for a clean demo.

Build checks: `dotnet build` (0 warnings) in `backend/Dans.Api`, and `npm run build` in `frontend` (type-checked
production build within the size budgets).

---

## Security measures

**Transport**
- HTTPS everywhere: the API redirects HTTP to HTTPS, the dev server uses the trusted ASP.NET Core development
  certificate, and Production sends HSTS (one year, including subdomains).
- Host-header filtering (`AllowedHosts`), a 1 MB request-size limit, and no `Server` header.

**Sign-in and sessions**
- The session token (a signed JWT, HMAC-SHA256 only) is kept in a `__Host-` cookie that is **HttpOnly** (JavaScript and
  injected scripts cannot read it), **Secure** (HTTPS only) and **SameSite=Strict** (not sent by other websites). It never
  appears in a response body, in `localStorage` or in WebSocket URLs.
- Server-side sessions: every request checks the session in the database. Signing out ends the session on the server
  immediately. Changing a password signs out all other devices, and there is a "Sign out of all devices" button. When an
  admin changes a role or deactivates an account, that person's sessions end at once.
- Sessions expire after 72 hours of inactivity, with sliding renewal while in use.
- Passwords are hashed with ASP.NET Core Identity's PBKDF2 `PasswordHasher`. They must have at least 8 characters with
  uppercase, lowercase and a number, and the most common passwords are rejected.
- Brute-force protection: an account locks for 15 minutes after 5 wrong passwords. Sign-in and registration are limited
  to 20 attempts per minute per IP, and the whole API to 300 requests per minute per IP. Unknown emails take the same time
  and get the same message as wrong passwords, so attackers can't tell which accounts exist.

**Requests and responses**
- CSRF protection: data-changing requests need the `X-Requested-With` header and must come from this site or an allowed origin.
- Security headers: a Content-Security-Policy (only the app's own scripts may run), `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` and `Cross-Origin-Opener/Resource-Policy`.
  API responses are `Cache-Control: no-store`, so personal data is never cached.
- Role-based authorization on every endpoint; residents can only see their own reports.
- Real-time connections are closed by the server the moment their session ends (sign-out, password change, role change,
  deactivation), so a WebSocket opened earlier cannot keep receiving staff events. They also close when the sign-in
  token expires.
- Validation on every request, EF Core parameterised queries (no SQL injection), and a limit of 5 reports per user per 10 minutes.
- Angular escapes all output; user-entered text is never inserted as HTML (also in map tooltips), and CSV exports are
  protected against formula injection.
- In Production, errors return generic messages without stack traces, and the API refuses to start with a missing JWT
  key or a weak admin password.

**Personal data (Data Privacy Act of 2012)**
- A privacy notice (`/privacy`) explains what is collected, why, who can see it and the user's rights. Registration
  requires agreeing to it, and the time of consent is stored (`Users.PrivacyConsentAt`).
- Only staff see reporters' names and mobile numbers; only administrators see the account list.

## Business rules

- Reports move Pending → Verified → Responding → Resolved (or Dismissed). Verifying can send an area alert with the
  safety tips for that hazard; resolving or dismissing lifts it. Only officials and administrators can reopen a closed
  report; the assigned responder or volunteer can mark it Responding or Resolved and add notes.
- When a staff member is deactivated or changed to Resident, their open reports are unassigned (noted in each timeline)
  and the officials are notified so they can reassign them.
- An evacuation center that is Closed has 0 evacuees; an Open center that reaches its capacity becomes Full, and a Full
  center with space again re-opens when only the count is updated.
- Alerts end when lifted or at their optional end time; the app removes expired alerts on time without a reload.

## Notes and possible next steps

- The barangay list is seeded with the 16 barangays of Compostela; admins can correct it on the **Barangays** page.
- The demo evacuation sites are the **29 public schools of Compostela** (schools are the usual evacuation centers in the
  Philippines), covering all 16 barangays:
  - **Locations** are the school grounds as mapped on [OpenStreetMap](https://www.openstreetmap.org/copyright)
    (© OpenStreetMap contributors, ODbL), retrieved 21 Nov 2026. Spot checks against Google Maps' own school pins
    agreed within about 50 m.
  - **Barangays and classroom counts** come from DepEd school data (SY 2024-25).
  - **Capacity is an estimate:** classrooms × 18 people. That is a standard 7 m × 9 m DepEd classroom at 3.5 m² per
    person, the Sphere humanitarian minimum.
  - **Status, occupancy and contact persons** are demo values.

  This is not the MDRRMO's official list. Replace it with the official evacuation centers and capacities when you get
  them. An older news report also names the municipal gymnasium as an evacuation site, but its exact location could
  not be verified, so it is not included. Add it on the **Evacuation centers** page.
- Demo reports, alerts and phone numbers (`0900…`) are **sample data only**. Add the local MDRRMO, BFP, PNP and hospital
  hotlines (only 911 and the Red Cross 143 are pre-loaded).
- Alerts reach people who have DANS open (in any tab) and are saved to everyone's inbox. To reach phones that are offline,
  an SMS gateway (for example Semaphore or Twilio) or Web Push could be added in `NotificationService`.
