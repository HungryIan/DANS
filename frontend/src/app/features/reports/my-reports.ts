import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { debounceTime, merge } from 'rxjs';
import { ReportsApi } from '../../core/api';
import { errorMessage } from '../../core/errors';
import { STATUS_DESCRIPTIONS } from '../../core/meta';
import { Report } from '../../core/models';
import { RealtimeService } from '../../core/realtime.service';
import { Badge } from '../../shared/badge';
import { LoadError } from '../../shared/load-error';
import { SeverityClassPipe, TimeAgoPipe, TypeIconPipe } from '../../shared/pipes';

@Component({
  selector: 'app-my-reports-page',
  imports: [RouterLink, Badge, LoadError, TimeAgoPipe, TypeIconPipe, SeverityClassPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page page-narrow">
      <header class="page-header">
        <div>
          <h1>My reports</h1>
          <p>Emergencies you reported and what officials have done about them.</p>
        </div>
        <a class="btn btn-danger" routerLink="/report"><span class="icon filled">sos</span>Report an emergency</a>
      </header>

      @if (loading()) {
        <div class="loading"><span class="spinner"></span>Loading your reports…</div>
      } @else if (loadError() && reports().length === 0) {
        <app-load-error title="Could not load your reports" [message]="loadError()!" [emergencyHint]="true" (retry)="load()" />
      } @else {
        <div class="card report-list">
          @for (r of reports(); track r.id) {
            <a class="report-item" [routerLink]="['/reports', r.id]">
              <span [class]="'type-symbol ' + (r.severity | sevClass)"><span class="icon">{{ r.type | typeIcon }}</span></span>
              <span class="spacer truncate">
                <span class="cell-title">{{ r.type }} · {{ r.barangayName }}</span>
                <span class="cell-sub truncate" style="display: block">{{ r.location }}</span>
                <span class="cell-sub">{{ r.referenceNo }} · {{ r.createdAt | timeAgo }}</span>
              </span>
              <span class="stack-sm" style="align-items: flex-end">
                <app-badge [value]="r.status" />
                <span class="cell-sub nowrap">{{ descriptions[r.status] }}</span>
              </span>
            </a>
          } @empty {
            <div class="empty">
              <span class="icon">assignment</span>
              <h3>You have not reported anything yet</h3>
              <p>When you report an emergency, you can follow its status here.</p>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class MyReportsPage {
  private readonly api = inject(ReportsApi);

  protected readonly reports = signal<Report[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly descriptions = STATUS_DESCRIPTIONS;

  constructor() {
    this.load();
    // Status changes on your reports arrive as notifications; refresh when they do.
    const realtime = inject(RealtimeService);
    merge(realtime.notification$, realtime.reconnected$)
      .pipe(debounceTime(300), takeUntilDestroyed())
      .subscribe(() => this.load());
  }

  protected load(): void {
    this.api.mine().subscribe({
      next: (list) => {
        this.reports.set(list);
        this.loadError.set(null);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.loadError.set(errorMessage(err, 'Could not load your reports.'));
        this.loading.set(false);
      },
    });
  }
}
