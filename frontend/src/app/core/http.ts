import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { ToastService } from './toast.service';

/**
 * - Adds the "X-Requested-With" header that the API requires on every request that changes data
 *   (cross-site request forgery protection — other websites cannot add this header).
 * - Signs the user out locally when the server says the session has ended.
 * The sign-in cookie itself is sent by the browser automatically; JavaScript never touches it.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const toast = inject(ToastService);

  const isApi = request.url.startsWith('/api/');
  if (isApi) {
    request = request.clone({ setHeaders: { 'X-Requested-With': 'XMLHttpRequest' } });
  }

  return next(request).pipe(
    catchError((error: unknown) => {
      if (isApi && error instanceof HttpErrorResponse && error.status === 401 && auth.isLoggedIn()) {
        auth.clear();
        toast.show('warning', 'Session ended', 'Please sign in again.');
        void router.navigate(['/login'], { queryParams: { returnUrl: router.url } });
      }
      return throwError(() => error);
    }),
  );
};
