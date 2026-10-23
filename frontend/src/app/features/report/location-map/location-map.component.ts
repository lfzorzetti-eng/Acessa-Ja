import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
  inject
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

export interface MapLocation {
  latitude: number;
  longitude: number;
}

type LeafletModule = typeof import('leaflet');
type LeafletMap = import('leaflet').Map;
type LeafletMarker = import('leaflet').Marker;

@Component({
  selector: 'uar-location-map',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatSnackBarModule
  ],
  templateUrl: './location-map.component.html',
  styleUrl: './location-map.component.scss'
})
export class LocationMapComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() latitude: number | null = null;
  @Input() longitude: number | null = null;
  @Output() locationChange = new EventEmitter<MapLocation>();

  @ViewChild('mapHost', { static: true })
  private mapHost!: ElementRef<HTMLDivElement>;

  private readonly snackBar = inject(MatSnackBar);
  private readonly changeDetector = inject(ChangeDetectorRef);

  private leaflet: LeafletModule | null = null;
  private map: LeafletMap | null = null;
  private marker: LeafletMarker | null = null;
  private userMarker: import('leaflet').CircleMarker | null = null;
  private accuracyCircle: import('leaflet').Circle | null = null;
  private userLayer: import('leaflet').LayerGroup | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private destroyed = false;
  private hasCentered = false;
  private lastUserLocation: { latitude: number; longitude: number; accuracy: number } | null = null;

  private readonly defaultCenter: [number, number] = [-14.235, -51.9253];
  private readonly defaultZoom = 4;

  mapError = false;
  isLocating = false;

  ngAfterViewInit(): void {
    void this.initializeMap();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (
      this.map &&
      this.leaflet &&
      (changes['latitude'] || changes['longitude'])
    ) {
      this.syncMarker(true);
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.resizeObserver?.disconnect();
    this.map?.remove();
    this.map = null;
    this.marker = null;
  }

  locateUser(): void {
    if (!this.map || this.isLocating || !navigator.geolocation) {
      if (!navigator.geolocation) {
        this.snackBar.open('Location services are not available in this browser.', 'Close', {
          duration: 5000,
          panelClass: ['error-snackbar']
        });
      }
      return;
    }

    this.isLocating = true;
    this.changeDetector.markForCheck();

    if (this.lastUserLocation) {
      this.applyUserLocation(this.lastUserLocation);
    }

    navigator.geolocation.getCurrentPosition(
      position => {
        this.isLocating = false;
        const location = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        };
        this.applyUserLocation(location);
        this.setLocation(location.latitude, location.longitude, true);
      },
      error => {
        this.isLocating = false;
        this.changeDetector.markForCheck();
        this.snackBar.open(this.getLocationError(error.code), 'Close', {
          duration: 6000,
          panelClass: ['error-snackbar']
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 10000
      }
    );
  }

  private async initializeMap(): Promise<void> {
    try {
      const leaflet = await import('leaflet');

      if (this.destroyed) {
        return;
      }

      this.leaflet = leaflet;
      this.map = leaflet.map(this.mapHost.nativeElement, {
        zoomControl: false,
        attributionControl: true,
        minZoom: 2,
        worldCopyJump: true,
        zoomSnap: 0.5
      }).setView(this.defaultCenter, this.defaultZoom);

      leaflet.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd',
        maxZoom: 20,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>'
      }).addTo(this.map);

      leaflet.control.zoom({ position: 'bottomright' }).addTo(this.map);
      leaflet.control.scale({ imperial: false, position: 'bottomleft' }).addTo(this.map);

      this.userLayer = leaflet.layerGroup().addTo(this.map);

      this.map.on('click', (event: import('leaflet').LeafletMouseEvent) => {
        this.setLocation(event.latlng.lat, event.latlng.lng, true);
      });

      this.resizeObserver = new ResizeObserver(() => this.map?.invalidateSize());
      this.resizeObserver.observe(this.mapHost.nativeElement);

      this.syncMarker(false);
      window.setTimeout(() => this.map?.invalidateSize(), 0);
      this.changeDetector.markForCheck();
    } catch {
      this.mapError = true;
      this.snackBar.open('The map could not be loaded. Use your current location instead.', 'Close', {
        duration: 6000,
        panelClass: ['error-snackbar']
      });
      this.changeDetector.markForCheck();
    }
  }

  private syncMarker(center: boolean): void {
    const leaflet = this.leaflet;
    const map = this.map;

    if (!leaflet || !map) {
      return;
    }

    if (this.latitude === null || this.longitude === null) {
      this.marker?.remove();
      this.marker = null;
      return;
    }

    const location: [number, number] = [this.latitude, this.longitude];

    if (!this.marker) {
      this.marker = leaflet.marker(location, {
        draggable: true,
        icon: this.createMarkerIcon(),
        title: 'Selected report location',
        alt: 'Selected report location'
      }).addTo(map);

      this.marker.on('dragend', () => {
        const position = this.marker?.getLatLng();

        if (position) {
          this.setLocation(position.lat, position.lng, false);
        }
      });
    } else {
      this.marker.setLatLng(location);
    }

    if (center || !this.hasCentered) {
      map.flyTo(location, Math.max(map.getZoom(), 16), {
        animate: true,
        duration: 0.8
      });
      this.hasCentered = true;
    }
  }

  private applyUserLocation(location: { latitude: number; longitude: number; accuracy: number }): void {
    const leaflet = this.leaflet;
    const map = this.map;
    const layer = this.userLayer;

    if (!leaflet || !map || !layer) {
      return;
    }

    this.lastUserLocation = location;
    const point: [number, number] = [location.latitude, location.longitude];
    const accuracy = Math.min(Math.max(location.accuracy || 30, 15), 250);

    if (!this.userMarker) {
      this.userMarker = leaflet.circleMarker(point, {
        radius: 7,
        color: '#ffffff',
        weight: 3,
        fillColor: '#2563eb',
        fillOpacity: 1
      }).addTo(layer);
    } else {
      this.userMarker.setLatLng(point);
    }

    if (!this.accuracyCircle) {
      this.accuracyCircle = leaflet.circle(point, {
        radius: accuracy,
        color: '#2563eb',
        weight: 1,
        fillColor: '#3b82f6',
        fillOpacity: 0.08
      }).addTo(layer);
    } else {
      this.accuracyCircle.setLatLng(point);
      this.accuracyCircle.setRadius(accuracy);
    }

    this.changeDetector.markForCheck();
  }

  private setLocation(latitude: number, longitude: number, center: boolean): void {
    this.latitude = latitude;
    this.longitude = longitude;
    this.syncMarker(center);
    this.locationChange.emit({ latitude, longitude });
    this.changeDetector.markForCheck();
  }

  private createMarkerIcon(): import('leaflet').DivIcon {
    const leaflet = this.leaflet as LeafletModule;

    return leaflet.divIcon({
      className: 'location-marker',
      html: '<span class="location-marker__pin"><span></span></span>',
      iconSize: [34, 44],
      iconAnchor: [17, 42],
      popupAnchor: [0, -36]
    });
  }

  private getLocationError(code: number): string {
    if (code === 1) {
      return 'Allow location access in your browser settings, then try again.';
    }

    if (code === 3) {
      return 'Location took too long to load. Try again in a moment.';
    }

    return 'Your location could not be found. Check your device settings and try again.';
  }
}
