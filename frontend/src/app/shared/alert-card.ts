import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Alert } from '../core/models';
import { Badge } from './badge';
import { TimeAgoPipe, TypeIconPipe } from './pipes';

/** Displays one alert: severity, affected barangays, message and step-by-step instructions. */
@Component({
  selector: 'app-alert-card',
  imports: [Badge, DatePipe, TimeAgoPipe, TypeIconPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article [class]="cardClass()" [class.inactive]="!alert().isActive">
      <header class="alert-card-head">
        <span class="alert-symbol" aria-hidden="true"><span class="icon">{{ alert().type | typeIcon }}</span></span>
        <div style="min-width: 0">
          <div class="row wrap gap-sm">
            <app-badge [value]="alert().severity" />
            <span class="chip">{{ alert().type }}</span>
            @if (!alert().isActive) {
              <span class="chip">{{ alert().liftedAt ? 'Lifted' : 'Expired' }}</span>
            }
            @if (affectsMe() && alert().isActive) {
              <span class="chip chip-danger"><span class="icon">my_location</span>Your barangay</span>
            }
          </div>
          <h3>{{ alert().title }}</h3>
        </div>
      </header>

      <p class="alert-message">{{ alert().message }}</p>

      @if (!compact() && steps().length > 0) {
        <div class="instructions">
          <h4><span class="icon">checklist</span>What to do</h4>
          <ol>
            @for (step of steps(); track $index) {
              <li>{{ step }}</li>
            }
          </ol>
        </div>
      }

      <footer class="alert-meta">
        <span><span class="icon">location_on</span>{{ area() }}</span>
        <span [title]="alert().issuedAt | date: 'MMM d, y, h:mm a'">
          <span class="icon">schedule</span>{{ alert().issuedAt | timeAgo }} · {{ alert().issuedBy }}
        </span>
        @if (alert().isActive && alert().expiresAt) {
          <span><span class="icon">timer</span>Until {{ alert().expiresAt | date: 'MMM d, h:mm a' }}</span>
        }
        @if (alert().liftedAt) {
          <span><span class="icon">check_circle</span>Lifted {{ alert().liftedAt | date: 'MMM d, h:mm a' }}</span>
        }
        <span class="alert-actions"><ng-content /></span>
      </footer>
    </article>
  `,
})
export class AlertCard {
  readonly alert = input.required<Alert>();
  /** Hide the instructions (used in short lists). */
  readonly compact = input(false);
  /** Highlights alerts that cover this barangay. */
  readonly myBarangayId = input<number | null>(null);

  protected readonly cardClass = computed(() => `alert-card sev-${this.alert().severity.toLowerCase()}`);
  protected readonly steps = computed(() =>
    (this.alert().instructions ?? '').split('\n').map((s) => s.trim()).filter((s) => s.length > 0),
  );
  protected readonly area = computed(() => {
    const barangays = this.alert().barangays;
    return barangays.length === 0 ? 'Whole municipality' : barangays.map((b) => b.name).join(', ');
  });
  protected readonly affectsMe = computed(() => {
    const id = this.myBarangayId();
    if (id === null) return false;
    const barangays = this.alert().barangays;
    return barangays.length === 0 || barangays.some((b) => b.id === id);
  });
}
