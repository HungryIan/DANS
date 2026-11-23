import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * Shown when a page could not load its data. It never pretends that "nothing" was found: during an emergency an
 * empty list must mean "no data", not "the server could not be reached".
 */
@Component({
  selector: 'app-load-error',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card empty load-error" role="alert">
      <span class="icon">cloud_off</span>
      <h3>{{ title() }}</h3>
      <p>{{ message() }}</p>
      @if (emergencyHint()) {
        <p class="small">In an emergency, call <a class="link" href="tel:911">911</a>.</p>
      }
      <button type="button" class="btn btn-primary" (click)="retry.emit()"><span class="icon">refresh</span>Try again</button>
    </div>
  `,
})
export class LoadError {
  readonly title = input('Could not load this page');
  readonly message = input.required<string>();
  /** Show the 911 reminder (for pages residents rely on during an emergency). */
  readonly emergencyHint = input(false);
  readonly retry = output<void>();
}
