import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ActiveAlertsStore } from './core/alerts-store';
import { NotificationStore } from './core/notification-store';
import { RealtimeService } from './core/realtime.service';
import { ConfirmDialog } from './layout/confirm-dialog';
import { IncomingAlert } from './layout/incoming-alert';
import { Toasts } from './layout/toasts';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, IncomingAlert, Toasts, ConfirmDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <router-outlet />
    <app-incoming-alert />
    <app-confirm-dialog />
    <app-toasts />
  `,
})
export class App {
  constructor() {
    // Open the real-time connection and load shared data as soon as the app starts.
    inject(RealtimeService);
    inject(ActiveAlertsStore);
    inject(NotificationStore);
  }
}
