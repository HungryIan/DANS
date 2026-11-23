// Types that mirror the JSON returned by the ASP.NET Core API (enums are sent as strings).

export type UserRole = 'Resident' | 'Volunteer' | 'Responder' | 'Official' | 'Admin';
export type DisasterType = 'Flood' | 'Earthquake' | 'Landslide' | 'Fire' | 'Typhoon' | 'Medical' | 'Accident' | 'Other';
export type SeverityLevel = 'Low' | 'Moderate' | 'High' | 'Critical';
export type ReportStatus = 'Pending' | 'Verified' | 'Responding' | 'Resolved' | 'Dismissed';
export type CenterStatus = 'Open' | 'Full' | 'Closed';
export type NotificationType = 'Alert' | 'Report' | 'Assignment' | 'Evacuation' | 'System';

export interface User {
  id: number;
  fullName: string;
  email: string;
  phoneNumber: string;
  role: UserRole;
  barangayId: number | null;
  barangayName: string | null;
  address: string | null;
  isActive: boolean;
  createdAt: string;
}

/** Returned after signing in. The token is only in an HttpOnly cookie, never visible to JavaScript. */
export interface AuthResponse {
  expiresAt: string;
  user: User;
}

export interface Barangay {
  id: number;
  name: string;
}

export interface BarangayStats extends Barangay {
  residents: number;
  evacuationCenters: number;
  activeIncidents: number;
}

export interface Alert {
  id: number;
  title: string;
  message: string;
  instructions: string | null;
  type: DisasterType;
  severity: SeverityLevel;
  /** Target barangays. Empty means the whole municipality. */
  barangays: Barangay[];
  issuedBy: string;
  issuedAt: string;
  expiresAt: string | null;
  liftedAt: string | null;
  isActive: boolean;
  reportId: number | null;
}

export interface Report {
  id: number;
  referenceNo: string;
  type: DisasterType;
  severity: SeverityLevel;
  status: ReportStatus;
  barangayId: number;
  barangayName: string;
  location: string;
  description: string;
  peopleAffected: number | null;
  latitude: number | null;
  longitude: number | null;
  reporterId: number;
  reporterName: string;
  reporterPhone: string;
  assignedToId: number | null;
  assignedToName: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export interface ReportUpdate {
  id: number;
  status: ReportStatus | null;
  note: string | null;
  userName: string;
  userRole: UserRole;
  createdAt: string;
}

export interface ReportDetail {
  report: Report;
  updates: ReportUpdate[];
  canUpdate: boolean;
  canManage: boolean;
  hasActiveAlert: boolean;
}

export interface Paged<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
}

export interface AppNotification {
  id: number;
  title: string;
  message: string;
  type: NotificationType;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface EvacuationCenter {
  id: number;
  name: string;
  barangayId: number;
  barangayName: string;
  address: string;
  capacity: number;
  currentOccupancy: number;
  status: CenterStatus;
  contactPerson: string | null;
  contactNumber: string | null;
  facilities: string | null;
  latitude: number | null;
  longitude: number | null;
  updatedAt: string;
}

export interface SafetyGuide {
  id: number;
  type: DisasterType;
  title: string;
  summary: string;
  before: string[];
  during: string[];
  after: string[];
  updatedAt: string;
}

export interface EmergencyContact {
  id: number;
  name: string;
  number: string;
  description: string | null;
  sortOrder: number;
}

export interface AssignableUser {
  id: number;
  fullName: string;
  role: UserRole;
  barangayName: string | null;
}

export interface CountItem {
  label: string;
  count: number;
}

export interface DashboardSummary {
  activeAlerts: number;
  pendingReports: number;
  verifiedReports: number;
  respondingReports: number;
  resolvedLast7Days: number;
  reportsLast24Hours: number;
  totalReports: number;
  openCenters: number;
  totalCenters: number;
  openCapacity: number;
  totalEvacuees: number;
  activeByBarangay: CountItem[];
  byTypeLast30Days: CountItem[];
  byStatus: CountItem[];
  recentReports: Report[];
}

// ----- Requests -----

export interface RegisterRequest {
  fullName: string;
  email: string;
  phoneNumber: string;
  password: string;
  barangayId: number | null;
  address: string | null;
  /** Must be true: the user agreed to the privacy notice (Data Privacy Act of 2012). */
  acceptPrivacyNotice: boolean;
}

export interface UpdateProfileRequest {
  fullName: string;
  phoneNumber: string;
  barangayId: number | null;
  address: string | null;
}

export interface CreateAlertRequest {
  title: string;
  message: string;
  instructions: string | null;
  type: DisasterType;
  severity: SeverityLevel;
  barangayIds: number[];
  expiresAt: string | null;
  reportId: number | null;
}

export interface CreateReportRequest {
  type: DisasterType;
  severity: SeverityLevel;
  barangayId: number;
  location: string;
  description: string;
  peopleAffected: number | null;
  latitude: number | null;
  longitude: number | null;
}

export interface ReportQuery {
  status?: ReportStatus | null;
  activeOnly?: boolean;
  type?: DisasterType | null;
  barangayId?: number | null;
  from?: string | null;
  to?: string | null;
  search?: string | null;
  assignedToMe?: boolean;
  page?: number;
  pageSize?: number;
}

export interface SaveCenterRequest {
  name: string;
  barangayId: number;
  address: string;
  capacity: number;
  currentOccupancy: number;
  status: CenterStatus;
  contactPerson: string | null;
  contactNumber: string | null;
  facilities: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface SaveGuideRequest {
  type: DisasterType;
  title: string;
  summary: string;
  before: string[];
  during: string[];
  after: string[];
}

export interface SaveContactRequest {
  name: string;
  number: string;
  description: string | null;
  sortOrder: number;
}
