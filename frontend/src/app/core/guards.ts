import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { UserRole } from './models';
import { ToastService } from './toast.service';

/** Only signed-in users. Others are sent to the sign-in page and brought back afterwards. */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  return auth.isLoggedIn() ? true : inject(Router).createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/** Only visitors who are not signed in (login and registration pages). */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isLoggedIn() ? inject(Router).createUrlTree(['/']) : true;
};

/** Only users with one of the given roles. */
export function roleGuard(roles: readonly UserRole[]): CanActivateFn {
  return (_route, state) => {
    const auth = inject(AuthService);
    const router = inject(Router);
    if (!auth.isLoggedIn()) return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
    if (auth.hasRole(roles)) return true;
    inject(ToastService).error('Access denied', 'Your account does not have access to that page.');
    return router.createUrlTree(['/']);
  };
}
