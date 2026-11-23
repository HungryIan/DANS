import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { BarangaysApi, ReportsApi } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { errorMessage } from '../../core/errors';
import { DISASTER_TYPES, SEVERITIES } from '../../core/meta';
import { Barangay, DisasterType, SeverityLevel } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { LatLng, MapView } from '../../shared/map-view';

const round = (value: number) => Math.round(value * 1e6) / 1e6;

@Component({
  selector: 'app-report-form-page',
  imports: [ReactiveFormsModule, RouterLink, MapView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './report-form.html',
})
export class ReportFormPage {
  private readonly api = inject(ReportsApi);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly types = DISASTER_TYPES;
  protected readonly severities = SEVERITIES;
  protected readonly barangays = signal<Barangay[]>([]);
  protected readonly location = signal<LatLng | null>(null);
  protected readonly locating = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.group({
    type: this.fb.control<DisasterType | null>(null, Validators.required),
    severity: this.fb.control<SeverityLevel | null>(null, Validators.required),
    barangayId: [inject(AuthService).user()?.barangayId ?? 0, [Validators.required, Validators.min(1)]],
    location: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(200)]],
    description: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(2000)]],
    peopleAffected: this.fb.control<number | null>(null, [Validators.min(0), Validators.max(100000)]),
  });

  constructor() {
    inject(BarangaysApi).list().subscribe({ next: (list) => this.barangays.set(list) });
  }

  protected invalid(name: string): boolean {
    const control = this.form.get(name);
    return !!control && control.touched && control.invalid;
  }

  protected useMyLocation(): void {
    if (!('geolocation' in navigator)) {
      this.toast.error('Location not available', 'Tap the map to pin the location instead.');
      return;
    }
    this.locating.set(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        this.location.set({ lat: round(position.coords.latitude), lng: round(position.coords.longitude) });
        this.locating.set(false);
      },
      (err) => {
        this.locating.set(false);
        this.toast.error(
          'Could not get your location',
          err.code === err.PERMISSION_DENIED ? 'Location permission was denied. Tap the map instead.' : 'Tap the map to pin the location instead.',
        );
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  protected submit(): void {
    this.error.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Please complete the highlighted fields so responders know what is happening.');
      return;
    }
    const v = this.form.getRawValue();
    const point = this.location();
    this.busy.set(true);
    this.api
      .create({
        type: v.type!,
        severity: v.severity!,
        barangayId: v.barangayId,
        location: v.location.trim(),
        description: v.description.trim(),
        peopleAffected: v.peopleAffected,
        latitude: point?.lat ?? null,
        longitude: point?.lng ?? null,
      })
      .subscribe({
        next: (report) => {
          this.toast.success('Report sent', `Reference ${report.referenceNo}. Local officials have been notified.`);
          void this.router.navigate(['/reports', report.id]);
        },
        error: (err: unknown) => {
          this.error.set(errorMessage(err));
          this.busy.set(false);
        },
      });
  }
}
