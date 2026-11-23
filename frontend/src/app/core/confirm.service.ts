import { Injectable, signal } from '@angular/core';

export interface ConfirmOptions {
  title: string;
  message: string;
  /** Text of the confirming button, e.g. "Lift alert". */
  confirmText: string;
  cancelText?: string;
  /** "danger" for actions that delete, close or broadcast something; it colors the button red. */
  tone?: 'danger' | 'primary';
  /** Material Symbols icon name. */
  icon?: string;
}

interface OpenDialog extends ConfirmOptions {
  resolve: (confirmed: boolean) => void;
}

/**
 * Asks the user to confirm an important action in an accessible dialog (instead of the browser's confirm() box,
 * which cannot be styled, explains little and blocks the page).
 *
 *   if (!(await this.confirm.ask({ title: 'Delete center?', message: '…', confirmText: 'Delete', tone: 'danger' }))) return;
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  readonly current = signal<OpenDialog | null>(null);

  ask(options: ConfirmOptions): Promise<boolean> {
    this.current()?.resolve(false); // only one question at a time
    return new Promise((resolve) => this.current.set({ ...options, resolve }));
  }

  close(confirmed: boolean): void {
    const dialog = this.current();
    if (!dialog) return;
    this.current.set(null);
    dialog.resolve(confirmed);
  }
}
