import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { GuidesApi } from '../../core/api';
import { errorMessage } from '../../core/errors';
import { DISASTER_TYPES } from '../../core/meta';
import { DisasterType } from '../../core/models';
import { ConfirmService } from '../../core/confirm.service';
import { ToastService } from '../../core/toast.service';

const lines = (text: string) => text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

@Component({
  selector: 'app-guide-form-page',
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page page-narrow">
      <div>
        <a class="back-link" routerLink="/safety-guides"><span class="icon">arrow_back</span>Safety guides</a>
        <header class="page-header">
          <h1>{{ isEdit() ? 'Edit safety guide' : 'New safety guide' }}</h1>
          @if (isEdit()) {
            <button type="button" class="btn btn-outline-danger" (click)="remove()" [disabled]="busy()"><span class="icon">delete</span>Delete</button>
          }
        </header>
      </div>

      <form class="card card-body form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        @if (error()) {
          <div class="callout callout-danger" role="alert"><span class="icon">error</span>{{ error() }}</div>
        }
        <div class="form-grid">
          <label class="field">
            <span class="field-label">Disaster type</span>
            <select class="input" formControlName="type">
              @for (t of types; track t.value) {
                <option [ngValue]="t.value">{{ t.value }}</option>
              }
            </select>
          </label>
          <label class="field">
            <span class="field-label">Title</span>
            <input class="input" formControlName="title" placeholder="e.g. Flood Safety" />
          </label>
        </div>
        <label class="field">
          <span class="field-label">Summary</span>
          <textarea class="input" formControlName="summary" rows="3" maxlength="1000"></textarea>
        </label>
        <p class="hint">Write one tip per line. Each line becomes an item in the checklist.</p>
        <label class="field">
          <span class="field-label">Before the disaster</span>
          <textarea class="input" formControlName="before" rows="6"></textarea>
        </label>
        <label class="field">
          <span class="field-label">During the disaster</span>
          <textarea class="input" formControlName="during" rows="6"></textarea>
          <span class="hint">These tips can be inserted into alerts as instructions.</span>
        </label>
        <label class="field">
          <span class="field-label">After the disaster</span>
          <textarea class="input" formControlName="after" rows="6"></textarea>
        </label>
        <div class="row" style="justify-content: flex-end">
          <a class="btn btn-ghost" routerLink="/safety-guides">Cancel</a>
          <button type="submit" class="btn btn-primary" [disabled]="busy()">{{ isEdit() ? 'Save changes' : 'Create guide' }}</button>
        </div>
      </form>
    </div>
  `,
})
export class GuideFormPage {
  readonly id = input<string>();

  private readonly api = inject(GuidesApi);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  protected readonly types = DISASTER_TYPES;
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly isEdit = computed(() => Number(this.id()) > 0);

  protected readonly form = inject(NonNullableFormBuilder).group({
    type: ['Flood' as DisasterType],
    title: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(150)]],
    summary: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(1000)]],
    before: [''],
    during: [''],
    after: [''],
  });

  constructor() {
    effect(() => {
      const id = Number(this.id());
      if (id > 0)
        untracked(() =>
          this.api.get(id).subscribe({
            next: (g) =>
              this.form.setValue({
                type: g.type,
                title: g.title,
                summary: g.summary,
                before: g.before.join('\n'),
                during: g.during.join('\n'),
                after: g.after.join('\n'),
              }),
            error: (err: unknown) => this.error.set(errorMessage(err)),
          }),
        );
    });
  }

  protected submit(): void {
    this.error.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Enter a title and a summary of at least 10 characters.');
      return;
    }
    const v = this.form.getRawValue();
    const request = {
      type: v.type,
      title: v.title.trim(),
      summary: v.summary.trim(),
      before: lines(v.before),
      during: lines(v.during),
      after: lines(v.after),
    };
    if (request.before.length + request.during.length + request.after.length === 0) {
      this.error.set('Add at least one safety tip.');
      return;
    }
    this.busy.set(true);
    const id = Number(this.id());
    (id > 0 ? this.api.update(id, request) : this.api.create(request)).subscribe({
      next: (guide) => {
        this.toast.success(id > 0 ? 'Guide updated' : 'Guide created', guide.title);
        void this.router.navigate(['/safety-guides', guide.id]);
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
      title: 'Delete this safety guide?',
      message: `"${this.form.controls.title.value}" will no longer be shown to residents, and its tips can no longer be inserted into alerts. This cannot be undone.`,
      confirmText: 'Delete guide',
      tone: 'danger',
      icon: 'delete',
    });
    if (!confirmed) return;
    this.busy.set(true);
    this.api.delete(id).subscribe({
      next: () => {
        this.toast.success('Guide deleted');
        void this.router.navigateByUrl('/safety-guides');
      },
      error: (err: unknown) => {
        this.error.set(errorMessage(err));
        this.busy.set(false);
      },
    });
  }
}
