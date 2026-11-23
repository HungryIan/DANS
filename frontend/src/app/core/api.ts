import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  Alert,
  AppNotification,
  AssignableUser,
  Barangay,
  BarangayStats,
  CenterStatus,
  CreateAlertRequest,
  CreateReportRequest,
  DashboardSummary,
  EmergencyContact,
  EvacuationCenter,
  Paged,
  Report,
  ReportDetail,
  ReportQuery,
  ReportStatus,
  SafetyGuide,
  SaveCenterRequest,
  SaveContactRequest,
  SaveGuideRequest,
  User,
  UserRole,
} from './models';

/** All requests go to /api, which the dev server proxies to the ASP.NET Core backend (see proxy.conf.json). */
const API = '/api';

/** Builds query parameters, skipping empty values. */
function params(query: object): HttpParams {
  let result = new HttpParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined || value === '' || value === false) continue;
    result = result.set(key, String(value));
  }
  return result;
}

@Injectable({ providedIn: 'root' })
export class AlertsApi {
  private readonly http = inject(HttpClient);

  list(query: { status?: 'active' | 'past' | 'all'; barangayId?: number | null; limit?: number } = {}) {
    return this.http.get<Alert[]>(`${API}/alerts`, { params: params(query) });
  }
  create(request: CreateAlertRequest) {
    return this.http.post<Alert>(`${API}/alerts`, request);
  }
  lift(id: number) {
    return this.http.post<Alert>(`${API}/alerts/${id}/lift`, {});
  }
}

@Injectable({ providedIn: 'root' })
export class ReportsApi {
  private readonly http = inject(HttpClient);

  create(request: CreateReportRequest) {
    return this.http.post<Report>(`${API}/reports`, request);
  }
  mine() {
    return this.http.get<Report[]>(`${API}/reports/mine`);
  }
  list(query: ReportQuery) {
    return this.http.get<Paged<Report>>(`${API}/reports`, { params: params(query) });
  }
  export(query: ReportQuery) {
    return this.http.get<Report[]>(`${API}/reports/export`, { params: params(query) });
  }
  get(id: number) {
    return this.http.get<ReportDetail>(`${API}/reports/${id}`);
  }
  addUpdate(id: number, body: { status: ReportStatus | null; note: string | null; notifyResidents: boolean }) {
    return this.http.post<ReportDetail>(`${API}/reports/${id}/updates`, body);
  }
  assign(id: number, assigneeId: number | null) {
    return this.http.put<ReportDetail>(`${API}/reports/${id}/assignment`, { assigneeId });
  }
}

@Injectable({ providedIn: 'root' })
export class CentersApi {
  private readonly http = inject(HttpClient);

  list(query: { barangayId?: number | null; status?: CenterStatus | null } = {}) {
    return this.http.get<EvacuationCenter[]>(`${API}/evacuation-centers`, { params: params(query) });
  }
  get(id: number) {
    return this.http.get<EvacuationCenter>(`${API}/evacuation-centers/${id}`);
  }
  create(request: SaveCenterRequest) {
    return this.http.post<EvacuationCenter>(`${API}/evacuation-centers`, request);
  }
  update(id: number, request: SaveCenterRequest) {
    return this.http.put<EvacuationCenter>(`${API}/evacuation-centers/${id}`, request);
  }
  updateOccupancy(id: number, currentOccupancy: number, status: CenterStatus | null = null) {
    return this.http.patch<EvacuationCenter>(`${API}/evacuation-centers/${id}/occupancy`, { currentOccupancy, status });
  }
  delete(id: number) {
    return this.http.delete<void>(`${API}/evacuation-centers/${id}`);
  }
}

@Injectable({ providedIn: 'root' })
export class GuidesApi {
  private readonly http = inject(HttpClient);

  list() {
    return this.http.get<SafetyGuide[]>(`${API}/safety-guides`);
  }
  get(id: number) {
    return this.http.get<SafetyGuide>(`${API}/safety-guides/${id}`);
  }
  create(request: SaveGuideRequest) {
    return this.http.post<SafetyGuide>(`${API}/safety-guides`, request);
  }
  update(id: number, request: SaveGuideRequest) {
    return this.http.put<SafetyGuide>(`${API}/safety-guides/${id}`, request);
  }
  delete(id: number) {
    return this.http.delete<void>(`${API}/safety-guides/${id}`);
  }
}

@Injectable({ providedIn: 'root' })
export class ContactsApi {
  private readonly http = inject(HttpClient);

  list() {
    return this.http.get<EmergencyContact[]>(`${API}/emergency-contacts`);
  }
  create(request: SaveContactRequest) {
    return this.http.post<EmergencyContact>(`${API}/emergency-contacts`, request);
  }
  update(id: number, request: SaveContactRequest) {
    return this.http.put<EmergencyContact>(`${API}/emergency-contacts/${id}`, request);
  }
  delete(id: number) {
    return this.http.delete<void>(`${API}/emergency-contacts/${id}`);
  }
}

@Injectable({ providedIn: 'root' })
export class NotificationsApi {
  private readonly http = inject(HttpClient);

  list(query: { unreadOnly?: boolean; limit?: number } = {}) {
    return this.http.get<AppNotification[]>(`${API}/notifications`, { params: params(query) });
  }
  unreadCount() {
    return this.http.get<{ count: number }>(`${API}/notifications/unread-count`);
  }
  markRead(id: number) {
    return this.http.post<void>(`${API}/notifications/${id}/read`, {});
  }
  markAllRead() {
    return this.http.post<void>(`${API}/notifications/read-all`, {});
  }
}

@Injectable({ providedIn: 'root' })
export class UsersApi {
  private readonly http = inject(HttpClient);

  list(query: { search?: string | null; role?: UserRole | null; page?: number; pageSize?: number }) {
    return this.http.get<Paged<User>>(`${API}/users`, { params: params(query) });
  }
  assignable() {
    return this.http.get<AssignableUser[]>(`${API}/users/assignable`);
  }
  setRole(id: number, role: UserRole) {
    return this.http.put<User>(`${API}/users/${id}/role`, { role });
  }
  setActive(id: number, isActive: boolean) {
    return this.http.put<User>(`${API}/users/${id}/status`, { isActive });
  }
}

@Injectable({ providedIn: 'root' })
export class BarangaysApi {
  private readonly http = inject(HttpClient);

  list() {
    return this.http.get<Barangay[]>(`${API}/barangays`);
  }
  stats() {
    return this.http.get<BarangayStats[]>(`${API}/barangays/stats`);
  }
  create(name: string) {
    return this.http.post<Barangay>(`${API}/barangays`, { name });
  }
  update(id: number, name: string) {
    return this.http.put<Barangay>(`${API}/barangays/${id}`, { name });
  }
  delete(id: number) {
    return this.http.delete<void>(`${API}/barangays/${id}`);
  }
}

@Injectable({ providedIn: 'root' })
export class DashboardApi {
  private readonly http = inject(HttpClient);

  summary() {
    return this.http.get<DashboardSummary>(`${API}/dashboard`);
  }
}
