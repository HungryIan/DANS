import { Injectable, signal } from '@angular/core';

export type ToastKind = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  message?: string;
  link?: string | null;
}

/** Small pop-up messages in the corner of the screen. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private nextId = 1;

  show(kind: ToastKind, title: string, message?: string, link?: string | null): void {
    const toast: Toast = { id: this.nextId++, kind, title, message, link };
    this.toasts.update((list) => [...list, toast].slice(-4));
    const duration = kind === 'error' || kind === 'warning' ? 8000 : 5000;
    setTimeout(() => this.dismiss(toast.id), duration);
  }

  success(title: string, message?: string): void {
    this.show('success', title, message);
  }

  error(title: string, message?: string): void {
    this.show('error', title, message);
  }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }
}
