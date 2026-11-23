import { CenterStatus, DisasterType, NotificationType, ReportStatus, SeverityLevel, UserRole } from './models';

/** Labels, icons and colors for the enums used across the app. Icons are Material Symbols names. */

export const DISASTER_TYPES: readonly { value: DisasterType; icon: string }[] = [
  { value: 'Flood', icon: 'flood' },
  { value: 'Earthquake', icon: 'earthquake' },
  { value: 'Landslide', icon: 'landslide' },
  { value: 'Fire', icon: 'local_fire_department' },
  { value: 'Typhoon', icon: 'cyclone' },
  { value: 'Medical', icon: 'medical_services' },
  { value: 'Accident', icon: 'car_crash' },
  { value: 'Other', icon: 'emergency' },
];

/** Disaster types that usually affect a whole area, so verifying one warns the barangay by default. */
export const AREA_HAZARDS: readonly DisasterType[] = ['Flood', 'Earthquake', 'Landslide', 'Fire', 'Typhoon'];

export function typeIcon(type: DisasterType): string {
  return DISASTER_TYPES.find((t) => t.value === type)?.icon ?? 'emergency';
}

export const SEVERITIES: readonly { value: SeverityLevel; hint: string }[] = [
  { value: 'Low', hint: 'Minor, no immediate danger' },
  { value: 'Moderate', hint: 'Damage or risk to property' },
  { value: 'High', hint: 'People are at risk' },
  { value: 'Critical', hint: 'Life-threatening, act now' },
];

/** Marker colors on maps: the fixed status scale, so severity always reads the same way. */
export const SEVERITY_COLORS: Record<SeverityLevel, string> = {
  Low: '#0ca30c',
  Moderate: '#fab219',
  High: '#ec835a',
  Critical: '#d03b3b',
};

export const CENTER_COLORS: Record<CenterStatus, string> = {
  Open: '#0ca30c',
  Full: '#ec835a',
  Closed: '#898781',
};

export const REPORT_STATUSES: readonly ReportStatus[] = ['Pending', 'Verified', 'Responding', 'Resolved', 'Dismissed'];
export const ACTIVE_STATUSES: readonly ReportStatus[] = ['Pending', 'Verified', 'Responding'];
export const CENTER_STATUSES: readonly CenterStatus[] = ['Open', 'Full', 'Closed'];

export const ROLES: readonly UserRole[] = ['Resident', 'Volunteer', 'Responder', 'Official', 'Admin'];
export const STAFF_ROLES: readonly UserRole[] = ['Volunteer', 'Responder', 'Official', 'Admin'];
export const MANAGER_ROLES: readonly UserRole[] = ['Official', 'Admin'];

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  Resident: 'Receives alerts and can report emergencies',
  Volunteer: 'Helps at incidents and evacuation centers',
  Responder: 'Responds to assigned incidents',
  Official: 'Verifies reports and issues alerts',
  Admin: 'Full access, including user management',
};

export const STATUS_DESCRIPTIONS: Record<ReportStatus, string> = {
  Pending: 'Waiting for officials to verify',
  Verified: 'Confirmed by officials',
  Responding: 'Responders are on the way or on site',
  Resolved: 'The situation has been handled',
  Dismissed: 'Closed without action (duplicate or false report)',
};

export const NOTIFICATION_ICONS: Record<NotificationType, string> = {
  Alert: 'campaign',
  Report: 'assignment',
  Assignment: 'assignment_ind',
  Evacuation: 'night_shelter',
  System: 'info',
};

/** Map center: Municipality of Compostela, Davao de Oro. */
export const MAP_CENTER = { lat: 7.667, lng: 126.088 };

export const DATE_TIME = 'MMM d, y, h:mm a';
