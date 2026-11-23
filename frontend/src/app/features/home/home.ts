import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { ActiveAlertsStore } from '../../core/alerts-store';
import { CentersApi } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { RealtimeService } from '../../core/realtime.service';
import { AlertCard } from '../../shared/alert-card';

@Component({
  selector: 'app-home-page',
  imports: [RouterLink, AlertCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home.html',
})
export class HomePage {
  protected readonly auth = inject(AuthService);
  protected readonly alerts = inject(ActiveAlertsStore);
  private readonly centersApi = inject(CentersApi);

  protected readonly openCenters = signal<number | null>(null);
  protected readonly firstName = computed(() => this.auth.user()?.fullName.split(' ')[0] ?? '');

  constructor() {
    this.loadCenters();
    inject(RealtimeService).centersChanged$.pipe(takeUntilDestroyed()).subscribe(() => this.loadCenters());
  }

  private loadCenters(): void {
    this.centersApi.list().subscribe({
      next: (centers) => this.openCenters.set(centers.filter((c) => c.status === 'Open').length),
      error: () => this.openCenters.set(null),
    });
  }
}
