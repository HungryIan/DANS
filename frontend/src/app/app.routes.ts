import { Routes } from '@angular/router';
import { authGuard, guestGuard, roleGuard } from './core/guards';
import { MANAGER_ROLES, STAFF_ROLES } from './core/meta';
import { Shell } from './layout/shell';

export const routes: Routes = [
  {
    path: 'login',
    title: 'Sign in · DANS',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login').then((m) => m.LoginPage),
  },
  {
    path: 'register',
    title: 'Create account · DANS',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/register').then((m) => m.RegisterPage),
  },
  {
    path: '',
    component: Shell,
    children: [
      // Public pages
      { path: '', title: 'DANS · Disaster Alert and Notification System', loadComponent: () => import('./features/home/home').then((m) => m.HomePage) },
      { path: 'alerts', title: 'Alerts · DANS', loadComponent: () => import('./features/alerts/alerts-page').then((m) => m.AlertsPage) },
      { path: 'evacuation-centers', title: 'Evacuation centers · DANS', loadComponent: () => import('./features/evacuation/centers-page').then((m) => m.CentersPage) },
      { path: 'safety-guides', title: 'Safety guides · DANS', loadComponent: () => import('./features/guides/guides-page').then((m) => m.GuidesPage) },
      { path: 'privacy', title: 'Privacy notice · DANS', loadComponent: () => import('./features/privacy/privacy-page').then((m) => m.PrivacyPage) },
      { path: 'hotlines', title: 'Emergency hotlines · DANS', loadComponent: () => import('./features/hotlines/hotlines-page').then((m) => m.HotlinesPage) },

      // Signed-in users
      { path: 'report', title: 'Report an emergency · DANS', canActivate: [authGuard], loadComponent: () => import('./features/reports/report-form').then((m) => m.ReportFormPage) },
      { path: 'my-reports', title: 'My reports · DANS', canActivate: [authGuard], loadComponent: () => import('./features/reports/my-reports').then((m) => m.MyReportsPage) },
      { path: 'reports/:id', title: 'Incident report · DANS', canActivate: [authGuard], loadComponent: () => import('./features/reports/report-detail').then((m) => m.ReportDetailPage) },
      { path: 'notifications', title: 'Notifications · DANS', canActivate: [authGuard], loadComponent: () => import('./features/notifications/notifications-page').then((m) => m.NotificationsPage) },
      { path: 'profile', title: 'My profile · DANS', canActivate: [authGuard], loadComponent: () => import('./features/profile/profile-page').then((m) => m.ProfilePage) },

      // Staff (volunteers, responders, officials, administrators)
      { path: 'dashboard', title: 'Dashboard · DANS', canActivate: [roleGuard(STAFF_ROLES)], loadComponent: () => import('./features/dashboard/dashboard-page').then((m) => m.DashboardPage) },
      { path: 'monitor', title: 'Incident monitor · DANS', canActivate: [roleGuard(STAFF_ROLES)], loadComponent: () => import('./features/monitor/monitor-page').then((m) => m.MonitorPage) },
      { path: 'records', title: 'Incident records · DANS', canActivate: [roleGuard(STAFF_ROLES)], loadComponent: () => import('./features/records/records-page').then((m) => m.RecordsPage) },

      // Officials and administrators
      { path: 'alerts/new', title: 'Issue alert · DANS', canActivate: [roleGuard(MANAGER_ROLES)], loadComponent: () => import('./features/alerts/alert-form').then((m) => m.AlertFormPage) },
      { path: 'evacuation-centers/new', title: 'Add evacuation center · DANS', canActivate: [roleGuard(MANAGER_ROLES)], loadComponent: () => import('./features/evacuation/center-form').then((m) => m.CenterFormPage) },
      { path: 'evacuation-centers/:id/edit', title: 'Edit evacuation center · DANS', canActivate: [roleGuard(MANAGER_ROLES)], loadComponent: () => import('./features/evacuation/center-form').then((m) => m.CenterFormPage) },
      { path: 'safety-guides/new', title: 'New safety guide · DANS', canActivate: [roleGuard(MANAGER_ROLES)], loadComponent: () => import('./features/guides/guide-form').then((m) => m.GuideFormPage) },
      { path: 'safety-guides/:id', title: 'Safety guide · DANS', loadComponent: () => import('./features/guides/guide-detail').then((m) => m.GuideDetailPage) },
      { path: 'safety-guides/:id/edit', title: 'Edit safety guide · DANS', canActivate: [roleGuard(MANAGER_ROLES)], loadComponent: () => import('./features/guides/guide-form').then((m) => m.GuideFormPage) },

      // Administrators
      { path: 'admin/users', title: 'Users · DANS', canActivate: [roleGuard(['Admin'])], loadComponent: () => import('./features/admin/users-page').then((m) => m.UsersPage) },
      { path: 'admin/barangays', title: 'Barangays · DANS', canActivate: [roleGuard(['Admin'])], loadComponent: () => import('./features/admin/barangays-page').then((m) => m.BarangaysPage) },
    ],
  },
  { path: '**', redirectTo: '' },
];
