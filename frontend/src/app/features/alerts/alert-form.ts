import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { AlertsApi, BarangaysApi, GuidesApi, ReportsApi } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { errorMessage } from '../../core/errors';
import { DISASTER_TYPES, SEVERITIES } from '../../core/meta';
import { Alert, Barangay, DisasterType, Report, SafetyGuide, SeverityLevel } from '../../core/models';
import { ConfirmService } from '../../core/confirm.service';
import { ToastService } from '../../core/toast.service';
import { AlertCard } from '../../shared/alert-card';

/** Value for <input type="datetime-local"> in the browser's time zone. */
function localInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

@Component({
  selector: 'app-alert-form-page',
  imports: [ReactiveFormsModule, RouterLink, AlertCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './alert-form.html',
  styles: `
    .check-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px 12px; padding: 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface-2); }
    .preview { position: sticky; top: calc(var(--topbar-height) + 16px); }
  `,
})
export class AlertFormPage {
  /** ?reportId= — pre-fills the form from an incident report. */
  readonly reportId = input<string>();

  private readonly api = inject(AlertsApi);
  private readonly reportsApi = inject(ReportsApi);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly types = DISASTER_TYPES;
  protected readonly severities = SEVERITIES;
  protected readonly barangays = signal<Barangay[]>([]);
  private readonly guides = signal<SafetyGuide[]>([]);
  protected readonly linkedReport = signal<Report | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly minExpiry = localInputValue(new Date());

  protected readonly form = this.fb.group({
    title: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(150)]],
    type: this.fb.control<DisasterType>('Flood'),
    severity: this.fb.control<SeverityLevel>('High'),
    message: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(2000)]],
    instructions: ['', Validators.maxLength(4000)],
    scope: this.fb.control<'selected' | 'all'>('selected'),
    barangayIds: this.fb.control<number[]>([]),
    expiresAt: [''],
  });

  /** The form value as a signal, so the preview updates while typing. */
  protected readonly value = toSignal(this.form.valueChanges.pipe(map(() => this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });

  protected readonly guideForType = computed(() => this.guides().find((g) => g.type === this.value().type) ?? null);

  protected readonly preview = computed<Alert>(() => {
    const v = this.value();
    return {
      id: 0,
      title: v.title.trim() || 'Alert title',
      message: v.message.trim() || 'The alert message appears here.',
      instructions: v.instructions.trim() || null,
      type: v.type,
      severity: v.severity,
      barangays: v.scope === 'all' ? [] : this.barangays().filter((b) => v.barangayIds.includes(b.id)),
      issuedBy: this.auth.user()?.fullName ?? '',
      issuedAt: new Date().toISOString(),
      expiresAt: v.expiresAt ? new Date(v.expiresAt).toISOString() : null,
      liftedAt: null,
      isActive: true,
      reportId: null,
    };
  });

  constructor() {
    inject(BarangaysApi).list().subscribe({ next: (list) => this.barangays.set(list) });
    inject(GuidesApi).list().subscribe({ next: (list) => this.guides.set(list) });

    effect(() => {
      const id = Number(this.reportId());
      if (id > 0) untracked(() => this.loadReport(id));
    });
  }

  protected isSelected(id: number): boolean {
    return this.value().barangayIds.includes(id);
  }

  protected toggleBarangay(id: number, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const current = this.form.controls.barangayIds.value;
    this.form.controls.barangayIds.setValue(checked ? [...current, id] : current.filter((x) => x !== id));
  }

  protected selectAll(selectAll: boolean): void {
    this.form.controls.barangayIds.setValue(selectAll ? this.barangays().map((b) => b.id) : []);
  }

  protected useGuideTips(): void {
    const guide = this.guideForType();
    if (guide) this.form.controls.instructions.setValue(guide.during.join('\n'));
  }

  protected async submit(): Promise<void> {
    this.error.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Please complete the highlighted fields.');
      return;
    }
    const v = this.form.getRawValue();
    if (v.scope === 'selected' && v.barangayIds.length === 0) {
      this.error.set('Select at least one barangay, or send the alert to the entire municipality.');
      return;
    }
    const names = this.barangays().filter((b) => v.barangayIds.includes(b.id)).map((b) => b.name);
    const area = v.scope === 'all' ? 'EVERY resident of the municipality' : `residents of ${names.join(', ')}`;
    const confirmed = await this.confirm.ask({
      title: `Send this ${v.severity.toUpperCase()} alert?`,
      message: `"${v.title.trim()}" will be pushed immediately to ${area}, with an alarm sound for Moderate alerts and above. It cannot be unsent, but you can lift it later.`,
      confirmText: 'Send alert now',
      tone: 'danger',
      icon: 'campaign',
    });
    if (!confirmed) return;

    this.busy.set(true);
    this.api
      .create({
        title: v.title.trim(),
        message: v.message.trim(),
        instructions: v.instructions.trim() || null,
        type: v.type,
        severity: v.severity,
        barangayIds: v.scope === 'all' ? [] : v.barangayIds,
        expiresAt: v.expiresAt ? new Date(v.expiresAt).toISOString() : null,
        reportId: this.linkedReport()?.id ?? null,
      })
      .subscribe({
        next: (alert) => {
          const where = alert.barangays.length === 0 ? 'the whole municipality' : alert.barangays.map((b) => b.name).join(', ');
          this.toast.success('Alert issued', `Residents of ${where} are being notified now.`);
          void this.router.navigateByUrl('/alerts');
        },
        error: (err: unknown) => {
          this.error.set(errorMessage(err));
          this.busy.set(false);
        },
      });
  }

  private loadReport(id: number): void {
    this.reportsApi.get(id).subscribe({
      next: ({ report }) => {
        this.linkedReport.set(report);
        this.form.patchValue({
          title: `${report.type} emergency in ${report.barangayName}`,
          type: report.type,
          severity: report.severity,
          message:
            `Local officials have confirmed a ${report.type.toLowerCase()} emergency at ${report.location}, ` +
            `Barangay ${report.barangayName}. Stay away from the area and follow instructions from responders.`,
          scope: 'selected',
          barangayIds: [report.barangayId],
        });
      },
      error: (err: unknown) => this.toast.error('Could not load the report', errorMessage(err)),
    });
  }
}
