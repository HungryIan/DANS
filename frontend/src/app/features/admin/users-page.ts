import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, catchError, debounceTime, of, switchMap, tap } from 'rxjs';
import { UsersApi } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { errorMessage } from '../../core/errors';
import { ROLE_DESCRIPTIONS, ROLES } from '../../core/meta';
import { Paged, User, UserRole } from '../../core/models';
import { ConfirmService } from '../../core/confirm.service';
import { ToastService } from '../../core/toast.service';
import { Badge } from '../../shared/badge';
import { LoadError } from '../../shared/load-error';

const PAGE_SIZE = 20;

/** Administrators assign roles (resident → volunteer, responder, official, admin) and deactivate accounts. */
@Component({
  selector: 'app-users-page',
  imports: [DatePipe, Badge, LoadError],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <h1>Users</h1>
          <p>Everyone registers as a resident. Promote trusted people to volunteer, responder or official here.</p>
        </div>
      </header>

      <div class="card card-body filters">
        <label class="field wide">
          <span class="field-label">Search</span>
          <input class="input" type="search" placeholder="Name, email or mobile number" (input)="onSearch($event)" />
        </label>
        <label class="field">
          <span class="field-label">Role</span>
          <select class="input" (change)="onRoleFilter($event)">
            <option value="">All roles</option>
            @for (r of roles; track r) {
              <option [value]="r">{{ r }}</option>
            }
          </select>
        </label>
      </div>

      <section class="card" [class.refreshing]="loading() && !!result()">
        @if (result(); as r) {
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th scope="col">User</th>
                  <th scope="col">Mobile</th>
                  <th scope="col">Barangay</th>
                  <th scope="col">Role</th>
                  <th scope="col">Status</th>
                  <th scope="col">Joined</th>
                </tr>
              </thead>
              <tbody>
                @for (user of r.items; track user.id) {
                  <tr>
                    <td>
                      <div class="cell-title">{{ user.fullName }}</div>
                      <div class="cell-sub">{{ user.email }}</div>
                    </td>
                    <td class="nowrap">{{ user.phoneNumber }}</td>
                    <td>{{ user.barangayName ?? '—' }}</td>
                    <td>
                      @if (user.id === auth.user()?.id) {
                        <app-badge [value]="user.role" label="{{ user.role }} (you)" />
                      } @else {
                        <select class="input" style="height: 34px; width: 152px" [attr.aria-label]="'Role of ' + user.fullName"
                                [disabled]="busyId() === user.id" (change)="changeRole(user, $event)">
                          @for (role of roles; track role) {
                            <option [value]="role" [selected]="role === user.role" [title]="descriptions[role]">{{ role }}</option>
                          }
                        </select>
                      }
                    </td>
                    <td>
                      @if (user.id === auth.user()?.id) {
                        <span class="badge badge-open"><span class="badge-dot"></span>Active</span>
                      } @else {
                        <label class="check">
                          <input type="checkbox" [checked]="user.isActive" [disabled]="busyId() === user.id" (change)="toggleActive(user, $event)" />
                          {{ user.isActive ? 'Active' : 'Deactivated' }}
                        </label>
                      }
                    </td>
                    <td class="nowrap">{{ user.createdAt | date: 'MMM d, y' }}</td>
                  </tr>
                } @empty {
                  <tr><td colspan="6"><div class="empty"><span class="icon">person_search</span><h3>No users found</h3></div></td></tr>
                }
              </tbody>
            </table>
          </div>
          <div class="pager">
            <span>{{ r.totalCount }} user(s)</span>
            <span class="row gap-sm">
              <button type="button" class="btn btn-sm" (click)="page.set(page() - 1)" [disabled]="page() <= 1"><span class="icon">chevron_left</span>Previous</button>
              <span>Page {{ page() }} of {{ pageCount() }}</span>
              <button type="button" class="btn btn-sm" (click)="page.set(page() + 1)" [disabled]="page() >= pageCount()">Next<span class="icon">chevron_right</span></button>
            </span>
          </div>
        } @else if (loadError()) {
          <app-load-error title="Could not load the users" [message]="loadError()!" (retry)="reload()" />
        } @else {
          <div class="loading"><span class="spinner"></span>Loading users…</div>
        }
      </section>

      <section class="card card-body">
        <h2 class="card-title" style="margin-bottom: 12px"><span class="icon">info</span>What each role can do</h2>
        <dl class="details">
          @for (role of roles; track role) {
            <div><dt><app-badge [value]="role" /></dt><dd class="small text-2" style="margin-top: 6px">{{ descriptions[role] }}</dd></div>
          }
        </dl>
      </section>
    </div>
  `,
})
export class UsersPage {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(UsersApi);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  protected readonly roles = ROLES;
  protected readonly descriptions = ROLE_DESCRIPTIONS;
  protected readonly search = signal('');
  protected readonly role = signal<UserRole | null>(null);
  protected readonly page = signal(1);
  protected readonly result = signal<Paged<User> | null>(null);
  protected readonly loading = signal(true);
  protected readonly busyId = signal<number | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly pageCount = computed(() => {
    const r = this.result();
    return r ? Math.max(1, Math.ceil(r.totalCount / r.pageSize)) : 1;
  });

  private readonly reload$ = new Subject<void>();
  private readonly search$ = new Subject<string>();

  constructor() {
    this.reload$
      .pipe(
        tap(() => this.loading.set(true)),
        switchMap(() =>
          this.api.list({ search: this.search() || null, role: this.role(), page: this.page(), pageSize: PAGE_SIZE }).pipe(
            catchError((err: unknown) => {
              this.loadError.set(errorMessage(err, 'Could not load the users.'));
              return of(null);
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((result) => {
        if (result) {
          this.result.set(result);
          this.loadError.set(null);
        }
        this.loading.set(false);
      });

    effect(() => {
      this.search();
      this.role();
      this.page();
      untracked(() => this.reload$.next());
    });

    this.search$.pipe(debounceTime(350), takeUntilDestroyed()).subscribe((value) => {
      this.search.set(value);
      this.page.set(1);
    });
  }

  protected reload(): void {
    this.reload$.next();
  }

  protected onSearch(event: Event): void {
    this.search$.next((event.target as HTMLInputElement).value.trim());
  }

  protected onRoleFilter(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.role.set(value ? (value as UserRole) : null);
    this.page.set(1);
  }

  protected async changeRole(user: User, event: Event): Promise<void> {
    const select = event.target as HTMLSelectElement;
    const role = select.value as UserRole;
    const demoted = role === 'Resident' && user.role !== 'Resident';
    const confirmed = await this.confirm.ask({
      title: `Make ${user.fullName} ${role === 'Admin' || role === 'Official' ? 'an' : 'a'} ${role}?`,
      message:
        `${ROLE_DESCRIPTIONS[role]}. ${user.fullName} will be signed out on every device and must sign in again.` +
        (demoted ? ' Open reports assigned to them will be unassigned so officials can reassign them.' : ''),
      confirmText: 'Change role',
      tone: role === 'Admin' || demoted ? 'danger' : 'primary',
      icon: 'manage_accounts',
    });
    if (!confirmed) {
      select.value = user.role;
      return;
    }
    this.busyId.set(user.id);
    this.api.setRole(user.id, role).subscribe({
      next: (updated) => this.replace(updated, `${updated.fullName} is now ${updated.role === 'Admin' ? 'an' : 'a'} ${updated.role}.`),
      error: (err: unknown) => {
        select.value = user.role;
        this.fail(err);
      },
    });
  }

  protected async toggleActive(user: User, event: Event): Promise<void> {
    const checkbox = event.target as HTMLInputElement;
    const isActive = checkbox.checked;
    if (!isActive) {
      const confirmed = await this.confirm.ask({
        title: `Deactivate ${user.fullName}?`,
        message:
          'They will be signed out at once, cannot sign in and stop receiving alerts until you reactivate the account. ' +
          'Open reports assigned to them will be unassigned so officials can reassign them.',
        confirmText: 'Deactivate account',
        tone: 'danger',
        icon: 'person_off',
      });
      if (!confirmed) {
        checkbox.checked = true;
        return;
      }
    }
    this.busyId.set(user.id);
    this.api.setActive(user.id, isActive).subscribe({
      next: (updated) => this.replace(updated, `${updated.fullName} was ${updated.isActive ? 'reactivated' : 'deactivated'}.`),
      error: (err: unknown) => {
        checkbox.checked = !isActive;
        this.fail(err);
      },
    });
  }

  private replace(updated: User, message: string): void {
    this.result.update((r) => (r ? { ...r, items: r.items.map((u) => (u.id === updated.id ? updated : u)) } : r));
    this.busyId.set(null);
    this.toast.success('User updated', message);
  }

  private fail(err: unknown): void {
    this.busyId.set(null);
    this.toast.error('Could not update the user', errorMessage(err));
  }
}
