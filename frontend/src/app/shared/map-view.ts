import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  effect,
  input,
  model,
  output,
  signal,
  viewChild,
} from '@angular/core';
import * as L from 'leaflet';
import { MAP_CENTER } from '../core/meta';

export interface MapMarker {
  id: number;
  lat: number;
  lng: number;
  color: string;
  title: string;
  subtitle?: string;
}

export interface LatLng {
  lat: number;
  lng: number;
}

const round = (value: number) => Math.round(value * 1e6) / 1e6;

/**
 * OpenStreetMap map (Leaflet). Shows colored markers and, when `pickable` is on,
 * lets the user click to choose a location (two-way bound through `picked`).
 */
@Component({
  selector: 'app-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div #host class="map" [style.height]="height()" role="region" [attr.aria-label]="label()"></div>`,
  styles: `
    :host { display: block; }
    .map { width: 100%; border-radius: var(--radius); border: 1px solid var(--border); background: var(--surface-3); z-index: 0; }
  `,
})
export class MapView implements OnDestroy {
  readonly markers = input<MapMarker[]>([]);
  readonly height = input('340px');
  readonly label = input('Map');
  readonly pickable = input(false);
  readonly picked = model<LatLng | null>(null);
  readonly markerClick = output<number>();

  private readonly host = viewChild.required<ElementRef<HTMLDivElement>>('host');
  private readonly ready = signal(false);
  private map?: L.Map;
  private readonly markerLayer = L.layerGroup();
  private pickMarker?: L.CircleMarker;
  private resizeObserver?: ResizeObserver;
  private fitted = false;

  constructor() {
    afterNextRender(() => {
      const map = L.map(this.host().nativeElement, {
        center: [MAP_CENTER.lat, MAP_CENTER.lng],
        zoom: 13,
        scrollWheelZoom: false,
      });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);
      this.markerLayer.addTo(map);

      if (this.pickable()) map.getContainer().style.cursor = 'crosshair';
      map.on('click', (event: L.LeafletMouseEvent) => {
        if (this.pickable()) this.picked.set({ lat: round(event.latlng.lat), lng: round(event.latlng.lng) });
      });

      this.resizeObserver = new ResizeObserver(() => map.invalidateSize());
      this.resizeObserver.observe(this.host().nativeElement);
      this.map = map;
      this.ready.set(true);
    });

    effect(() => {
      const markers = this.markers();
      if (this.ready()) this.drawMarkers(markers);
    });
    effect(() => {
      const point = this.picked();
      if (this.ready()) this.drawPicked(point);
    });
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.map?.remove();
  }

  private drawMarkers(markers: MapMarker[]): void {
    const map = this.map;
    if (!map) return;
    this.markerLayer.clearLayers();
    for (const m of markers) {
      // White ring keeps markers readable on top of the map and of each other.
      const marker = L.circleMarker([m.lat, m.lng], { radius: 9, color: '#ffffff', weight: 2, fillColor: m.color, fillOpacity: 1 });
      marker.bindTooltip(this.tooltip(m), { direction: 'top', offset: [0, -8] });
      marker.on('click', () => this.markerClick.emit(m.id));
      marker.addTo(this.markerLayer);
    }
    if (!this.fitted && markers.length > 0) {
      this.fitted = true;
      if (markers.length === 1) map.setView([markers[0].lat, markers[0].lng], 15);
      else map.fitBounds(L.latLngBounds(markers.map((m) => [m.lat, m.lng] as L.LatLngTuple)), { padding: [36, 36], maxZoom: 15 });
    }
  }

  private drawPicked(point: LatLng | null): void {
    const map = this.map;
    if (!map) return;
    if (!point) {
      this.pickMarker?.remove();
      this.pickMarker = undefined;
      return;
    }
    if (this.pickMarker) this.pickMarker.setLatLng([point.lat, point.lng]);
    else
      this.pickMarker = L.circleMarker([point.lat, point.lng], {
        radius: 11, color: '#ffffff', weight: 3, fillColor: '#dc2626', fillOpacity: 1,
      }).addTo(map);

    if (!this.fitted) {
      this.fitted = true;
      map.setView([point.lat, point.lng], 16);
    } else if (!map.getBounds().contains([point.lat, point.lng])) {
      map.panTo([point.lat, point.lng]);
    }
  }

  /** Builds tooltip content with textContent, because titles can contain text typed by users. */
  private tooltip(marker: MapMarker): HTMLElement {
    const element = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = marker.title;
    element.appendChild(title);
    if (marker.subtitle) {
      const subtitle = document.createElement('span');
      subtitle.textContent = marker.subtitle;
      element.appendChild(subtitle);
    }
    return element;
  }
}
