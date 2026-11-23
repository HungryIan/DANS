import { ChangeDetectionStrategy, Component, ElementRef, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { desktopNotificationPermission, requestDesktopNotifications } from '../core/browser';
import { NOTIFICATION_ICONS } from '../core/meta';
import { AppNotification } from '../core/models';
import { NotificationStore } from '../core/notification-store';
import { TimeAgoPipe } from '../shared/pipes';

@Component({
  selector: 'app-notification-bell',
  imports: [RouterLink, TimeAgoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:click)': 'onDocumentClick($event)', '(document:keydown.escape)': 'open.set(false)' },
  template: `
    <div class="menu-anchor">
      <button type="button" class="btn btn-ghost btn-icon" (click)="toggle()" aria-haspopup="true"
              [attr.aria-expanded]="open()" [attr.aria-label]="'Notifications, ' + store.unreadCount() + ' unread'">
        <span class="icon" [class.filled]="store.unreadCount() > 0">notifications</span>
        @if (store.unreadCount() > 0) {
          <span class="bell-count">{{ store.unreadCount() > 99 ? '99+' : store.unreadCount() }}</span>
        }
      </button>

      @if (open()) {
        <div class="dropdown" role="dialog" aria-label="Notifications">
          <div class="dropdown-head">
            <strong>Notifications</strong>
            @if (store.unreadCount() > 0) {
              <button type="button" class="btn btn-ghost btn-sm" (click)="store.markAllRead()">Mark all as read</button>
            }
          </div>
          <div class="notif-list">
            @for (n of store.recent(); track n.id) {
              <button type="button" class="notif-item" [class.unread]="!n.isRead" (click)="openNotification(n)">
                <span [class]="'notif-icon type-' + n.type.toLowerCase()"><span class="icon">{{ icons[n.type] }}</span></span>
                <span class="notif-text">
                  <span class="notif-title">{{ n.title }}</span>
                  <span class="notif-message">{{ n.message }}</span>
                  <span class="notif-time">{{ n.createdAt | timeAgo }}</span>
                </span>
              </button>
            } @empty {
              <div class="empty"><span class="icon">notifications_off</span><p>You have no notifications yet.</p></div>
            }
          </div>
          @if (permission() === 'default') {
            <div class="dropdown-foot">
              <button type="button" class="btn btn-ghost btn-sm" (click)="enableDesktopAlerts()">
                <span class="icon">desktop_windows</span>Show alerts even when this tab is in the background
              </button>
            </div>
          }
          <div class="dropdown-foot">
            <a class="link" routerLink="/notifications" (click)="open.set(false)">View all notifications</a>
          </div>
        </div>
      }
    </div>
  `,
})
export class NotificationBell {
  protected readonly store = inject(NotificationStore);
  private readonly router = inject(Router);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly open = signal(false);
  protected readonly permission = signal(desktopNotificationPermission());
  protected readonly icons = NOTIFICATION_ICONS;

  protected toggle(): void {
    this.open.update((v) => !v);
    if (this.open()) this.store.refresh();
  }

  protected openNotification(notification: AppNotification): void {
    this.store.markRead(notification);
    this.open.set(false);
    if (notification.link) void this.router.navigateByUrl(notification.link);
  }

  protected async enableDesktopAlerts(): Promise<void> {
    this.permission.set(await requestDesktopNotifications());
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.element.nativeElement.contains(event.target as Node)) this.open.set(false);
  }
}
