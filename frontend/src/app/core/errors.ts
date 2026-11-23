import { HttpErrorResponse } from '@angular/common/http';

interface ProblemDetails {
  title?: string;
  detail?: string;
  errors?: Record<string, string[]>;
}

/** Turns an HTTP error from the API into a message that can be shown to the user. */
export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (!(error instanceof HttpErrorResponse)) return fallback;
  if (error.status === 0) return 'Cannot reach the DANS server. Check your connection and make sure the API is running.';

  const body: ProblemDetails | null = typeof error.error === 'object' ? (error.error as ProblemDetails | null) : null;
  if (body?.errors) {
    const first = Object.values(body.errors).flat()[0];
    if (first) return first;
  }
  if (body?.detail) return body.detail;

  switch (error.status) {
    case 401:
      return 'Please sign in to continue.';
    case 403:
      return 'You do not have permission to do that.';
    case 404:
      return 'The requested record was not found.';
    case 429:
      return 'Too many requests. Please wait a moment and try again.';
  }
  return body?.title && error.status < 500 ? body.title : fallback;
}
