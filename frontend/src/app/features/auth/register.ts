import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { BarangaysApi } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { errorMessage } from '../../core/errors';
import { Barangay } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { PASSWORD_HINT, PASSWORD_PATTERN, PHONE_PATTERN } from '../../core/validators';
import { AuthBrand } from './auth-brand';

function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  return group.get('password')?.value === group.get('confirmPassword')?.value ? null : { mismatch: true };
}

@Component({
  selector: 'app-register-page',
  imports: [ReactiveFormsModule, RouterLink, AuthBrand],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './register.html',
})
export class RegisterPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly passwordHint = PASSWORD_HINT;
  protected readonly barangays = signal<Barangay[]>([]);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = inject(NonNullableFormBuilder).group(
    {
      fullName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
      email: ['', [Validators.required, Validators.email]],
      phoneNumber: ['', [Validators.required, Validators.pattern(PHONE_PATTERN)]],
      barangayId: [0, [Validators.required, Validators.min(1)]],
      address: ['', Validators.maxLength(200)],
      password: ['', [Validators.required, Validators.pattern(PASSWORD_PATTERN)]],
      confirmPassword: ['', Validators.required],
      acceptPrivacyNotice: [false, Validators.requiredTrue],
    },
    { validators: passwordsMatch },
  );

  constructor() {
    inject(BarangaysApi).list().subscribe({
      next: (list) => this.barangays.set(list),
      error: (err: unknown) => this.error.set(errorMessage(err, 'Could not load the list of barangays.')),
    });
  }

  protected invalid(name: string): boolean {
    const control = this.form.get(name);
    return !!control && control.touched && control.invalid;
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    const value = this.form.getRawValue();
    this.auth
      .register({
        fullName: value.fullName.trim(),
        email: value.email.trim(),
        phoneNumber: value.phoneNumber.trim(),
        password: value.password,
        barangayId: value.barangayId,
        address: value.address.trim() || null,
        acceptPrivacyNotice: value.acceptPrivacyNotice,
      })
      .subscribe({
        next: (user) => {
          this.toast.success('Account created', `You will now receive alerts for Barangay ${user.barangayName}.`);
          void this.router.navigateByUrl('/');
        },
        error: (err: unknown) => {
          this.error.set(errorMessage(err));
          this.busy.set(false);
        },
      });
  }
}
