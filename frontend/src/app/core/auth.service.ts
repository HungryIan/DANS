import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, firstValueFrom, map, of, tap } from 'rxjs';
import { AuthResponse, RegisterRequest, UpdateProfileRequest, User, UserRole } from './models';

/**
 * Keeps track of the signed-in user.
 *
 * The sign-in token lives only in an HttpOnly cookie set by the server, so JavaScript (and any injected script)
 * can never read it. The browser sends the cookie automatically; this service only keeps the user's profile.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly currentUser = signal<User | null>(null);

  readonly user = this.currentUser.asReadonly();
  readonly isLoggedIn = computed(() => this.currentUser() !== null);
  readonly role = computed(() => this.currentUser()?.role ?? null);
  /** Responders, volunteers, officials and administrators. */
  readonly isStaff = computed(() => {
    const role = this.role();
    return role !== null && role !== 'Resident';
  });
  /** Officials and administrators. */
  readonly isManager = computed(() => this.role() === 'Official' || this.role() === 'Admin');
  readonly isAdmin = computed(() => this.role() === 'Admin');

  /** Runs once when the app starts: asks the server whether this browser has a valid session. */
  init(): Promise<void> {
    try {
      localStorage.removeItem('dans.session'); // tokens were kept here by older versions; never again
    } catch {
      // storage unavailable — nothing to clean up
    }
    return firstValueFrom(
      this.http.get<{ user: User | null }>('/api/auth/session').pipe(
        tap((session) => this.currentUser.set(session.user)),
        map(() => undefined),
        catchError(() => of(undefined)),
      ),
    );
  }

  login(email: string, password: string): Observable<User> {
    return this.http.post<AuthResponse>('/api/auth/login', { email, password }).pipe(
      tap((response) => this.currentUser.set(response.user)),
      map((response) => response.user),
    );
  }

  register(request: RegisterRequest): Observable<User> {
    return this.http.post<AuthResponse>('/api/auth/register', request).pipe(
      tap((response) => this.currentUser.set(response.user)),
      map((response) => response.user),
    );
  }

  updateProfile(request: UpdateProfileRequest): Observable<User> {
    return this.http.put<User>('/api/auth/me', request).pipe(tap((user) => this.currentUser.set(user)));
  }

  /** Changing the password also signs out all other devices. */
  changePassword(currentPassword: string, newPassword: string): Observable<void> {
    return this.http.post<void>('/api/auth/me/password', { currentPassword, newPassword });
  }

  hasRole(roles: readonly UserRole[]): boolean {
    const role = this.role();
    return role !== null && roles.includes(role);
  }

  /** Ends the session on the server (the cookie is removed) and returns to the sign-in page. */
  logout(): void {
    this.http
      .post<void>('/api/auth/logout', {})
      .pipe(catchError(() => of(undefined)))
      .subscribe(() => this.signedOut());
  }

  /** Signs out on every device, e.g. after losing a phone. */
  logoutEverywhere(): Observable<void> {
    return this.http.post<void>('/api/auth/logout-all', {}).pipe(tap(() => this.signedOut()));
  }

  /** Forgets the user locally (used when the server says the session has ended). */
  clear(): void {
    this.currentUser.set(null);
  }

  private signedOut(): void {
    this.clear();
    void this.router.navigate(['/login']);
  }
}
