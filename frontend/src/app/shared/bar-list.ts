import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { CountItem } from '../core/models';

/**
 * Ranked horizontal bar chart (largest first, one hue) with the value at each bar's tip,
 * a hover/focus tooltip, and a table view for screen readers and exact reading.
 */
@Component({
  selector: 'app-bar-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <figure class="viz">
      <div class="viz-toolbar">
        <span class="viz-caption">{{ caption() }}</span>
        @if (sorted().length > 0) {
          <button type="button" class="btn btn-ghost btn-sm" (click)="showTable.set(!showTable())" [attr.aria-pressed]="showTable()">
            <span class="icon">{{ showTable() ? 'bar_chart' : 'table_rows' }}</span>{{ showTable() ? 'Chart' : 'Table' }}
          </button>
        }
      </div>

      @if (sorted().length === 0) {
        <p class="viz-empty">{{ emptyText() }}</p>
      } @else if (showTable()) {
        <div class="table-wrap">
          <table class="table">
            <caption class="sr-only">{{ title() }}</caption>
            <thead>
              <tr><th scope="col">{{ categoryName() }}</th><th scope="col" class="num">Count</th><th scope="col" class="num">Share</th></tr>
            </thead>
            <tbody>
              @for (item of sorted(); track item.label) {
                <tr><td>{{ item.label }}</td><td class="num">{{ item.count }}</td><td class="num">{{ share(item) }}</td></tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <ul class="bars" [attr.aria-label]="title()">
          @for (item of sorted(); track item.label) {
            <li class="bar-row" tabindex="0"
                [attr.aria-label]="item.label + ': ' + item.count + ' ' + unitFor(item.count) + ' (' + share(item) + ')'"
                (pointerenter)="hovered.set(item.label)" (pointerleave)="hovered.set(null)"
                (focus)="hovered.set(item.label)" (blur)="hovered.set(null)">
              <span class="bar-label" [title]="item.label">{{ item.label }}</span>
              <span class="bar-area">
                <span class="bar" [style.width]="width(item)">
                  @if (hovered() === item.label) {
                    <span class="viz-tip" [class.tip-left]="ratio(item) < 0.5" role="tooltip">
                      <strong>{{ item.count }} {{ unitFor(item.count) }}</strong>
                      <span>{{ item.label }} · {{ share(item) }} of {{ total() }}</span>
                    </span>
                  }
                </span>
                <span class="bar-value">{{ item.count }}</span>
              </span>
            </li>
          }
        </ul>
      }
    </figure>
  `,
})
export class BarList {
  readonly items = input.required<CountItem[]>();
  /** Accessible name of the chart. */
  readonly title = input.required<string>();
  readonly categoryName = input('Category');
  /** Singular unit, e.g. "incident". */
  readonly unit = input('item');
  readonly emptyText = input('No data yet.');

  protected readonly showTable = signal(false);
  protected readonly hovered = signal<string | null>(null);

  protected readonly sorted = computed(() =>
    this.items()
      .filter((i) => i.count > 0)
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
  );
  protected readonly total = computed(() => this.sorted().reduce((sum, i) => sum + i.count, 0));
  private readonly max = computed(() => Math.max(1, ...this.sorted().map((i) => i.count)));
  protected readonly caption = computed(() => {
    const total = this.total();
    return total === 0 ? '' : `${total} ${this.unitFor(total)} in total`;
  });

  protected ratio(item: CountItem): number {
    return item.count / this.max();
  }

  /** Leaves 40px after the longest bar for its value label. */
  protected width(item: CountItem): string {
    return `calc((100% - 40px) * ${this.ratio(item).toFixed(4)})`;
  }

  protected share(item: CountItem): string {
    const total = this.total();
    return total === 0 ? '0%' : `${Math.round((item.count / total) * 100)}%`;
  }

  protected unitFor(count: number): string {
    return count === 1 ? this.unit() : `${this.unit()}s`;
  }
}
