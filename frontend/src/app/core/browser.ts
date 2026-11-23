/** Browser helpers: alarm sound, desktop notifications and CSV downloads. */

/** Plays a short siren-like beep pattern with the Web Audio API (no audio file needed). */
export function playAlarm(urgent: boolean): void {
  try {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'square';
    oscillator.connect(gain);
    gain.connect(context.destination);

    const beeps = urgent ? 6 : 3;
    const start = context.currentTime + 0.05;
    gain.gain.setValueAtTime(0.0001, start);
    for (let i = 0; i < beeps; i++) {
      const t = start + i * 0.32;
      oscillator.frequency.setValueAtTime(i % 2 === 0 ? 880 : 660, t);
      gain.gain.setValueAtTime(0.12, t);
      gain.gain.setValueAtTime(0.0001, t + 0.22);
    }
    oscillator.start(start);
    oscillator.stop(start + beeps * 0.32);
    oscillator.onended = () => void context.close();
  } catch {
    // Audio may be blocked until the user interacts with the page; the visual alert still shows.
  }
}

export function canUseDesktopNotifications(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function desktopNotificationPermission(): NotificationPermission | 'unsupported' {
  return canUseDesktopNotifications() ? Notification.permission : 'unsupported';
}

export async function requestDesktopNotifications(): Promise<NotificationPermission | 'unsupported'> {
  if (!canUseDesktopNotifications()) return 'unsupported';
  return Notification.requestPermission();
}

/** Shows an operating-system notification when the DANS tab is in the background. */
export function showDesktopNotification(title: string, body: string, onClick?: () => void): void {
  if (!canUseDesktopNotifications() || Notification.permission !== 'granted' || !document.hidden) return;
  try {
    const notification = new Notification(title, { body, icon: '/favicon.svg', tag: 'dans-alert', requireInteraction: true });
    notification.onclick = () => {
      window.focus();
      onClick?.();
      notification.close();
    };
  } catch {
    // Some browsers only allow notifications from a service worker.
  }
}

type Cell = string | number | null | undefined;

/** Downloads rows as a CSV file that opens correctly in Excel. */
export function downloadCsv(fileName: string, headers: string[], rows: Cell[][]): void {
  const escape = (value: Cell): string => {
    let text = value === null || value === undefined ? '' : String(value);
    // Prevent spreadsheet formula injection from user-entered text.
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const csv = [headers, ...rows].map((row) => row.map(escape).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
