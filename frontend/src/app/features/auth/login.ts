import { ChangeDetectionStrategy, Component, inject, input, isDevMode, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { errorMessage } from '../../core/errors';
import { ToastService } from '../../core/toast.service';
import { buildFlags } from '../../../environments/build-flags';
import { AuthBrand } from './auth-brand';

/** Only allow redirects inside this app (prevents "open redirect" links). */
export function safeReturnUrl(url: string | undefined): string | null {
  return url && url.startsWith('/') && !url.startsWith('//') ? url : null;
}

@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule, RouterLink, AuthBrand],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login.html',
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  /** Set from the ?returnUrl= query parameter. */
  readonly returnUrl = input<string>();

  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly showPassword = signal(false);

  /** Shortcut buttons for the seeded demo accounts (development and presentation builds only). */
  protected readonly demoMode = isDevMode() || buildFlags.demoAccounts;
  protected readonly demoAccounts = [
    { role: 'Resident', email: 'resident@dans.local', password: 'Demo@123' },
    { role: 'Official', email: 'official@dans.local', password: 'Demo@123' },
    { role: 'Responder', email: 'responder@dans.local', password: 'Demo@123' },
    { role: 'Volunteer', email: 'volunteer@dans.local', password: 'Demo@123' },
    { role: 'Admin', email: 'admin@dans.local', password: 'Admin@123' },
  ];

  protected useDemo(account: { email: string; password: string }): void {
    this.form.setValue({ email: account.email, password: account.password });
    this.error.set(null);
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    const { email, password } = this.form.getRawValue();
    this.auth.login(email, password).subscribe({
      next: (user) => {
        this.toast.success(`Welcome back, ${user.fullName.split(' ')[0]}!`);
        const fallback = user.role === 'Resident' ? '/' : '/dashboard';
        void this.router.navigateByUrl(safeReturnUrl(this.returnUrl()) ?? fallback);
      },
      error: (err: unknown) => {
        this.error.set(errorMessage(err));
        this.busy.set(false);
      },
    });
  }
}
