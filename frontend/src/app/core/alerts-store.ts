import { Injectable, computed, inject, signal } from '@angular/core';
import { debounceTime, interval, merge } from 'rxjs';
import { AlertsApi } from './api';
import { AuthService } from './auth.service';
import { errorMessage } from './errors';
import { Alert } from './models';
import { RealtimeService } from './realtime.service';

/** Safety net: reload the active alerts at least this often, even if a real-time event was missed. */
const REFRESH_EVERY_MS = 2 * 60_000;

/**
 * The currently active alerts, kept up to date in real time. Used by the banner, sidebar and home page.
 *
 * If the list cannot be loaded, `error` is set and the last known alerts are kept — the app must never show
 * "no active alerts" just because the server could not be reached.
 */
@Injectable({ providedIn: 'root' })
export class ActiveAlertsStore {
  private readonly api = inject(AlertsApi);
  private readonly auth = inject(AuthService);
  private expiryTimer: ReturnType<typeof setTimeout> | undefined;

  readonly alerts = signal<Alert[]>([]);
  readonly loaded = signal(false);
  /** Message of the last failed load, or null when the list is current. */
  readonly error = signal<string | null>(null);

  /** Alerts that concern the signed-in resident (their barangay or municipality-wide). Staff and visitors see all. */
  readonly relevant = computed(() => {
    const list = this.alerts();
    const user = this.auth.user();
    if (!user || user.role !== 'Resident' || user.barangayId === null) return list;
    return list.filter((a) => a.barangays.length === 0 || a.barangays.some((b) => b.id === user.barangayId));
  });

  constructor() {
    const realtime = inject(RealtimeService);
    this.refresh();
    merge(realtime.alertsChanged$, realtime.alertIssued$, realtime.reconnected$, interval(REFRESH_EVERY_MS))
      .pipe(debounceTime(300))
      .subscribe(() => this.refresh());
  }

  refresh(): void {
    this.api.list({ status: 'active' }).subscribe({
      next: (alerts) => {
        this.alerts.set(alerts);
        this.error.set(null);
        this.loaded.set(true);
        this.scheduleExpiryRefresh(alerts);
      },
      error: (err: unknown) => {
        this.error.set(errorMessage(err, 'Could not load the latest alerts.'));
        this.loaded.set(true);
      },
    });
  }

  /** Alerts can end on their own at "expiresAt"; reload right after the next one ends so it disappears on time. */
  private scheduleExpiryRefresh(alerts: Alert[]): void {
    clearTimeout(this.expiryTimer);
    const now = Date.now();
    const next = Math.min(...alerts.map((a) => (a.expiresAt ? new Date(a.expiresAt).getTime() : Infinity)).filter((t) => t > now));
    if (Number.isFinite(next)) {
      // setTimeout cannot wait longer than ~24.8 days; the periodic refresh covers anything later.
      this.expiryTimer = setTimeout(() => this.refresh(), Math.min(next - now + 1000, 2 ** 31 - 1));
    }
  }
}
