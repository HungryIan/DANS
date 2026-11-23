import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Subject, catchError, debounceTime, merge, of, switchMap, tap } from 'rxjs';
import { ActiveAlertsStore } from '../../core/alerts-store';
import { AlertsApi, BarangaysApi } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { errorMessage } from '../../core/errors';
import { Alert, Barangay } from '../../core/models';
import { RealtimeService } from '../../core/realtime.service';
import { ToastService } from '../../core/toast.service';
import { ConfirmService } from '../../core/confirm.service';
import { AlertCard } from '../../shared/alert-card';
import { LoadError } from '../../shared/load-error';

@Component({
  selector: 'app-alerts-page',
  imports: [RouterLink, AlertCard, LoadError],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './alerts-page.html',
})
export class AlertsPage {
  protected readonly auth = inject(AuthService);
  protected readonly store = inject(ActiveAlertsStore);
  private readonly api = inject(AlertsApi);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  protected readonly tab = signal<'active' | 'past'>('active');
  protected readonly barangayId = signal<number | null>(null);
  protected readonly barangays = signal<Barangay[]>([]);
  protected readonly alerts = signal<Alert[]>([]);
  protected readonly loading = signal(true);
  protected readonly lifting = signal<number | null>(null);
  protected readonly loadError = signal<string | null>(null);

  private readonly reload$ = new Subject<void>();

  constructor() {
    inject(BarangaysApi).list().subscribe({ next: (list) => this.barangays.set(list) });

    this.reload$
      .pipe(
        tap(() => this.loading.set(true)),
        switchMap(() =>
          this.api.list({ status: this.tab(), barangayId: this.barangayId(), limit: 100 }).pipe(
            catchError((err: unknown) => {
              this.loadError.set(errorMessage(err, 'Could not load alerts.'));
              return of(null);
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((list) => {
        if (list) {
          this.alerts.set(list);
          this.loadError.set(null);
        }
        this.loading.set(false);
      });

    effect(() => {
      this.tab();
      this.barangayId();
      untracked(() => this.reload$.next());
    });

    const realtime = inject(RealtimeService);
    merge(realtime.alertsChanged$, realtime.alertIssued$, realtime.reconnected$)
      .pipe(debounceTime(300), takeUntilDestroyed())
      .subscribe(() => this.reload$.next());
  }

  protected onBarangayChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.barangayId.set(value ? Number(value) : null);
  }

  protected reload(): void {
    this.reload$.next();
  }

  protected async lift(alert: Alert): Promise<void> {
    const area = alert.barangays.length === 0 ? 'the whole municipality' : alert.barangays.map((b) => b.name).join(', ');
    const confirmed = await this.confirm.ask({
      title: 'Lift this alert?',
      message: `"${alert.title}" will end now, and residents of ${area} will be told that the alert has been lifted.`,
      confirmText: 'Lift alert',
      icon: 'notifications_off',
    });
    if (!confirmed) return;
    this.lifting.set(alert.id);
    this.api.lift(alert.id).subscribe({
      next: () => {
        this.toast.success('Alert lifted', 'Residents in the affected area have been notified.');
        this.lifting.set(null);
        this.reload$.next();
      },
      error: (err: unknown) => {
        this.toast.error('Could not lift the alert', errorMessage(err));
        this.lifting.set(null);
      },
    });
  }
}
