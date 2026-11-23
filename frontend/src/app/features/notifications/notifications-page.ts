import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { debounceTime, merge } from 'rxjs';
import { NotificationsApi } from '../../core/api';
import { desktopNotificationPermission, requestDesktopNotifications } from '../../core/browser';
import { errorMessage } from '../../core/errors';
import { DATE_TIME, NOTIFICATION_ICONS } from '../../core/meta';
import { AppNotification } from '../../core/models';
import { NotificationStore } from '../../core/notification-store';
import { RealtimeService } from '../../core/realtime.service';
import { LoadError } from '../../shared/load-error';
import { TimeAgoPipe } from '../../shared/pipes';

@Component({
  selector: 'app-notifications-page',
  imports: [DatePipe, LoadError, TimeAgoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page page-narrow">
      <header class="page-header">
        <div>
          <h1>Notifications</h1>
          <p>Alerts for your barangay and updates on reports you are involved in.</p>
        </div>
        <div class="page-actions">
          @if (store.unreadCount() > 0) {
            <button type="button" class="btn" (click)="markAllRead()"><span class="icon">done_all</span>Mark all as read</button>
          }
        </div>
      </header>

      @if (permission() === 'default') {
        <div class="callout callout-info">
          <span class="icon">desktop_windows</span>
          <div class="spacer">Get a desktop notification when an alert arrives while DANS is open in the background.</div>
          <button type="button" class="btn btn-sm btn-primary" (click)="enableDesktop()">Turn on</button>
        </div>
      } @else if (permission() === 'denied') {
        <div class="callout callout-warning">
          <span class="icon">notifications_off</span>
          <div>Desktop notifications are blocked in your browser settings. Alerts still appear in DANS while it is open.</div>
        </div>
      }

      <div class="tabs" role="tablist">
        <button type="button" role="tab" class="tab" [class.active]="!unreadOnly()" [attr.aria-selected]="!unreadOnly()" (click)="unreadOnly.set(false)">All</button>
        <button type="button" role="tab" class="tab" [class.active]="unreadOnly()" [attr.aria-selected]="unreadOnly()" (click)="unreadOnly.set(true)">
          Unread <span class="count">{{ store.unreadCount() }}</span>
        </button>
      </div>

      @if (loading()) {
        <div class="loading"><span class="spinner"></span>Loading notifications…</div>
      } @else if (loadError() && items().length === 0) {
        <app-load-error title="Could not load your notifications" [message]="loadError()!" (retry)="load()" />
      } @else {
        <div class="card notif-list" style="max-height: none">
          @for (n of visible(); track n.id) {
            <button type="button" class="notif-item" [class.unread]="!n.isRead" (click)="open(n)">
              <span [class]="'notif-icon type-' + n.type.toLowerCase()"><span class="icon">{{ icons[n.type] }}</span></span>
              <span class="notif-text">
                <span class="notif-title">{{ n.title }}</span>
                <span class="notif-message" style="-webkit-line-clamp: 4; line-clamp: 4">{{ n.message }}</span>
                <span class="notif-time" [title]="n.createdAt | date: dateTime">{{ n.createdAt | timeAgo }}</span>
              </span>
            </button>
          } @empty {
            <div class="empty">
              <span class="icon">notifications_off</span>
              <h3>{{ unreadOnly() ? 'No unread notifications' : 'No notifications yet' }}</h3>
              <p>Alerts and report updates will appear here.</p>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class NotificationsPage {
  protected readonly store = inject(NotificationStore);
  private readonly api = inject(NotificationsApi);
  private readonly router = inject(Router);

  protected readonly icons = NOTIFICATION_ICONS;
  protected readonly dateTime = DATE_TIME;
  protected readonly items = signal<AppNotification[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly unreadOnly = signal(false);
  protected readonly permission = signal(desktopNotificationPermission());
  protected readonly visible = computed(() => (this.unreadOnly() ? this.items().filter((n) => !n.isRead) : this.items()));

  constructor() {
    this.load();
    const realtime = inject(RealtimeService);
    merge(realtime.notification$, realtime.alertIssued$, realtime.reconnected$)
      .pipe(debounceTime(500), takeUntilDestroyed())
      .subscribe(() => this.load());
  }

  protected open(notification: AppNotification): void {
    this.store.markRead(notification);
    this.items.update((list) => list.map((n) => (n.id === notification.id ? { ...n, isRead: true } : n)));
    if (notification.link) void this.router.navigateByUrl(notification.link);
  }

  protected markAllRead(): void {
    this.store.markAllRead();
    this.items.update((list) => list.map((n) => ({ ...n, isRead: true })));
  }

  protected async enableDesktop(): Promise<void> {
    this.permission.set(await requestDesktopNotifications());
  }

  protected load(): void {
    this.api.list({ limit: 100 }).subscribe({
      next: (list) => {
        this.items.set(list);
        this.loadError.set(null);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.loadError.set(errorMessage(err, 'Could not load your notifications.'));
        this.loading.set(false);
      },
    });
  }
}
