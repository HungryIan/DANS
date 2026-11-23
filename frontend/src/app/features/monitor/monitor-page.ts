import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { Subject, catchError, debounceTime, merge, of, switchMap } from 'rxjs';
import { BarangaysApi, ReportsApi } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { errorMessage } from '../../core/errors';
import { DISASTER_TYPES, SEVERITY_COLORS, SEVERITIES, STATUS_DESCRIPTIONS } from '../../core/meta';
import { Barangay, DisasterType, Report, ReportStatus, SeverityLevel } from '../../core/models';
import { RealtimeService } from '../../core/realtime.service';
import { Badge } from '../../shared/badge';
import { LoadError } from '../../shared/load-error';
import { MapMarker, MapView } from '../../shared/map-view';
import { TimeAgoPipe, TypeIconPipe } from '../../shared/pipes';

const SEVERITY_RANK: Record<SeverityLevel, number> = { Critical: 0, High: 1, Moderate: 2, Low: 3 };
const COLUMNS: readonly ReportStatus[] = ['Pending', 'Verified', 'Responding'];

/** Live view of every open incident, grouped by status, for officials and responders. */
@Component({
  selector: 'app-monitor-page',
  imports: [RouterLink, Badge, LoadError, MapView, TimeAgoPipe, TypeIconPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './monitor-page.html',
})
export class MonitorPage {
  protected readonly auth = inject(AuthService);
  protected readonly realtime = inject(RealtimeService);
  private readonly api = inject(ReportsApi);
  private readonly router = inject(Router);

  protected readonly types = DISASTER_TYPES;
  protected readonly severities = SEVERITIES;
  protected readonly severityColors = SEVERITY_COLORS;
  protected readonly barangays = signal<Barangay[]>([]);
  protected readonly reports = signal<Report[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly barangayId = signal<number | null>(null);
  protected readonly type = signal<DisasterType | null>(null);
  protected readonly mineOnly = signal(false);
  /** Reports that just arrived; their cards flash for a few seconds. */
  protected readonly newIds = signal<ReadonlySet<number>>(new Set());

  /** Most severe first, then the ones waiting longest. */
  protected readonly columns = computed(() => {
    const sorted = [...this.reports()].sort(
      (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.createdAt.localeCompare(b.createdAt),
    );
    return COLUMNS.map((status) => ({
      status,
      description: STATUS_DESCRIPTIONS[status],
      items: sorted.filter((r) => r.status === status),
    }));
  });

  protected readonly markers = computed<MapMarker[]>(() =>
    this.reports()
      .filter((r) => r.latitude !== null && r.longitude !== null)
      .map((r) => ({
        id: r.id,
        lat: r.latitude!,
        lng: r.longitude!,
        color: SEVERITY_COLORS[r.severity],
        title: `${r.referenceNo} · ${r.type} (${r.severity})`,
        subtitle: `${r.location}, ${r.barangayName} · ${r.status}`,
      })),
  );

  private readonly reload$ = new Subject<void>();

  constructor() {
    inject(BarangaysApi).list().subscribe({ next: (list) => this.barangays.set(list) });

    this.reload$
      .pipe(
        switchMap(() =>
          this.api
            .list({ activeOnly: true, pageSize: 200, barangayId: this.barangayId(), type: this.type(), assignedToMe: this.mineOnly() })
            .pipe(
              catchError((err: unknown) => {
                this.loadError.set(errorMessage(err, 'Could not load the open incidents.'));
                return of(null);
              }),
            ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((page) => {
        if (page) {
          this.reports.set(page.items);
          this.loadError.set(null);
        }
        this.loading.set(false);
      });

    effect(() => {
      this.barangayId();
      this.type();
      this.mineOnly();
      untracked(() => this.reload$.next());
    });

    this.realtime.reportChanged$.pipe(takeUntilDestroyed()).subscribe((report) => {
      if (!this.reports().some((r) => r.id === report.id) && report.status === 'Pending') this.highlight(report.id);
    });
    merge(this.realtime.reportChanged$, this.realtime.reconnected$)
      .pipe(debounceTime(400), takeUntilDestroyed())
      .subscribe(() => this.reload$.next());
  }

  protected reload(): void {
    this.reload$.next();
  }

  protected onBarangayChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.barangayId.set(value ? Number(value) : null);
  }

  protected onTypeChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.type.set(value ? (value as DisasterType) : null);
  }

  protected onMineChange(event: Event): void {
    this.mineOnly.set((event.target as HTMLInputElement).checked);
  }

  protected openReport(id: number): void {
    void this.router.navigate(['/reports', id]);
  }

  private highlight(id: number): void {
    this.newIds.update((ids) => new Set([...ids, id]));
    setTimeout(() => this.newIds.update((ids) => new Set([...ids].filter((x) => x !== id))), 10_000);
  }
}
