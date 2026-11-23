import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { playAlarm, showDesktopNotification } from '../core/browser';
import { Alert } from '../core/models';
import { RealtimeService } from '../core/realtime.service';
import { TypeIconPipe } from '../shared/pipes';

/**
 * Full-screen popup that appears the moment an alert is issued for the user's area,
 * with an alarm sound and a desktop notification when the tab is in the background.
 */
@Component({
  selector: 'app-incoming-alert',
  imports: [RouterLink, TypeIconPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'dismiss()' },
  template: `
    @if (current(); as alert) {
      <div class="overlay" (click)="dismiss()">
        <div [class]="'modal sev-' + alert.severity.toLowerCase()" role="alertdialog" aria-modal="true"
             aria-labelledby="incoming-title" aria-describedby="incoming-message" (click)="$event.stopPropagation()">
          <div class="modal-head">
            <span class="icon filled">{{ alert.type | typeIcon }}</span>
            <div>
              <small>{{ alert.severity }} alert · {{ alert.type }}</small>
              <h2 id="incoming-title">{{ alert.title }}</h2>
            </div>
          </div>
          <div class="modal-body">
            <p id="incoming-message">{{ alert.message }}</p>
            @if (steps().length > 0) {
              <div class="instructions">
                <h4><span class="icon">checklist</span>What to do</h4>
                <ol>
                  @for (step of steps(); track $index) {
                    <li>{{ step }}</li>
                  }
                </ol>
              </div>
            }
            <p class="small muted">
              <span class="icon">location_on</span>
              {{ alert.barangays.length === 0 ? 'Whole municipality' : areaNames() }} · Issued by {{ alert.issuedBy }}
            </p>
            @if (queue().length > 1) {
              <p class="small strong">{{ queue().length - 1 }} more alert(s) waiting.</p>
            }
          </div>
          <div class="modal-foot">
            <a class="btn" routerLink="/evacuation-centers" (click)="dismissAll()">
              <span class="icon">night_shelter</span>Evacuation centers
            </a>
            <button #confirm type="button" class="btn btn-primary" (click)="dismiss()">I understand</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class IncomingAlert {
  protected readonly queue = signal<Alert[]>([]);
  protected readonly current = computed(() => this.queue()[0] ?? null);
  protected readonly steps = computed(() =>
    (this.current()?.instructions ?? '').split('\n').map((s) => s.trim()).filter((s) => s.length > 0),
  );
  protected readonly areaNames = computed(() => (this.current()?.barangays ?? []).map((b) => b.name).join(', '));
  private readonly confirmButton = viewChild<ElementRef<HTMLButtonElement>>('confirm');

  constructor() {
    const router = inject(Router);
    inject(RealtimeService)
      .alertIssued$.pipe(takeUntilDestroyed())
      .subscribe((alert) => {
        this.queue.update((queue) => [...queue.filter((a) => a.id !== alert.id), alert]);
        if (alert.severity !== 'Low') playAlarm(alert.severity === 'High' || alert.severity === 'Critical');
        showDesktopNotification(`${alert.severity.toUpperCase()} ALERT: ${alert.title}`, alert.message, () =>
          void router.navigateByUrl('/alerts'),
        );
      });

    // Move keyboard focus into the dialog when it opens.
    effect(() => this.confirmButton()?.nativeElement.focus());
  }

  protected dismiss(): void {
    this.queue.update((queue) => queue.slice(1));
  }

  protected dismissAll(): void {
    this.queue.set([]);
  }
}
