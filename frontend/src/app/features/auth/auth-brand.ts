import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Left-hand panel of the sign-in and registration pages. */
@Component({
  selector: 'app-auth-brand',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'auth-brand' },
  template: `
    <a class="brand" routerLink="/" style="padding: 0">
      <span class="brand-mark"><span class="icon filled">crisis_alert</span></span>
      <span>
        <span class="brand-name">DANS</span>
        <span class="brand-sub">Disaster Alert &amp; Notification System</span>
      </span>
    </a>
    <div>
      <h1>Stay informed.<br />Stay safe.</h1>
      <p>Real-time emergency alerts, evacuation information and incident reporting for the Municipality of Compostela, Davao de Oro.</p>
      <ul class="auth-points">
        <li><span class="icon">notifications_active</span>Instant alerts for your barangay</li>
        <li><span class="icon">night_shelter</span>Evacuation centers and safety instructions</li>
        <li><span class="icon">sos</span>Report emergencies straight to local officials</li>
        <li><span class="icon">fact_check</span>Track the status of every report</li>
      </ul>
    </div>
    <p class="auth-foot">Legacy College of Compostela · Institute of Information Technology · <a routerLink="/privacy">Privacy notice</a></p>
  `,
})
export class AuthBrand {}
