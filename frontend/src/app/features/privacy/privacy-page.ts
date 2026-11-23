import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Privacy notice (Republic Act No. 10173, the Data Privacy Act of 2012). It describes what DANS actually stores
 * and who can see it; keep it in step with the API whenever personal data handling changes.
 */
@Component({
  selector: 'app-privacy-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page page-narrow">
      <header class="page-header">
        <div>
          <h1>Privacy notice</h1>
          <p>How DANS collects, uses and protects your personal information, in line with the Data Privacy Act of 2012 (RA 10173).</p>
        </div>
      </header>

      <section class="card card-body stack prose">
        <h2 class="card-title"><span class="icon">badge</span>What we collect</h2>
        <ul>
          <li><strong>When you create an account:</strong> your full name, email address, mobile number, barangay and (optionally) purok or street, and your password. The password is never stored as text; only a one-way hash of it is kept.</li>
          <li><strong>When you report an emergency:</strong> the type and severity, the barangay and landmark, your description, the number of people affected and, only if you add it, a pinned map location (which can come from your device's location if you tap "Use my location").</li>
          <li><strong>While you are signed in:</strong> a sign-in session with the name of your browser, so you can sign out of other devices. Your IP address is used briefly to block repeated failed sign-ins.</li>
        </ul>
        <p class="text-2">Visitors who do not sign in can read alerts, evacuation centers, safety guides and hotlines without giving any personal information.</p>

        <h2 class="card-title"><span class="icon">target</span>Why we collect it</h2>
        <ul>
          <li>Your <strong>barangay</strong> decides which emergency alerts are sent to you.</li>
          <li>Your <strong>name and mobile number</strong> let responders contact you about an emergency you reported.</li>
          <li>Reports and their status history are kept as <strong>incident records</strong> for planning and future reference.</li>
        </ul>

        <h2 class="card-title"><span class="icon">visibility</span>Who can see it</h2>
        <ul>
          <li><strong>Other residents and visitors</strong> never see your personal information.</li>
          <li><strong>Staff</strong> (volunteers, responders, officials and administrators) can see emergency reports, including the reporter's name and mobile number.</li>
          <li><strong>Administrators</strong> can see the list of accounts (name, email, mobile number and barangay) to manage roles.</li>
          <li>Your information is not sold or shared with advertisers. DANS has no advertising or tracking cookies.</li>
        </ul>

        <h2 class="card-title"><span class="icon">lock</span>How it is protected</h2>
        <ul>
          <li>All connections use HTTPS. Your sign-in is kept in a secure cookie that page scripts cannot read.</li>
          <li>Passwords are hashed; accounts lock for 15 minutes after 5 wrong passwords.</li>
          <li>Each person only sees what their role allows, and every change to a report is recorded in its timeline.</li>
        </ul>

        <h2 class="card-title"><span class="icon">public</span>Outside services</h2>
        <p>
          Maps are loaded from OpenStreetMap and fonts from Google Fonts. Like any website, these services receive your
          IP address when your browser downloads map images or fonts. The "Directions" buttons open Google Maps only when you tap them.
        </p>

        <h2 class="card-title"><span class="icon">gavel</span>Your rights</h2>
        <p>
          Under RA 10173 you have the right to be informed, to access and correct your data, to object, to ask for it to be
          blocked or erased, and to file a complaint with the National Privacy Commission. You can correct your details at any
          time on your <a class="link" routerLink="/profile">profile</a> page. To have your account deactivated or removed,
          contact the DANS administrator through your barangay hall or the municipal disaster risk reduction office.
        </p>
        <p class="small muted">Incident records are kept for future reference until administrators remove them.</p>
      </section>
    </div>
  `,
  styles: `
    .prose ul { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 6px; }
    .prose h2 { margin-top: 8px; }
  `,
})
export class PrivacyPage {}
