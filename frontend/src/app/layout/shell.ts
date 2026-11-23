import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { ActiveAlertsStore } from '../core/alerts-store';
import { AuthService } from '../core/auth.service';
import { NotificationStore } from '../core/notification-store';
import { RealtimeService } from '../core/realtime.service';
import { AlertBanner } from './alert-banner';
import { NotificationBell } from './notification-bell';
import { UserMenu } from './user-menu';

interface NavItem {
  path: string;
  label: string;
  icon: string;
  exact?: boolean;
  sos?: boolean;
  count?: number;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

/** Main layout: sidebar navigation (filtered by role), top bar, active-alert banner and the page content. */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, AlertBanner, NotificationBell, UserMenu],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shell.html',
  host: { '(document:keydown.escape)': 'navOpen.set(false)' },
})
export class Shell {
  protected readonly auth = inject(AuthService);
  protected readonly realtime = inject(RealtimeService);
  private readonly alerts = inject(ActiveAlertsStore);
  private readonly notifications = inject(NotificationStore);

  protected readonly navOpen = signal(false);

  protected readonly sections = computed<NavSection[]>(() => {
    const sections: NavSection[] = [
      {
        title: 'Public safety',
        items: [
          { path: '/', label: 'Home', icon: 'home', exact: true },
          { path: '/alerts', label: 'Alerts', icon: 'campaign', exact: true, count: this.alerts.relevant().length },
          { path: '/evacuation-centers', label: 'Evacuation centers', icon: 'night_shelter' },
          { path: '/safety-guides', label: 'Safety guides', icon: 'health_and_safety' },
          { path: '/hotlines', label: 'Emergency hotlines', icon: 'call' },
        ],
      },
    ];

    const personal: NavItem[] = [{ path: '/report', label: 'Report emergency', icon: 'sos', sos: true }];
    if (this.auth.isLoggedIn()) {
      personal.push(
        { path: '/my-reports', label: 'My reports', icon: 'assignment' },
        { path: '/notifications', label: 'Notifications', icon: 'notifications', count: this.notifications.unreadCount() },
      );
    }
    sections.push({ title: this.auth.isLoggedIn() ? 'My account' : 'Get help', items: personal });

    if (this.auth.isStaff()) {
      const operations: NavItem[] = [
        { path: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
        { path: '/monitor', label: 'Incident monitor', icon: 'monitoring' },
        { path: '/records', label: 'Incident records', icon: 'folder_open' },
      ];
      if (this.auth.isManager()) operations.push({ path: '/alerts/new', label: 'Issue alert', icon: 'add_alert' });
      sections.push({ title: 'Operations', items: operations });
    }

    if (this.auth.isAdmin()) {
      sections.push({
        title: 'Administration',
        items: [
          { path: '/admin/users', label: 'Users', icon: 'group' },
          { path: '/admin/barangays', label: 'Barangays', icon: 'location_city' },
        ],
      });
    }
    return sections;
  });

  constructor() {
    // Close the mobile menu after navigating.
    inject(Router)
      .events.pipe(filter((e) => e instanceof NavigationEnd), takeUntilDestroyed())
      .subscribe(() => this.navOpen.set(false));
  }
}
