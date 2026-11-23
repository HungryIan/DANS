// Prepares HTTPS for "npm start": exports the ASP.NET Core development certificate (the same one the API uses)
// as PEM files that the Angular dev server can use, so https://localhost:4200 is trusted by the browser.
// Runs automatically before "ng serve". The files are git-ignored and must never be committed.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const certDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'certs');
const certFile = join(certDir, 'localhost.pem');
const keyFile = join(certDir, 'localhost.key');

if (existsSync(certFile) && existsSync(keyFile)) process.exit(0);

mkdirSync(certDir, { recursive: true });
try {
  // Creates the development certificate if needed and exports it (certificate + unencrypted private key).
  execFileSync('dotnet', ['dev-certs', 'https', '--export-path', certFile, '--format', 'Pem', '--no-password'], { stdio: 'inherit' });
  console.log('HTTPS certificate for the Angular dev server exported to frontend/certs/.');
} catch {
  console.error(
    '\nCould not export the HTTPS development certificate. Make sure the .NET SDK is installed, then run:\n' +
      '  dotnet dev-certs https --trust\n',
  );
  process.exit(1);
}

try {
  execFileSync('dotnet', ['dev-certs', 'https', '--check', '--trust'], { stdio: 'ignore' });
} catch {
  console.warn('\nThe development certificate is not trusted yet, so the browser will show a warning. To trust it once, run:\n  dotnet dev-certs https --trust\n');
}
