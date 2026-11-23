import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, viewChild } from '@angular/core';
import { ConfirmService } from '../core/confirm.service';

/**
 * The dialog shown by ConfirmService. Keyboard: focus starts on Cancel (the safe choice), Tab stays inside the
 * dialog, Escape cancels, and focus returns to the button that opened it.
 */
@Component({
  selector: 'app-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'service.close(false)' },
  template: `
    @if (service.current(); as dialog) {
      <div class="overlay" (click)="service.close(false)">
        <div #box class="modal confirm-modal" role="alertdialog" aria-modal="true"
             aria-labelledby="confirm-title" aria-describedby="confirm-message"
             (click)="$event.stopPropagation()" (keydown.tab)="trapFocus($event)" (keydown.shift.tab)="trapFocus($event)">
          <div class="confirm-body">
            <span [class]="'confirm-icon ' + (dialog.tone ?? 'primary')" aria-hidden="true">
              <span class="icon">{{ dialog.icon ?? (dialog.tone === 'danger' ? 'warning' : 'help') }}</span>
            </span>
            <div class="stack-sm">
              <h2 id="confirm-title">{{ dialog.title }}</h2>
              <p id="confirm-message" class="pre-line text-2">{{ dialog.message }}</p>
            </div>
          </div>
          <div class="modal-foot">
            <button #cancel type="button" class="btn btn-ghost" (click)="service.close(false)">{{ dialog.cancelText ?? 'Cancel' }}</button>
            <button type="button" [class]="'btn ' + (dialog.tone === 'danger' ? 'btn-danger' : 'btn-primary')" (click)="service.close(true)">
              {{ dialog.confirmText }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ConfirmDialog {
  protected readonly service = inject(ConfirmService);
  private readonly box = viewChild<ElementRef<HTMLElement>>('box');
  private readonly cancelButton = viewChild<ElementRef<HTMLButtonElement>>('cancel');
  private returnFocusTo: HTMLElement | null = null;

  constructor() {
    effect(() => {
      if (this.service.current()) {
        this.returnFocusTo ??= document.activeElement as HTMLElement | null;
        this.cancelButton()?.nativeElement.focus();
      } else if (this.returnFocusTo) {
        this.returnFocusTo.focus?.();
        this.returnFocusTo = null;
      }
    });
  }

  protected trapFocus(event: Event): void {
    const box = this.box()?.nativeElement;
    if (!box) return;
    const buttons = Array.from(box.querySelectorAll<HTMLElement>('button'));
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    const backwards = (event as KeyboardEvent).shiftKey;
    if (backwards && document.activeElement === first) {
      last.focus();
      event.preventDefault();
    } else if (!backwards && document.activeElement === last) {
      first.focus();
      event.preventDefault();
    }
  }
}
