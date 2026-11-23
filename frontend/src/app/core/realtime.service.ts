import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { HubConnection, HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr';
import { Subject } from 'rxjs';
import { AuthService } from './auth.service';
import { Alert, AppNotification, Report } from './models';

/**
 * Live connection to the server (ASP.NET Core SignalR). The server pushes new alerts, notifications and
 * report changes the moment they happen, so nobody has to refresh the page during an emergency.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private readonly auth = inject(AuthService);
  private connection: HubConnection | null = null;
  private generation = 0;

  readonly connected = signal(false);

  /** A new alert for the user's area (shows the emergency popup). */
  readonly alertIssued$ = new Subject<Alert>();
  /** The list of active alerts changed somewhere. */
  readonly alertsChanged$ = new Subject<void>();
  /** A new item in the signed-in user's inbox. */
  readonly notification$ = new Subject<AppNotification>();
  /** An incident report was created or updated (staff only). */
  readonly reportChanged$ = new Subject<Report>();
  /** Evacuation center information changed. */
  readonly centersChanged$ = new Subject<void>();
  /** The connection came back after a drop; pages should reload data they may have missed. */
  readonly reconnected$ = new Subject<void>();

  /**
   * Reconnect when the user signs in/out, changes role or moves to another barangay, so the server puts the
   * connection in the right groups. The browser sends the HttpOnly sign-in cookie with the connection itself.
   */
  private readonly connectionKey = computed(() => {
    const user = this.auth.user();
    return user ? `${user.id}|${user.role}|${user.barangayId ?? ''}` : '';
  });

  constructor() {
    effect(() => {
      this.connectionKey();
      untracked(() => void this.connect());
    });
  }

  private async connect(): Promise<void> {
    const generation = ++this.generation;
    const previous = this.connection;
    this.connection = null;
    this.connected.set(false);
    if (previous) await previous.stop().catch(() => undefined);
    if (generation !== this.generation) return;

    const connection = new HubConnectionBuilder()
      .withUrl('/hubs/notifications')
      // Keep retrying forever (1s, 2s, 4s ... up to 30s) — losing the connection during a disaster is not an option.
      .withAutomaticReconnect({ nextRetryDelayInMilliseconds: (ctx) => Math.min(30_000, 1000 * 2 ** Math.min(ctx.previousRetryCount, 5)) })
      .configureLogging(LogLevel.Warning)
      .build();

    connection.on('alertIssued', (alert: Alert) => this.alertIssued$.next(alert));
    connection.on('alertsChanged', () => this.alertsChanged$.next());
    connection.on('notification', (notification: AppNotification) => this.notification$.next(notification));
    connection.on('reportChanged', (report: Report) => this.reportChanged$.next(report));
    connection.on('centersChanged', () => this.centersChanged$.next());
    connection.onreconnecting(() => this.connected.set(false));
    connection.onreconnected(() => {
      this.connected.set(true);
      this.reconnected$.next();
    });
    connection.onclose(() => {
      if (this.connection !== connection) return; // closed on purpose by a newer connect()
      this.connected.set(false);
      void this.start(connection, generation, true);
    });

    this.connection = connection;
    await this.start(connection, generation, false);
  }

  /** Starts the connection, retrying every 5 seconds while the server is unreachable. */
  private async start(connection: HubConnection, generation: number, isRestart: boolean): Promise<void> {
    while (generation === this.generation && connection.state === HubConnectionState.Disconnected) {
      try {
        await connection.start();
        this.connected.set(true);
        if (isRestart) this.reconnected$.next();
        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        isRestart = true;
      }
    }
  }
}
