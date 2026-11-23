import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GuidesApi } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { errorMessage } from '../../core/errors';
import { SafetyGuide } from '../../core/models';
import { TypeIconPipe } from '../../shared/pipes';

@Component({
  selector: 'app-guide-detail-page',
  imports: [RouterLink, DatePipe, TypeIconPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <a class="back-link" routerLink="/safety-guides"><span class="icon">arrow_back</span>Safety guides</a>
      @if (error()) {
        <div class="callout callout-danger"><span class="icon">error</span>{{ error() }}</div>
      } @else if (guide(); as g) {
        <header class="page-header">
          <div class="row top">
            <span class="type-symbol" style="background: var(--primary-soft); color: var(--primary)"><span class="icon">{{ g.type | typeIcon }}</span></span>
            <div>
              <h1>{{ g.title }}</h1>
              <p style="max-width: 760px">{{ g.summary }}</p>
            </div>
          </div>
          <div class="page-actions">
            <a class="btn" routerLink="/evacuation-centers"><span class="icon">night_shelter</span>Evacuation centers</a>
            @if (auth.isManager()) {
              <a class="btn btn-ghost" [routerLink]="['/safety-guides', g.id, 'edit']"><span class="icon">edit</span>Edit</a>
            }
          </div>
        </header>

        <div class="grid grid-3">
          @for (phase of phases(g); track phase.key) {
            <section [class]="'card phase ' + phase.key">
              <h2><span class="phase-num">{{ $index + 1 }}</span>{{ phase.title }}</h2>
              @if (phase.tips.length > 0) {
                <ul class="checklist">
                  @for (tip of phase.tips; track $index) {
                    <li><span class="icon">check_circle</span><span>{{ tip }}</span></li>
                  }
                </ul>
              } @else {
                <p class="muted small">No tips yet.</p>
              }
            </section>
          }
        </div>

        <div class="callout callout-danger">
          <span class="icon filled">call</span>
          <div>In an emergency, call <a href="tel:911">911</a> or see the <a routerLink="/hotlines">local emergency hotlines</a>.</div>
        </div>
        <p class="small muted">Last updated {{ g.updatedAt | date: 'MMMM d, y' }}</p>
      } @else {
        <div class="loading"><span class="spinner"></span>Loading guide…</div>
      }
    </div>
  `,
})
export class GuideDetailPage {
  readonly id = input.required<string>();
  protected readonly auth = inject(AuthService);
  private readonly api = inject(GuidesApi);
  protected readonly guide = signal<SafetyGuide | null>(null);
  protected readonly error = signal<string | null>(null);

  constructor() {
    effect(() => {
      const id = Number(this.id());
      untracked(() =>
        this.api.get(id).subscribe({
          next: (g) => this.guide.set(g),
          error: (err: unknown) => this.error.set(errorMessage(err)),
        }),
      );
    });
  }

  protected phases(g: SafetyGuide) {
    return [
      { key: 'before', title: 'Before', tips: g.before },
      { key: 'during', title: 'During', tips: g.during },
      { key: 'after', title: 'After', tips: g.after },
    ];
  }
}
