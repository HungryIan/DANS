import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ActiveAlertsStore } from '../core/alerts-store';

/**
 * Strip under the top bar showing the most severe active alert for the user's area — or, when the alert list could
 * not be loaded, a warning that alerts are not being checked (never a silent "all clear").
 */
@Component({
  selector: 'app-alert-banner',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (top(); as alert) {
      <div [class]="'alert-banner sev-' + alert.severity.toLowerCase()" role="status">
        <span class="icon filled">warning</span>
        <span class="banner-text">
          <strong>{{ alert.severity.toUpperCase() }} ALERT</strong> · {{ alert.title }} —
          {{ alert.barangays.length === 0 ? 'Whole municipality' : barangayNames() }}
          @if (others() > 0) {
            <span> · +{{ others() }} more</span>
          }
        </span>
        <a routerLink="/alerts">View alerts</a>
      </div>
    } @else if (store.error()) {
      <div class="alert-banner banner-offline" role="status">
        <span class="icon">cloud_off</span>
        <span class="banner-text"><strong>Cannot check for alerts right now.</strong> Retrying automatically. In an emergency, call 911.</span>
        <button type="button" class="banner-action" (click)="store.refresh()">Try again</button>
      </div>
    }
  `,
})
export class AlertBanner {
  protected readonly store = inject(ActiveAlertsStore);

  /** The API returns active alerts ordered by severity, so the first one is the most serious. */
  protected readonly top = computed(() => this.store.relevant()[0] ?? null);
  protected readonly others = computed(() => Math.max(0, this.store.relevant().length - 1));
  protected readonly barangayNames = computed(() => (this.top()?.barangays ?? []).map((b) => b.name).join(', '));
}
