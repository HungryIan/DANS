import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { debounceTime, merge } from 'rxjs';
import { BarangaysApi, CentersApi } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { errorMessage } from '../../core/errors';
import { CENTER_COLORS, CENTER_STATUSES, DATE_TIME } from '../../core/meta';
import { Barangay, CenterStatus, EvacuationCenter } from '../../core/models';
import { RealtimeService } from '../../core/realtime.service';
import { ToastService } from '../../core/toast.service';
import { Badge } from '../../shared/badge';
import { MapMarker, MapView } from '../../shared/map-view';
import { Meter, occupancyLevel } from '../../shared/meter';
import { LoadError } from '../../shared/load-error';
import { TimeAgoPipe } from '../../shared/pipes';

@Component({
  selector: 'app-centers-page',
  imports: [RouterLink, DatePipe, DecimalPipe, Badge, LoadError, MapView, Meter, TimeAgoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './centers-page.html',
})
export class CentersPage {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(CentersApi);
  private readonly toast = inject(ToastService);

  protected readonly statuses = CENTER_STATUSES;
  protected readonly colors = CENTER_COLORS;
  protected readonly dateTime = DATE_TIME;
  protected readonly centers = signal<EvacuationCenter[]>([]);
  protected readonly barangays = signal<Barangay[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly barangayId = signal<number | null>(null);
  protected readonly status = signal<CenterStatus | null>(null);

  /** Inline "update count" form for staff. */
  protected readonly editingId = signal<number | null>(null);
  protected readonly editCount = signal(0);
  protected readonly editStatus = signal<CenterStatus>('Open');
  protected readonly saving = signal(false);

  protected readonly filtered = computed(() =>
    this.centers().filter(
      (c) => (this.barangayId() === null || c.barangayId === this.barangayId()) && (this.status() === null || c.status === this.status()),
    ),
  );

  protected readonly totals = computed(() => {
    const list = this.centers();
    const active = list.filter((c) => c.status !== 'Closed');
    return {
      open: list.filter((c) => c.status === 'Open').length,
      full: list.filter((c) => c.status === 'Full').length,
      closed: list.filter((c) => c.status === 'Closed').length,
      evacuees: list.reduce((sum, c) => sum + c.currentOccupancy, 0),
      space: active.reduce((sum, c) => sum + Math.max(0, c.capacity - c.currentOccupancy), 0),
    };
  });

  protected readonly markers = computed<MapMarker[]>(() =>
    this.filtered()
      .filter((c) => c.latitude !== null && c.longitude !== null)
      .map((c) => ({
        id: c.id,
        lat: c.latitude!,
        lng: c.longitude!,
        color: CENTER_COLORS[c.status],
        title: c.name,
        subtitle: `${c.status} · ${c.currentOccupancy} / ${c.capacity} evacuees`,
      })),
  );

  constructor() {
    inject(BarangaysApi).list().subscribe({ next: (list) => this.barangays.set(list) });
    this.load();
    const realtime = inject(RealtimeService);
    merge(realtime.centersChanged$, realtime.reconnected$)
      .pipe(debounceTime(300), takeUntilDestroyed())
      .subscribe(() => this.load());
  }

  protected facilities(center: EvacuationCenter): string[] {
    return (center.facilities ?? '').split(',').map((f) => f.trim()).filter((f) => f.length > 0);
  }

  protected level(center: EvacuationCenter) {
    return occupancyLevel(center.currentOccupancy, center.capacity);
  }

  protected directions(center: EvacuationCenter): string {
    return `https://www.google.com/maps/dir/?api=1&destination=${center.latitude},${center.longitude}`;
  }

  protected onBarangayChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.barangayId.set(value ? Number(value) : null);
  }

  protected onStatusChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.status.set(value ? (value as CenterStatus) : null);
  }

  protected scrollTo(id: number): void {
    document.getElementById(`center-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  protected startEdit(center: EvacuationCenter): void {
    this.editingId.set(center.id);
    this.editCount.set(center.currentOccupancy);
    this.editStatus.set(center.status);
  }

  protected onCountInput(event: Event): void {
    this.editCount.set(Math.max(0, Math.floor(Number((event.target as HTMLInputElement).value) || 0)));
  }

  protected onEditStatus(event: Event): void {
    const status = (event.target as HTMLSelectElement).value as CenterStatus;
    this.editStatus.set(status);
    if (status === 'Closed') this.editCount.set(0); // a closed center houses nobody
  }

  protected saveCount(center: EvacuationCenter): void {
    this.saving.set(true);
    // Send the status only when it was changed, so the server can switch Open/Full automatically.
    const status = this.editStatus() !== center.status ? this.editStatus() : null;
    this.api.updateOccupancy(center.id, this.editCount(), status).subscribe({
      next: (updated) => {
        this.centers.update((list) => list.map((c) => (c.id === updated.id ? updated : c)));
        this.toast.success('Evacuation center updated', `${updated.name}: ${updated.currentOccupancy} evacuees (${updated.status}).`);
        this.editingId.set(null);
        this.saving.set(false);
      },
      error: (err: unknown) => {
        this.toast.error('Could not update the center', errorMessage(err));
        this.saving.set(false);
      },
    });
  }

  protected load(): void {
    this.api.list().subscribe({
      next: (list) => {
        this.centers.set(list);
        this.loadError.set(null);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.loadError.set(errorMessage(err, 'Could not load evacuation centers.'));
        this.loading.set(false);
      },
    });
  }
}
