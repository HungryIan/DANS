import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ToastKind, ToastService } from '../core/toast.service';

@Component({
  selector: 'app-toasts',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toasts" aria-live="polite">
      @for (toast of service.toasts(); track toast.id) {
        <div [class]="'toast toast-' + toast.kind" role="status">
          <span class="icon filled">{{ icons[toast.kind] }}</span>
          <div class="toast-body">
            <strong>{{ toast.title }}</strong>
            @if (toast.message) {
              <p>{{ toast.message }}</p>
            }
            @if (toast.link) {
              <a [routerLink]="toast.link" (click)="service.dismiss(toast.id)">Open</a>
            }
          </div>
          <button type="button" class="btn btn-ghost btn-icon btn-sm" (click)="service.dismiss(toast.id)" aria-label="Dismiss">
            <span class="icon">close</span>
          </button>
        </div>
      }
    </div>
  `,
})
export class Toasts {
  protected readonly service = inject(ToastService);
  protected readonly icons: Record<ToastKind, string> = {
    success: 'check_circle',
    error: 'error',
    info: 'info',
    warning: 'warning',
  };
}
