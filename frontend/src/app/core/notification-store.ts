import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { forkJoin, merge } from 'rxjs';
import { NotificationsApi } from './api';
import { AuthService } from './auth.service';
import { AppNotification } from './models';
import { RealtimeService } from './realtime.service';
import { ToastService } from './toast.service';

/** Unread count and latest notifications for the bell in the top bar. */
@Injectable({ providedIn: 'root' })
export class NotificationStore {
  private readonly api = inject(NotificationsApi);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly unreadCount = signal(0);
  readonly recent = signal<AppNotification[]>([]);

  private readonly userId = computed(() => this.auth.user()?.id ?? null);

  constructor() {
    const realtime = inject(RealtimeService);

    effect(() => {
      const userId = this.userId();
      untracked(() => (userId ? this.refresh() : this.reset()));
    });

    realtime.notification$.subscribe((n) => {
      if (!this.auth.isLoggedIn()) return;
      this.toast.show(n.type === 'Alert' || n.type === 'Evacuation' ? 'warning' : 'info', n.title, n.message, n.link);
      this.refresh();
    });

    // Alerts arrive with their own popup, but they also land in the inbox.
    merge(realtime.alertIssued$, realtime.reconnected$).subscribe(() => this.refresh());
  }

  refresh(): void {
    if (!this.auth.isLoggedIn()) return;
    forkJoin({ count: this.api.unreadCount(), recent: this.api.list({ limit: 8 }) }).subscribe({
      next: ({ count, recent }) => {
        this.unreadCount.set(count.count);
        this.recent.set(recent);
      },
      error: () => undefined,
    });
  }

  markRead(notification: AppNotification): void {
    if (notification.isRead) return;
    this.recent.update((list) => list.map((n) => (n.id === notification.id ? { ...n, isRead: true } : n)));
    this.unreadCount.update((count) => Math.max(0, count - 1));
    this.api.markRead(notification.id).subscribe({ error: () => this.refresh() });
  }

  markAllRead(): void {
    this.recent.update((list) => list.map((n) => ({ ...n, isRead: true })));
    this.unreadCount.set(0);
    this.api.markAllRead().subscribe({ error: () => this.refresh() });
  }

  private reset(): void {
    this.unreadCount.set(0);
    this.recent.set([]);
  }
}
