import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { BarangaysApi, CentersApi } from '../../core/api';
import { errorMessage } from '../../core/errors';
import { CENTER_STATUSES } from '../../core/meta';
import { Barangay, CenterStatus, SaveCenterRequest } from '../../core/models';
import { ConfirmService } from '../../core/confirm.service';
import { ToastService } from '../../core/toast.service';
import { CONTACT_NUMBER_HINT, CONTACT_NUMBER_PATTERN } from '../../core/validators';
import { LatLng, MapView } from '../../shared/map-view';

/** Same rule as the API: a closed center cannot have evacuees. */
function closedCenterIsEmpty(group: AbstractControl): ValidationErrors | null {
  return group.get('status')?.value === 'Closed' && Number(group.get('currentOccupancy')?.value) > 0 ? { closedWithEvacuees: true } : null;
}

@Component({
  selector: 'app-center-form-page',
  imports: [ReactiveFormsModule, RouterLink, MapView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './center-form.html',
})
export class CenterFormPage {
  /** Route parameter :id (missing when adding a new center). */
  readonly id = input<string>();

  private readonly api = inject(CentersApi);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly statuses = CENTER_STATUSES;
  protected readonly contactHint = CONTACT_NUMBER_HINT;
  protected readonly barangays = signal<Barangay[]>([]);
  protected readonly location = signal<LatLng | null>(null);
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly isEdit = computed(() => Number(this.id()) > 0);

  protected readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(150)]],
    barangayId: [0, [Validators.required, Validators.min(1)]],
    address: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(250)]],
    capacity: [100, [Validators.required, Validators.min(1), Validators.max(100000)]],
    currentOccupancy: [0, [Validators.required, Validators.min(0), Validators.max(100000)]],
    status: this.fb.control<CenterStatus>('Closed'),
    contactPerson: ['', Validators.maxLength(100)],
    contactNumber: ['', [Validators.maxLength(30), Validators.pattern(CONTACT_NUMBER_PATTERN)]],
    facilities: ['', Validators.maxLength(500)],
  }, { validators: closedCenterIsEmpty });

  constructor() {
    inject(BarangaysApi).list().subscribe({ next: (list) => this.barangays.set(list) });

    effect(() => {
      const id = Number(this.id());
      if (id > 0) untracked(() => this.load(id));
    });
  }

  protected invalid(name: string): boolean {
    const control = this.form.get(name);
    return !!control && control.touched && control.invalid;
  }

  protected submit(): void {
    this.error.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set(
        this.form.hasError('closedWithEvacuees')
          ? 'A closed evacuation center cannot have evacuees. Set the number of evacuees to 0, or mark the center Open or Full.'
          : 'Please complete the highlighted fields.',
      );
      return;
    }
    const v = this.form.getRawValue();
    const point = this.location();
    const request: SaveCenterRequest = {
      name: v.name.trim(),
      barangayId: v.barangayId,
      address: v.address.trim(),
      capacity: v.capacity,
      currentOccupancy: v.currentOccupancy,
      status: v.status,
      contactPerson: v.contactPerson.trim() || null,
      contactNumber: v.contactNumber.trim() || null,
      facilities: v.facilities.trim() || null,
      latitude: point?.lat ?? null,
      longitude: point?.lng ?? null,
    };

    this.busy.set(true);
    const id = Number(this.id());
    const save$ = id > 0 ? this.api.update(id, request) : this.api.create(request);
    save$.subscribe({
      next: (center) => {
        this.toast.success(id > 0 ? 'Evacuation center updated' : 'Evacuation center added', center.name);
        void this.router.navigateByUrl('/evacuation-centers');
      },
      error: (err: unknown) => {
        this.error.set(errorMessage(err));
        this.busy.set(false);
      },
    });
  }

  protected async remove(): Promise<void> {
    const id = Number(this.id());
    if (!id) return;
    const confirmed = await this.confirm.ask({
      title: 'Delete this evacuation center?',
      message: `"${this.form.controls.name.value}" will be removed from the list and the map for everyone. This cannot be undone. ` +
        'To take a center out of use temporarily, set its status to Closed instead.',
      confirmText: 'Delete center',
      tone: 'danger',
      icon: 'delete',
    });
    if (!confirmed) return;
    this.busy.set(true);
    this.api.delete(id).subscribe({
      next: () => {
        this.toast.success('Evacuation center deleted');
        void this.router.navigateByUrl('/evacuation-centers');
      },
      error: (err: unknown) => {
        this.error.set(errorMessage(err));
        this.busy.set(false);
      },
    });
  }

  private load(id: number): void {
    this.loading.set(true);
    this.api.get(id).subscribe({
      next: (c) => {
        this.form.setValue({
          name: c.name,
          barangayId: c.barangayId,
          address: c.address,
          capacity: c.capacity,
          currentOccupancy: c.currentOccupancy,
          status: c.status,
          contactPerson: c.contactPerson ?? '',
          contactNumber: c.contactNumber ?? '',
          facilities: c.facilities ?? '',
        });
        this.location.set(c.latitude !== null && c.longitude !== null ? { lat: c.latitude, lng: c.longitude } : null);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(errorMessage(err));
        this.loading.set(false);
      },
    });
  }
}
