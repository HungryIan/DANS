import { DatePipe, formatDate } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { Subject, catchError, debounceTime, of, switchMap, tap } from 'rxjs';
import { BarangaysApi, ReportsApi } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { downloadCsv } from '../../core/browser';
import { errorMessage } from '../../core/errors';
import { DATE_TIME, DISASTER_TYPES, REPORT_STATUSES } from '../../core/meta';
import { Barangay, DisasterType, Paged, Report, ReportQuery, ReportStatus } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { Badge } from '../../shared/badge';
import { LoadError } from '../../shared/load-error';

interface Filters {
  search: string;
  status: ReportStatus | '';
  type: DisasterType | '';
  barangayId: number | null;
  from: string;
  to: string;
}

const EMPTY_FILTERS: Filters = { search: '', status: '', type: '', barangayId: null, from: '', to: '' };
const PAGE_SIZE = 20;

/** Searchable archive of every incident report, with CSV export for documentation. */
@Component({
  selector: 'app-records-page',
  imports: [RouterLink, DatePipe, Badge, LoadError],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './records-page.html',
})
export class RecordsPage {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(ReportsApi);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly types = DISASTER_TYPES;
  protected readonly statuses = REPORT_STATUSES;
  protected readonly dateTime = DATE_TIME;
  protected readonly barangays = signal<Barangay[]>([]);
  protected readonly filters = signal<Filters>(EMPTY_FILTERS);
  protected readonly page = signal(1);
  protected readonly result = signal<Paged<Report> | null>(null);
  protected readonly loading = signal(true);
  protected readonly exporting = signal(false);
  protected readonly loadError = signal<string | null>(null);

  protected readonly hasFilters = computed(() => JSON.stringify(this.filters()) !== JSON.stringify(EMPTY_FILTERS));
  protected readonly range = computed(() => {
    const r = this.result();
    if (!r || r.totalCount === 0) return '0 records';
    const first = (r.page - 1) * r.pageSize + 1;
    const last = Math.min(r.totalCount, r.page * r.pageSize);
    return `${first}–${last} of ${r.totalCount} records`;
  });
  protected readonly pageCount = computed(() => {
    const r = this.result();
    return r ? Math.max(1, Math.ceil(r.totalCount / r.pageSize)) : 1;
  });

  private readonly reload$ = new Subject<void>();
  private readonly search$ = new Subject<string>();

  constructor() {
    inject(BarangaysApi).list().subscribe({ next: (list) => this.barangays.set(list) });

    this.reload$
      .pipe(
        tap(() => this.loading.set(true)),
        switchMap(() =>
          this.api.list({ ...this.query(), page: this.page(), pageSize: PAGE_SIZE }).pipe(
            catchError((err: unknown) => {
              this.loadError.set(errorMessage(err, 'Could not load the incident records.'));
              return of(null);
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((result) => {
        if (result) {
          this.result.set(result);
          this.loadError.set(null);
        }
        this.loading.set(false);
      });

    effect(() => {
      this.filters();
      this.page();
      untracked(() => this.reload$.next());
    });

    this.search$
      .pipe(debounceTime(350), takeUntilDestroyed())
      .subscribe((search) => this.setFilter({ search }));
  }

  protected onSearch(event: Event): void {
    this.search$.next((event.target as HTMLInputElement).value.trim());
  }

  protected onSelect(key: 'status' | 'type' | 'barangayId', event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (key === 'barangayId') this.setFilter({ barangayId: value ? Number(value) : null });
    else if (key === 'status') this.setFilter({ status: value as ReportStatus | '' });
    else this.setFilter({ type: value as DisasterType | '' });
  }

  protected onDate(key: 'from' | 'to', event: Event): void {
    const input = event.target as HTMLInputElement;
    const next = { ...this.filters(), [key]: input.value };
    if (next.from && next.to && next.from > next.to) {
      this.toast.error('Check the dates', 'The "From" date must be on or before the "To" date.');
      input.value = this.filters()[key];
      return;
    }
    this.setFilter(key === 'from' ? { from: input.value } : { to: input.value });
  }

  protected clearFilters(searchBox: HTMLInputElement, ...selects: HTMLSelectElement[]): void {
    searchBox.value = '';
    for (const select of selects) select.value = '';
    this.filters.set(EMPTY_FILTERS);
    this.page.set(1);
  }

  protected reload(): void {
    this.reload$.next();
  }

  protected goTo(page: number): void {
    this.page.set(Math.min(Math.max(1, page), this.pageCount()));
  }

  protected open(report: Report): void {
    void this.router.navigate(['/reports', report.id]);
  }

  protected exportCsv(): void {
    this.exporting.set(true);
    this.api.export(this.query()).subscribe({
      next: (reports) => {
        const when = (value: string | null) => (value ? formatDate(value, 'yyyy-MM-dd HH:mm', 'en-US') : '');
        downloadCsv(
          `dans-incident-records-${formatDate(new Date(), 'yyyy-MM-dd', 'en-US')}.csv`,
          ['Reference No.', 'Date reported', 'Type', 'Severity', 'Status', 'Barangay', 'Location', 'Description',
            'People affected', 'Reported by', 'Reporter phone', 'Assigned to', 'Closed', 'Latitude', 'Longitude'],
          reports.map((r) => [
            r.referenceNo, when(r.createdAt), r.type, r.severity, r.status, r.barangayName, r.location, r.description,
            r.peopleAffected, r.reporterName, r.reporterPhone, r.assignedToName, when(r.closedAt), r.latitude, r.longitude,
          ]),
        );
        this.toast.success('Export ready', `${reports.length} record(s) saved as a CSV file.`);
        this.exporting.set(false);
      },
      error: (err: unknown) => {
        this.toast.error('Export failed', errorMessage(err));
        this.exporting.set(false);
      },
    });
  }

  private setFilter(change: Partial<Filters>): void {
    this.filters.update((f) => ({ ...f, ...change }));
    this.page.set(1);
  }

  /** Converts the filters to API parameters. Dates are whole days in the user's time zone. */
  private query(): ReportQuery {
    const f = this.filters();
    return {
      search: f.search || null,
      status: f.status || null,
      type: f.type || null,
      barangayId: f.barangayId,
      from: f.from ? new Date(`${f.from}T00:00:00`).toISOString() : null,
      to: f.to ? new Date(`${f.to}T23:59:59.999`).toISOString() : null,
    };
  }
}
