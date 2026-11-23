import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Colored pill for severity levels, report statuses, center statuses and roles.
 * The text always names the state, so meaning never depends on color alone.
 */
@Component({
  selector: 'app-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span [class]="cssClass()"><span class="badge-dot" aria-hidden="true"></span>{{ label() || value() }}</span>`,
})
export class Badge {
  readonly value = input.required<string>();
  /** Optional text to show instead of the value. */
  readonly label = input<string>('');
  protected readonly cssClass = computed(() => `badge badge-${this.value().toLowerCase()}`);
}
