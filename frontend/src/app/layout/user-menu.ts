import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-user-menu',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:click)': 'onDocumentClick($event)', '(document:keydown.escape)': 'open.set(false)' },
  template: `
    @if (auth.user(); as user) {
      <div class="menu-anchor">
        <button type="button" class="user-button" (click)="open.set(!open())" aria-haspopup="menu" [attr.aria-expanded]="open()">
          <span class="avatar" aria-hidden="true">{{ initials() }}</span>
          <span class="user-meta">
            <strong>{{ user.fullName }}</strong>
            <small>{{ user.role }}{{ user.barangayName ? ' · ' + user.barangayName : '' }}</small>
          </span>
          <span class="icon muted">expand_more</span>
        </button>
        @if (open()) {
          <div class="dropdown dropdown-menu" role="menu">
            <a class="menu-item" role="menuitem" routerLink="/profile" (click)="open.set(false)"><span class="icon">person</span>My profile</a>
            <a class="menu-item" role="menuitem" routerLink="/my-reports" (click)="open.set(false)"><span class="icon">assignment</span>My reports</a>
            <a class="menu-item" role="menuitem" routerLink="/notifications" (click)="open.set(false)"><span class="icon">notifications</span>Notifications</a>
            <hr />
            <button type="button" class="menu-item" role="menuitem" (click)="auth.logout()"><span class="icon">logout</span>Sign out</button>
          </div>
        }
      </div>
    }
  `,
})
export class UserMenu {
  protected readonly auth = inject(AuthService);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly open = signal(false);

  protected readonly initials = computed(() =>
    (this.auth.user()?.fullName ?? '?')
      .split(/\s+/)
      .filter((part) => part.length > 0)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join(''),
  );

  protected onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.element.nativeElement.contains(event.target as Node)) this.open.set(false);
  }
}
