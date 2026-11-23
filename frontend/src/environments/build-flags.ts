/**
 * Build-time switches for the website.
 * "npm run build:presentation" (used by present.ps1) replaces this file with build-flags.presentation.ts (see angular.json).
 */
export const buildFlags = {
  /** Show one-click sign-in buttons for the seeded demo accounts. Always on in development builds. */
  demoAccounts: false,
};
