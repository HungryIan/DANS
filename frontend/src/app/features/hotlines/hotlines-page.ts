import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ContactsApi } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { errorMessage } from '../../core/errors';
import { EmergencyContact } from '../../core/models';
import { ConfirmService } from '../../core/confirm.service';
import { ToastService } from '../../core/toast.service';
import { CONTACT_NUMBER_HINT, CONTACT_NUMBER_PATTERN } from '../../core/validators';
import { LoadError } from '../../shared/load-error';

@Component({
  selector: 'app-hotlines-page',
  imports: [ReactiveFormsModule, LoadError],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page page-narrow">
      <header class="page-header">
        <div>
          <h1>Emergency hotlines</h1>
          <p>Tap a number to call. Save the most important ones on your phone now.</p>
        </div>
      </header>

      @if (loading()) {
        <div class="loading"><span class="spinner"></span>Loading hotlines…</div>
      } @else if (loadError() && contacts().length === 0) {
        <app-load-error title="Could not load the hotlines" [message]="loadError()!" [emergencyHint]="true" (retry)="load()" />
      } @else {
        <div class="card">
          @for (c of contacts(); track c.id) {
            <div class="hotline" [style.border-bottom]="$last ? 'none' : '1px solid var(--border)'">
              <span class="type-symbol" style="background: #fde8e8; color: #b91c1c"><span class="icon filled">call</span></span>
              <div class="spacer" style="min-width: 0">
                <div class="strong">{{ c.name }}</div>
                @if (c.description) { <div class="small text-2">{{ c.description }}</div> }
              </div>
              <a class="btn btn-danger" [href]="'tel:' + c.number" [attr.aria-label]="'Call ' + c.name">
                <span class="icon filled">call</span><span class="hotline-number" style="font-size: 16px">{{ c.number }}</span>
              </a>
              @if (auth.isManager()) {
                <button type="button" class="btn btn-ghost btn-icon btn-sm" (click)="edit(c)" aria-label="Edit"><span class="icon">edit</span></button>
                <button type="button" class="btn btn-ghost btn-icon btn-sm" (click)="remove(c)" aria-label="Delete"><span class="icon">delete</span></button>
              }
            </div>
          } @empty {
            <div class="empty"><span class="icon">call</span><h3>No hotlines yet</h3></div>
          }
        </div>
      }

      @if (auth.isManager()) {
        <form class="card card-body form" [formGroup]="form" (ngSubmit)="save()" novalidate>
          <h2 class="card-title"><span class="icon">{{ editingId() ? 'edit' : 'add_call' }}</span>{{ editingId() ? 'Edit hotline' : 'Add a hotline' }}</h2>
          <div class="form-grid">
            <label class="field">
              <span class="field-label">Name</span>
              <input class="input" formControlName="name" placeholder="e.g. Compostela MDRRMO" />
            </label>
            <label class="field">
              <span class="field-label">Number</span>
              <input class="input" type="tel" formControlName="number" placeholder="e.g. 0917XXXXXXX" />
              @if (form.controls.number.touched && form.controls.number.invalid) {
                <span class="error-text"><span class="icon">error</span>{{ contactHint }}</span>
              }
            </label>
            <label class="field span-2">
              <span class="field-label">Description <span class="optional">(optional)</span></span>
              <input class="input" formControlName="description" placeholder="What this number is for" />
            </label>
            <label class="field">
              <span class="field-label">Order in list</span>
              <input class="input" type="number" min="0" formControlName="sortOrder" />
            </label>
          </div>
          <div class="row" style="justify-content: flex-end">
            @if (editingId()) {
              <button type="button" class="btn btn-ghost" (click)="cancel()">Cancel</button>
            }
            <button type="submit" class="btn btn-primary" [disabled]="busy()">{{ editingId() ? 'Save changes' : 'Add hotline' }}</button>
          </div>
        </form>
      }
    </div>
  `,
})
export class HotlinesPage {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(ContactsApi);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  protected readonly contacts = signal<EmergencyContact[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly contactHint = CONTACT_NUMBER_HINT;
  protected readonly busy = signal(false);
  protected readonly editingId = signal<number | null>(null);

  protected readonly form = inject(NonNullableFormBuilder).group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
    number: ['', [Validators.required, Validators.maxLength(50), Validators.pattern(CONTACT_NUMBER_PATTERN)]],
    description: ['', Validators.maxLength(250)],
    sortOrder: [10, [Validators.min(0), Validators.max(1000)]],
  });

  constructor() {
    this.load();
  }

  protected edit(contact: EmergencyContact): void {
    this.editingId.set(contact.id);
    this.form.setValue({ name: contact.name, number: contact.number, description: contact.description ?? '', sortOrder: contact.sortOrder });
  }

  protected cancel(): void {
    this.editingId.set(null);
    this.form.reset();
  }

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.error('Check the form', `Enter a name and a valid number. ${CONTACT_NUMBER_HINT}`);
      return;
    }
    const v = this.form.getRawValue();
    const request = { name: v.name.trim(), number: v.number.trim(), description: v.description.trim() || null, sortOrder: v.sortOrder };
    const id = this.editingId();
    this.busy.set(true);
    (id ? this.api.update(id, request) : this.api.create(request)).subscribe({
      next: () => {
        this.toast.success(id ? 'Hotline updated' : 'Hotline added');
        this.cancel();
        this.busy.set(false);
        this.load();
      },
      error: (err: unknown) => {
        this.toast.error('Could not save the hotline', errorMessage(err));
        this.busy.set(false);
      },
    });
  }

  protected async remove(contact: EmergencyContact): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: 'Remove this hotline?',
      message: `"${contact.name}" (${contact.number}) will no longer be listed for residents. This cannot be undone.`,
      confirmText: 'Remove hotline',
      tone: 'danger',
      icon: 'delete',
    });
    if (!confirmed) return;
    this.api.delete(contact.id).subscribe({
      next: () => {
        this.toast.success('Hotline removed');
        this.load();
      },
      error: (err: unknown) => this.toast.error('Could not remove the hotline', errorMessage(err)),
    });
  }

  protected load(): void {
    this.api.list().subscribe({
      next: (list) => {
        this.contacts.set(list);
        this.loadError.set(null);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.loadError.set(errorMessage(err, 'Could not load the hotlines.'));
        this.loading.set(false);
      },
    });
  }
}
