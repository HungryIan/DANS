import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type MeterLevel = 'ok' | 'warning' | 'critical';

export function occupancyLevel(value: number, max: number): MeterLevel {
  if (max <= 0) return 'ok';
  const ratio = value / max;
  return ratio >= 1 ? 'critical' : ratio >= 0.8 ? 'warning' : 'ok';
}

/** Capacity meter (e.g. evacuees vs. capacity). The fill turns amber at 80% and red when full. */
@Component({
  selector: 'app-meter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span [class]="'meter meter-' + level()" role="meter" aria-valuemin="0"
          [attr.aria-valuemax]="max()" [attr.aria-valuenow]="value()" [attr.aria-label]="label()">
      <span class="meter-fill" [style.width.%]="percent()"></span>
    </span>
  `,
})
export class Meter {
  readonly value = input.required<number>();
  readonly max = input.required<number>();
  readonly label = input('');

  protected readonly percent = computed(() => (this.max() > 0 ? Math.min(100, (this.value() / this.max()) * 100) : 0));
  protected readonly level = computed(() => occupancyLevel(this.value(), this.max()));
}
