import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { debounceTime, filter, merge } from 'rxjs';
import { ReportsApi, UsersApi } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { errorMessage } from '../../core/errors';
import { AREA_HAZARDS, DATE_TIME, REPORT_STATUSES, SEVERITY_COLORS, STATUS_DESCRIPTIONS } from '../../core/meta';
import { AssignableUser, ReportDetail, ReportStatus } from '../../core/models';
import { RealtimeService } from '../../core/realtime.service';
import { ConfirmService } from '../../core/confirm.service';
import { ToastService } from '../../core/toast.service';
import { Badge } from '../../shared/badge';
import { MapMarker, MapView } from '../../shared/map-view';
import { SeverityClassPipe, TimeAgoPipe, TypeIconPipe } from '../../shared/pipes';

@Component({
  selector: 'app-report-detail-page',
  imports: [ReactiveFormsModule, RouterLink, DatePipe, Badge, MapView, TimeAgoPipe, TypeIconPipe, SeverityClassPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './report-detail.html',
})
export class ReportDetailPage {
  /** Route parameter :id */
  readonly id = input.required<string>();

  protected readonly auth = inject(AuthService);
  private readonly api = inject(ReportsApi);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly detail = signal<ReportDetail | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly assignable = signal<AssignableUser[]>([]);
  protected readonly statuses = REPORT_STATUSES;
  protected readonly descriptions = STATUS_DESCRIPTIONS;
  protected readonly dateTime = DATE_TIME;

  protected readonly updateForm = this.fb.group({
    status: this.fb.control<ReportStatus | ''>(''),
    note: ['', Validators.maxLength(1000)],
    notifyResidents: [true],
  });
  protected readonly assignee = this.fb.control<number | null>(null);
  protected readonly selectedStatus = signal<ReportStatus | ''>('');

  protected readonly report = computed(() => this.detail()?.report ?? null);
  protected readonly isClosed = computed(() => {
    const status = this.report()?.status;
    return status === 'Resolved' || status === 'Dismissed';
  });
  protected readonly markers = computed<MapMarker[]>(() => {
    const r = this.report();
    if (!r || r.latitude === null || r.longitude === null) return [];
    return [{ id: r.id, lat: r.latitude, lng: r.longitude, color: SEVERITY_COLORS[r.severity], title: `${r.type} · ${r.severity}`, subtitle: r.location }];
  });
  protected readonly directionsUrl = computed(() => {
    const r = this.report();
    return r && r.latitude !== null && r.longitude !== null
      ? `https://www.google.com/maps/dir/?api=1&destination=${r.latitude},${r.longitude}`
      : null;
  });

  constructor() {
    effect(() => {
      const id = Number(this.id());
      untracked(() => this.load(id, false));
    });

    if (this.auth.isManager()) inject(UsersApi).assignable().subscribe({ next: (list) => this.assignable.set(list) });

    this.updateForm.controls.status.valueChanges.pipe(takeUntilDestroyed()).subscribe((s) => this.selectedStatus.set(s));

    // Reload when someone else updates this report (staff get report events; residents get notifications).
    const realtime = inject(RealtimeService);
    merge(
      realtime.reportChanged$.pipe(filter((r) => r.id === Number(this.id()))),
      realtime.notification$.pipe(filter((n) => n.link === `/reports/${this.id()}`)),
      realtime.reconnected$,
    )
      .pipe(debounceTime(300), takeUntilDestroyed())
      .subscribe(() => this.load(Number(this.id()), true));
  }

  protected submitUpdate(): void {
    const v = this.updateForm.getRawValue();
    const status = v.status || null;
    const note = v.note.trim() || null;
    if (!status && !note) {
      this.toast.error('Nothing to save', 'Choose a new status or write a note.');
      return;
    }
    void this.send(status, note, status === 'Verified' && v.notifyResidents);
  }

  /** One-click status buttons for the assigned responder. */
  protected quickStatus(status: ReportStatus): void {
    void this.send(status, this.updateForm.controls.note.value.trim() || null, false);
  }

  protected assign(): void {
    const report = this.report();
    if (!report) return;
    this.busy.set(true);
    this.api.assign(report.id, this.assignee.value).subscribe({
      next: (detail) => {
        this.apply(detail, true);
        this.toast.success(detail.report.assignedToName ? `Assigned to ${detail.report.assignedToName}` : 'Assignment removed');
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.toast.error('Could not assign the report', errorMessage(err));
      },
    });
  }

  private async send(status: ReportStatus | null, note: string | null, notifyResidents: boolean): Promise<void> {
    const report = this.report();
    if (!report) return;
    if (status === 'Dismissed') {
      const confirmed = await this.confirm.ask({
        title: `Dismiss ${report.referenceNo}?`,
        message:
          'Use this only for duplicate, false or prank reports. The report is closed, the reporter is told it was closed by ' +
          'officials, and any alert issued for it is lifted. Officials can reopen it later.',
        confirmText: 'Dismiss report',
        tone: 'danger',
      });
      if (!confirmed) return;
    }
    const hadAlert = this.detail()?.hasActiveAlert ?? false;
    this.busy.set(true);
    this.api.addUpdate(report.id, { status, note, notifyResidents }).subscribe({
      next: (detail) => {
        this.apply(detail, true);
        const alertSent = notifyResidents && !hadAlert && detail.hasActiveAlert;
        this.toast.success(
          status ? `Report marked as ${status}` : 'Note added',
          alertSent
            ? `An alert was sent to residents of ${detail.report.barangayName}.`
            : notifyResidents && hadAlert
              ? 'An alert for this incident was already active, so no new alert was sent.'
              : undefined,
        );
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.toast.error('Could not update the report', errorMessage(err));
      },
    });
  }

  private load(id: number, silent: boolean): void {
    if (!silent) this.loading.set(true);
    this.api.get(id).subscribe({
      next: (detail) => this.apply(detail, !silent),
      error: (err: unknown) => {
        this.loadError.set(errorMessage(err));
        this.loading.set(false);
      },
    });
  }

  /** Shows the latest data. Forms are only reset after our own changes, never while someone is typing. */
  private apply(detail: ReportDetail, resetForms: boolean): void {
    this.detail.set(detail);
    this.loadError.set(null);
    this.loading.set(false);
    this.busy.set(false);
    if (resetForms) {
      this.updateForm.reset({ status: '', note: '', notifyResidents: AREA_HAZARDS.includes(detail.report.type) });
      this.assignee.setValue(detail.report.assignedToId);
    }
  }
}
