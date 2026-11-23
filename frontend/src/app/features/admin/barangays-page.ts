import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { BarangaysApi } from '../../core/api';
import { errorMessage } from '../../core/errors';
import { BarangayStats } from '../../core/models';
import { ConfirmService } from '../../core/confirm.service';
import { ToastService } from '../../core/toast.service';
import { LoadError } from '../../shared/load-error';

@Component({
  selector: 'app-barangays-page',
  imports: [LoadError],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page page-narrow">
      <header class="page-header">
        <div>
          <h1>Barangays</h1>
          <p>Areas used to target alerts. Residents choose one of these when they register.</p>
        </div>
      </header>

      <form class="card card-body inline-form" (submit)="add($event, nameInput)">
        <label class="field spacer">
          <span class="field-label">Add a barangay</span>
          <input #nameInput class="input" style="width: 100%" maxlength="100" placeholder="Barangay name" />
        </label>
        <button type="submit" class="btn btn-primary" style="align-self: flex-end" [disabled]="busy()"><span class="icon">add</span>Add</button>
      </form>

      <section class="card">
        @if (loading()) {
          <div class="loading"><span class="spinner"></span>Loading…</div>
        } @else if (loadError() && barangays().length === 0) {
          <app-load-error title="Could not load the barangays" [message]="loadError()!" (retry)="load()" />
        } @else {
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th scope="col">Barangay</th>
                  <th scope="col" class="num">Residents</th>
                  <th scope="col" class="num">Evacuation centers</th>
                  <th scope="col" class="num">Open incidents</th>
                  <th scope="col"><span class="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                @for (b of barangays(); track b.id) {
                  <tr>
                    <td>
                      @if (editingId() === b.id) {
                        <input class="input" style="height: 34px" [value]="editName()" maxlength="100" [attr.aria-label]="'New name for ' + b.name"
                               (input)="onEditName($event)" (keydown.enter)="rename(b, editName())" (keydown.escape)="editingId.set(null)" />
                      } @else {
                        <span class="cell-title">{{ b.name }}</span>
                      }
                    </td>
                    <td class="num">{{ b.residents }}</td>
                    <td class="num">{{ b.evacuationCenters }}</td>
                    <td class="num">{{ b.activeIncidents }}</td>
                    <td class="nowrap" style="text-align: right">
                      @if (editingId() === b.id) {
                        <button type="button" class="btn btn-sm btn-primary" (click)="rename(b, editName())">Save</button>
                        <button type="button" class="btn btn-sm btn-ghost" (click)="editingId.set(null)">Cancel</button>
                      } @else {
                        <button type="button" class="btn btn-ghost btn-icon btn-sm" (click)="startEdit(b)" [attr.aria-label]="'Rename ' + b.name"><span class="icon">edit</span></button>
                        <button type="button" class="btn btn-ghost btn-icon btn-sm" (click)="remove(b)" [attr.aria-label]="'Delete ' + b.name"><span class="icon">delete</span></button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <p class="small muted" style="padding: 12px 16px; border-top: 1px solid var(--border)">
            Barangays that already have residents, reports, alerts or evacuation centers cannot be deleted, but they can be renamed.
          </p>
        }
      </section>
    </div>
  `,
})
export class BarangaysPage {
  private readonly api = inject(BarangaysApi);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  protected readonly barangays = signal<BarangayStats[]>([]);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly editingId = signal<number | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly editName = signal('');

  constructor() {
    this.load();
  }

  protected add(event: Event, input: HTMLInputElement): void {
    event.preventDefault();
    const name = input.value.trim();
    if (name.length < 2) {
      this.toast.error('Enter a barangay name', 'The name must have at least 2 characters.');
      return;
    }
    this.busy.set(true);
    this.api.create(name).subscribe({
      next: (b) => {
        input.value = '';
        this.busy.set(false);
        this.toast.success('Barangay added', b.name);
        this.load();
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.toast.error('Could not add the barangay', errorMessage(err));
      },
    });
  }

  protected startEdit(barangay: BarangayStats): void {
    this.editName.set(barangay.name);
    this.editingId.set(barangay.id);
  }

  protected onEditName(event: Event): void {
    this.editName.set((event.target as HTMLInputElement).value);
  }

  protected rename(barangay: BarangayStats, value: string): void {
    const name = value.trim();
    if (name === barangay.name || name.length < 2) {
      this.editingId.set(null);
      return;
    }
    this.api.update(barangay.id, name).subscribe({
      next: () => {
        this.editingId.set(null);
        this.toast.success('Barangay renamed', name);
        this.load();
      },
      error: (err: unknown) => this.toast.error('Could not rename the barangay', errorMessage(err)),
    });
  }

  protected async remove(barangay: BarangayStats): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: `Delete Barangay ${barangay.name}?`,
      message: 'It will no longer be available for registration, reports or alerts. A barangay that already has residents, ' +
        'reports, alerts or evacuation centers cannot be deleted; rename it instead.',
      confirmText: 'Delete barangay',
      tone: 'danger',
      icon: 'delete',
    });
    if (!confirmed) return;
    this.api.delete(barangay.id).subscribe({
      next: () => {
        this.toast.success('Barangay deleted', barangay.name);
        this.load();
      },
      error: (err: unknown) => this.toast.error('Could not delete the barangay', errorMessage(err)),
    });
  }

  protected load(): void {
    this.api.stats().subscribe({
      next: (list) => {
        this.barangays.set(list);
        this.loadError.set(null);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.loadError.set(errorMessage(err, 'Could not load the barangays.'));
        this.loading.set(false);
      },
    });
  }
}
