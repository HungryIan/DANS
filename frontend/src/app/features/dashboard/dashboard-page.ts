import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { Subject, catchError, debounceTime, forkJoin, merge, of, switchMap, tap } from 'rxjs';
import { CentersApi, DashboardApi } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { errorMessage } from '../../core/errors';
import { DashboardSummary, EvacuationCenter, Report } from '../../core/models';
import { RealtimeService } from '../../core/realtime.service';
import { Badge } from '../../shared/badge';
import { BarList } from '../../shared/bar-list';
import { Meter, occupancyLevel } from '../../shared/meter';
import { LoadError } from '../../shared/load-error';
import { TimeAgoPipe } from '../../shared/pipes';

/** Situation overview for staff: headline numbers, where incidents are, and evacuation capacity. */
@Component({
  selector: 'app-dashboard-page',
  imports: [RouterLink, DatePipe, DecimalPipe, Badge, BarList, LoadError, Meter, TimeAgoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard-page.html',
})
export class DashboardPage {
  protected readonly auth = inject(AuthService);
  protected readonly realtime = inject(RealtimeService);
  private readonly router = inject(Router);

  protected readonly summary = signal<DashboardSummary | null>(null);
  protected readonly centers = signal<EvacuationCenter[]>([]);
  protected readonly refreshing = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly today = new Date();

  /** Activated centers, fullest first. */
  protected readonly activeCenters = computed(() =>
    this.centers()
      .filter((c) => c.status !== 'Closed')
      .sort((a, b) => b.currentOccupancy / b.capacity - a.currentOccupancy / a.capacity),
  );

  private readonly reload$ = new Subject<void>();

  constructor() {
    const dashboardApi = inject(DashboardApi);
    const centersApi = inject(CentersApi);

    this.reload$
      .pipe(
        tap(() => this.refreshing.set(true)),
        switchMap(() =>
          forkJoin({ summary: dashboardApi.summary(), centers: centersApi.list() }).pipe(
            catchError((err: unknown) => {
              this.loadError.set(errorMessage(err, 'Could not load the dashboard.'));
              return of(null);
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((data) => {
        if (data) {
          this.summary.set(data.summary);
          this.centers.set(data.centers);
          this.loadError.set(null);
        }
        this.refreshing.set(false);
      });
    this.reload$.next();

    // Keep the numbers current while the dashboard is open (previous values stay visible while reloading).
    merge(this.realtime.reportChanged$, this.realtime.alertsChanged$, this.realtime.centersChanged$, this.realtime.reconnected$)
      .pipe(debounceTime(800), takeUntilDestroyed())
      .subscribe(() => this.reload$.next());
  }

  protected reload(): void {
    this.reload$.next();
  }

  /** Free places in the open and full centers (capacity minus evacuees; a closed center has no evacuees). */
  protected spaceLeft(summary: DashboardSummary): number {
    return Math.max(0, summary.openCapacity - summary.totalEvacuees);
  }

  protected level(center: EvacuationCenter) {
    return occupancyLevel(center.currentOccupancy, center.capacity);
  }

  protected open(report: Report): void {
    void this.router.navigate(['/reports', report.id]);
  }
}
