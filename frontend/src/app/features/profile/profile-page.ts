import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { BarangaysApi } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { errorMessage } from '../../core/errors';
import { ROLE_DESCRIPTIONS } from '../../core/meta';
import { Barangay } from '../../core/models';
import { ConfirmService } from '../../core/confirm.service';
import { ToastService } from '../../core/toast.service';
import { Badge } from '../../shared/badge';
import { PASSWORD_HINT, PASSWORD_PATTERN, PHONE_PATTERN } from '../../core/validators';

function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  return group.get('newPassword')?.value === group.get('confirmPassword')?.value ? null : { mismatch: true };
}

@Component({
  selector: 'app-profile-page',
  imports: [ReactiveFormsModule, DatePipe, Badge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page page-narrow">
      <header class="page-header">
        <div>
          <h1>My profile</h1>
          <p>Keep your barangay and mobile number up to date so alerts and responders reach you.</p>
        </div>
      </header>

      @if (auth.user(); as user) {
        <section class="card card-body row wrap">
          <span class="avatar" style="width: 56px; height: 56px; font-size: 20px">{{ user.fullName.charAt(0) }}</span>
          <div class="spacer">
            <div class="strong" style="font-size: 18px">{{ user.fullName }}</div>
            <div class="text-2 small">{{ user.email }} · member since {{ user.createdAt | date: 'MMMM y' }}</div>
          </div>
          <div class="stack-sm" style="align-items: flex-end">
            <app-badge [value]="user.role" />
            <span class="small muted">{{ roleDescriptions[user.role] }}</span>
          </div>
        </section>
      }

      <form class="card card-body form" [formGroup]="profileForm" (ngSubmit)="saveProfile()" novalidate>
        <h2 class="card-title"><span class="icon">badge</span>Personal details</h2>
        <div class="form-grid">
          <label class="field">
            <span class="field-label">Full name</span>
            <input class="input" formControlName="fullName" autocomplete="name" />
          </label>
          <label class="field">
            <span class="field-label">Mobile number</span>
            <input class="input" type="tel" formControlName="phoneNumber" autocomplete="tel" />
            @if (profileForm.controls.phoneNumber.touched && profileForm.controls.phoneNumber.invalid) {
              <span class="error-text"><span class="icon">error</span>Use the format 09XXXXXXXXX.</span>
            }
          </label>
          <label class="field">
            <span class="field-label">Barangay</span>
            <select class="input" formControlName="barangayId">
              <option [ngValue]="null">{{ auth.user()?.role === 'Resident' ? 'Select your barangay' : 'None' }}</option>
              @for (b of barangays(); track b.id) {
                <option [ngValue]="b.id">{{ b.name }}</option>
              }
            </select>
            <span class="hint">You receive alerts issued for this barangay.</span>
          </label>
          <label class="field">
            <span class="field-label">Purok / street <span class="optional">(optional)</span></span>
            <input class="input" formControlName="address" />
          </label>
        </div>
        <div class="row" style="justify-content: flex-end">
          <button type="submit" class="btn btn-primary" [disabled]="savingProfile()">Save details</button>
        </div>
      </form>

      <form class="card card-body form" [formGroup]="passwordForm" (ngSubmit)="changePassword()" novalidate>
        <h2 class="card-title"><span class="icon">lock</span>Change password</h2>
        <div class="form-grid">
          <label class="field span-2">
            <span class="field-label">Current password</span>
            <input class="input" type="password" formControlName="currentPassword" autocomplete="current-password" />
          </label>
          <label class="field">
            <span class="field-label">New password</span>
            <input class="input" type="password" formControlName="newPassword" autocomplete="new-password" />
            <span class="hint">{{ passwordHint }}</span>
          </label>
          <label class="field">
            <span class="field-label">Confirm new password</span>
            <input class="input" type="password" formControlName="confirmPassword" autocomplete="new-password" />
            @if (passwordForm.controls.confirmPassword.touched && passwordForm.hasError('mismatch')) {
              <span class="error-text"><span class="icon">error</span>Passwords do not match.</span>
            }
          </label>
        </div>
        <p class="hint">Changing your password signs you out on all other devices.</p>
        <div class="row" style="justify-content: flex-end">
          <button type="submit" class="btn" [disabled]="savingPassword()">Change password</button>
        </div>
      </form>

      <section class="card card-body row wrap">
        <div class="spacer" style="min-width: 220px">
          <h2 class="card-title"><span class="icon">devices</span>Signed-in devices</h2>
          <p class="text-2 small" style="margin-top: 4px">Lost a phone or used a shared computer? Sign out everywhere, including this browser.</p>
        </div>
        <button type="button" class="btn btn-outline-danger" (click)="signOutEverywhere()" [disabled]="signingOut()">
          <span class="icon">logout</span>Sign out of all devices
        </button>
      </section>
    </div>
  `,
})
export class ProfilePage {
  protected readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly roleDescriptions = ROLE_DESCRIPTIONS;
  protected readonly passwordHint = PASSWORD_HINT;
  protected readonly signingOut = signal(false);
  protected readonly barangays = signal<Barangay[]>([]);
  protected readonly savingProfile = signal(false);
  protected readonly savingPassword = signal(false);

  protected readonly profileForm = this.fb.group({
    fullName: [this.auth.user()?.fullName ?? '', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
    phoneNumber: [this.auth.user()?.phoneNumber ?? '', [Validators.required, Validators.pattern(PHONE_PATTERN)]],
    barangayId: this.fb.control<number | null>(this.auth.user()?.barangayId ?? null),
    address: [this.auth.user()?.address ?? '', Validators.maxLength(200)],
  });

  protected readonly passwordForm = this.fb.group(
    {
      currentPassword: ['', Validators.required],
      newPassword: ['', [Validators.required, Validators.pattern(PASSWORD_PATTERN)]],
      confirmPassword: ['', Validators.required],
    },
    { validators: passwordsMatch },
  );

  constructor() {
    inject(BarangaysApi).list().subscribe({ next: (list) => this.barangays.set(list) });
  }

  protected saveProfile(): void {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }
    const v = this.profileForm.getRawValue();
    this.savingProfile.set(true);
    this.auth
      .updateProfile({ fullName: v.fullName.trim(), phoneNumber: v.phoneNumber.trim(), barangayId: v.barangayId, address: v.address.trim() || null })
      .subscribe({
        next: (user) => {
          this.toast.success('Profile saved', user.barangayName ? `You will receive alerts for Barangay ${user.barangayName}.` : undefined);
          this.savingProfile.set(false);
        },
        error: (err: unknown) => {
          this.toast.error('Could not save your profile', errorMessage(err));
          this.savingProfile.set(false);
        },
      });
  }

  protected changePassword(): void {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      this.toast.error('Check the password form', `${PASSWORD_HINT} The confirmation must match.`);
      return;
    }
    const v = this.passwordForm.getRawValue();
    this.savingPassword.set(true);
    this.auth.changePassword(v.currentPassword, v.newPassword).subscribe({
      next: () => {
        this.toast.success('Password changed', 'Other devices have been signed out.');
        this.passwordForm.reset();
        this.savingPassword.set(false);
      },
      error: (err: unknown) => {
        this.toast.error('Could not change the password', errorMessage(err));
        this.savingPassword.set(false);
      },
    });
  }

  protected async signOutEverywhere(): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: 'Sign out of all devices?',
      message: 'Every browser and phone signed in to your account, including this one, will be signed out. You will need to sign in again.',
      confirmText: 'Sign out everywhere',
      tone: 'danger',
      icon: 'logout',
    });
    if (!confirmed) return;
    this.signingOut.set(true);
    this.auth.logoutEverywhere().subscribe({
      next: () => this.toast.success('Signed out everywhere', 'Sign in again to continue.'),
      error: (err: unknown) => {
        this.toast.error('Could not sign out everywhere', errorMessage(err));
        this.signingOut.set(false);
      },
    });
  }
}
