import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GuidesApi } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { errorMessage } from '../../core/errors';
import { SafetyGuide } from '../../core/models';
import { TypeIconPipe } from '../../shared/pipes';

@Component({
  selector: 'app-guides-page',
  imports: [RouterLink, TypeIconPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <h1>Safety guides</h1>
          <p>What to do before, during and after each type of disaster. Read them now, before an emergency happens.</p>
        </div>
        @if (auth.isManager()) {
          <a class="btn btn-primary" routerLink="/safety-guides/new"><span class="icon">add</span>New guide</a>
        }
      </header>

      @if (loading()) {
        <div class="loading"><span class="spinner"></span>Loading guides…</div>
      } @else if (error()) {
        <div class="callout callout-danger"><span class="icon">error</span>{{ error() }}</div>
      } @else {
        <div class="grid grid-auto">
          @for (guide of guides(); track guide.id) {
            <a class="card guide-card" [routerLink]="['/safety-guides', guide.id]">
              <span class="guide-icon"><span class="icon">{{ guide.type | typeIcon }}</span></span>
              <h2 style="font-size: 17px">{{ guide.title }}</h2>
              <p class="text-2 small">{{ guide.summary }}</p>
              <span class="row gap-sm small muted">
                <span class="icon" style="font-size: 18px">checklist</span>
                {{ guide.before.length + guide.during.length + guide.after.length }} safety tips
              </span>
            </a>
          } @empty {
            <div class="card empty" style="grid-column: 1 / -1">
              <span class="icon">health_and_safety</span>
              <h3>No safety guides yet</h3>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class GuidesPage {
  protected readonly auth = inject(AuthService);
  protected readonly guides = signal<SafetyGuide[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  constructor() {
    inject(GuidesApi).list().subscribe({
      next: (list) => {
        this.guides.set(list);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(errorMessage(err));
        this.loading.set(false);
      },
    });
  }
}
