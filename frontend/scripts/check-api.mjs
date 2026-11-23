// Runs before "ng serve" (npm start). If the DANS API is not running, the website can only show
// "Cannot check for alerts right now", so this prints how to start it. It never stops "npm start":
// start the API whenever you like and the website connects to it automatically.
import { connect } from 'node:net';

const port = 7180;
const socket = connect({ host: 'localhost', port });

function finish(apiIsRunning) {
  socket.destroy();
  if (!apiIsRunning) {
    const yellow = (text) => `\x1b[33m${text}\x1b[0m`;
    console.warn(
      yellow(
        [
          '',
          `  The DANS API is not running yet (nothing answers on https://localhost:${port}).`,
          '  Until it runs, the website shows "Cannot check for alerts right now".',
          '  Start it in a second PowerShell window:',
          '',
          '      cd backend\\Dans.Api',
          '      dotnet run',
          '',
          '  The website connects automatically once the API is up.',
          '',
        ].join('\n'),
      ),
    );
  }
  process.exit(0);
}

socket.setTimeout(1500, () => finish(false));
socket.on('connect', () => finish(true));
socket.on('error', () => finish(false));
