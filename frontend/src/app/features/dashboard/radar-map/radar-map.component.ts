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
import { Issue } from '../../../core/models/issue.model';
import { IssueService } from '../../../core/services/issue.service';
import { GeocodingResult, GeocodingService } from '../../../core/services/geocoding.service';
import { NEEDS, needStyle, categoryStyle } from '../../../core/utils/issue-presentation';

type LeafletModule = typeof import('leaflet');
type LeafletMap = import('leaflet').Map;
type LeafletMarker = import('leaflet').Marker;
type LeafletLayerGroup = import('leaflet').LayerGroup;
type LeafletLatLngExpression = import('leaflet').LatLngExpression;
type LeafletLatLng = import('leaflet').LatLng;

export interface PickedLocation {
  latitude: number;
  longitude: number;
}

@Component({
  selector: 'uar-radar-map',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatSnackBarModule
  ],
  templateUrl: './radar-map.component.html',
  styleUrl: './radar-map.component.scss'
})
export class RadarMapComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() issues: Issue[] = [];
  @Output() pickLocation = new EventEmitter<PickedLocation>();

  @ViewChild('mapHost', { static: true })
  private mapHost!: ElementRef<HTMLDivElement>;

  private readonly issueService = inject(IssueService);
  private readonly geocoding = inject(GeocodingService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly changeDetector = inject(ChangeDetectorRef);

  private leaflet: LeafletModule | null = null;
  private map: LeafletMap | null = null;
  private markerLayer: LeafletLayerGroup | null = null;
  private userLayer: LeafletLayerGroup | null = null;
  private searchLayer: LeafletLayerGroup | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private readonly markers = new Map<string, LeafletMarker>();
  private hasFittedReports = false;
  private destroyed = false;
  private userMarker: import('leaflet').CircleMarker | null = null;
  private accuracyCircle: import('leaflet').Circle | null = null;
  private watchId: number | null = null;
  private lastUserLocation: { latitude: number; longitude: number; accuracy: number } | null = null;
  private pendingRecenter = false;
  private autoLocated = false;
  private searchTimer: number | null = null;

  private readonly defaultCenter: LeafletLatLngExpression = [-14.235, -51.9253];
  private readonly defaultZoom = 4;

  readonly needLegend = NEEDS.map(need => ({ need, ...needStyle(need) }));

  isFullscreen = false;
  isLocating = false;
  isSearching = false;
  searchQuery = '';
  searchResults: GeocodingResult[] = [];
  searchStatus: string | null = null;

  ngAfterViewInit(): void {
    void this.initializeMap();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['issues'] && this.map && this.leaflet) {
      this.syncMarkers();
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.stopLocationWatch();
    this.clearSearchTimer();
    this.resizeObserver?.disconnect();
    window.removeEventListener('keydown', this.handleKeydown);
    document.body.classList.remove('map-fullscreen-open');
    this.map?.remove();
    this.map = null;
    this.markers.clear();
  }

  focusIssue(issue: Issue): void {
    if (!this.map) {
      return;
    }

    const marker = this.markers.get(issue.id);

    if (!marker) {
      return;
    }

    this.map.flyTo(marker.getLatLng(), Math.max(this.map.getZoom(), 16), {
      animate: true,
      duration: 0.75
    });

    window.setTimeout(() => {
      if (this.map && this.markers.has(issue.id)) {
        marker.openPopup();
      }
    }, 700);

    if (!this.isFullscreen) {
      this.mapHost.nativeElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
  }

  fitReports(): void {
    if (!this.map || !this.leaflet) {
      return;
    }

    const points: [number, number][] = this.issues.map(issue => [issue.latitude, issue.longitude]);

    if (this.lastUserLocation) {
      points.push([this.lastUserLocation.latitude, this.lastUserLocation.longitude]);
    }

    if (points.length === 0) {
      this.map.flyTo(this.defaultCenter, this.defaultZoom, {
        animate: true,
        duration: 0.7
      });
      return;
    }

    const bounds = this.leaflet.latLngBounds(points);

    if (bounds.isValid()) {
      this.map.fitBounds(bounds.pad(0.18), {
        maxZoom: 15,
        animate: true,
        duration: 0.8
      });
    }
  }

  locateUser(): void {
    if (!this.map || this.isLocating || !navigator.geolocation) {
      if (!navigator.geolocation) {
        this.showMessage('Location services are not available in this browser.');
      }
      return;
    }

    this.isLocating = true;
    this.pendingRecenter = true;
    this.changeDetector.markForCheck();

    if (this.lastUserLocation) {
      this.applyUserLocation(this.lastUserLocation, true);
    }

    this.startLocationWatch();

    navigator.geolocation.getCurrentPosition(
      position => {
        this.isLocating = false;
        this.pendingRecenter = false;
        this.applyUserLocation(
          {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy
          },
          true
        );
      },
      error => {
        this.isLocating = false;
        this.pendingRecenter = false;
        this.showMessage(this.getLocationError(error.code));
        this.changeDetector.markForCheck();
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 10000
      }
    );
  }

  toggleFullscreen(): void {
    this.isFullscreen = !this.isFullscreen;
    document.body.classList.toggle('map-fullscreen-open', this.isFullscreen);
    this.changeDetector.markForCheck();

    window.setTimeout(() => this.map?.invalidateSize(), 80);
  }

  onSearchInput(value: string): void {
    this.searchQuery = value;
    this.searchStatus = null;
    this.clearSearchTimer();

    if (value.trim().length < 3) {
      this.searchResults = [];
      this.isSearching = false;
      this.changeDetector.markForCheck();
      return;
    }

    this.isSearching = true;
    this.changeDetector.markForCheck();
    this.searchTimer = window.setTimeout(() => {
      this.geocoding.search(value).subscribe(results => {
        if (this.destroyed) {
          return;
        }

        this.searchResults = results;
        this.isSearching = false;
        this.searchStatus = results.length === 0 ? 'No place found. Try a street or city name.' : null;
        this.changeDetector.markForCheck();
      });
    }, 350);
  }

  submitSearch(): void {
    if (this.searchResults.length > 0) {
      this.selectSearchResult(this.searchResults[0]);
      return;
    }

    if (this.searchQuery.trim().length < 3) {
      return;
    }

    this.clearSearchTimer();
    this.isSearching = true;

    this.geocoding.search(this.searchQuery).subscribe(results => {
      if (this.destroyed) {
        return;
      }

      this.isSearching = false;
      this.searchResults = results;
      this.searchStatus = results.length === 0 ? 'No place found. Try a street or city name.' : null;
      this.changeDetector.markForCheck();

      if (results.length > 0) {
        this.selectSearchResult(results[0]);
      }
    });
  }

  selectSearchResult(result: GeocodingResult): void {
    if (!this.map || !this.leaflet) {
      return;
    }

    const location: [number, number] = [result.latitude, result.longitude];
    this.searchResults = [];
    this.searchQuery = result.displayName.split(',')[0] ?? result.displayName;
    this.searchStatus = null;
    this.searchLayer?.clearLayers();

    if (this.searchLayer) {
      const marker = this.leaflet.marker(location, {
        icon: this.leaflet.divIcon({
          className: 'search-marker',
          html: '<span class="search-marker__pin"><span class="material-icons">search</span></span>',
          iconSize: [34, 34],
          iconAnchor: [17, 34]
        }),
        title: result.displayName
      }).addTo(this.searchLayer);

      marker.bindPopup(`<strong>${this.escapeHtml(result.displayName)}</strong>`, {
        closeButton: false,
        className: 'search-popup'
      }).openPopup();
    }

    this.map.flyTo(location, 17, {
      animate: true,
      duration: 0.9
    });

    this.changeDetector.markForCheck();
  }

  clearSearch(): void {
    this.clearSearchTimer();
    this.searchQuery = '';
    this.searchResults = [];
    this.searchStatus = null;
    this.isSearching = false;
    this.searchLayer?.clearLayers();
    this.changeDetector.markForCheck();
  }

  private readonly handleKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && this.isFullscreen) {
      this.toggleFullscreen();
    }
  };

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

      this.markerLayer = leaflet.layerGroup().addTo(this.map);
      this.userLayer = leaflet.layerGroup().addTo(this.map);
      this.searchLayer = leaflet.layerGroup().addTo(this.map);

      this.map.on('click', (event: import('leaflet').LeafletMouseEvent) => {
        this.openReportHerePopup(event.latlng);
      });

      this.syncMarkers();

      this.resizeObserver = new ResizeObserver(() => this.map?.invalidateSize());
      this.resizeObserver.observe(this.mapHost.nativeElement);
      window.addEventListener('keydown', this.handleKeydown);

      // Show the user's exact position as soon as the map opens (browser permission permitting).
      this.startLocationWatch();

      window.setTimeout(() => this.map?.invalidateSize(), 0);
      this.changeDetector.markForCheck();
    } catch {
      this.showMessage('The map could not be loaded. Check your connection and try again.');
    }
  }

  private startLocationWatch(): void {
    if (this.watchId !== null || !navigator.geolocation) {
      return;
    }

    this.watchId = navigator.geolocation.watchPosition(
      position => {
        this.applyUserLocation(
          {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy
          },
          !this.autoLocated || this.pendingRecenter
        );
        this.autoLocated = true;
        this.pendingRecenter = false;
        this.isLocating = false;
        this.changeDetector.markForCheck();
      },
      () => {
        this.isLocating = false;
        this.changeDetector.markForCheck();
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 5000
      }
    );
  }

  private stopLocationWatch(): void {
    if (this.watchId !== null) {
      navigator.geolocation?.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  private applyUserLocation(
    location: { latitude: number; longitude: number; accuracy: number },
    recenter: boolean
  ): void {
    const leaflet = this.leaflet;
    const map = this.map;
    const layer = this.userLayer;

    if (!leaflet || !map || !layer) {
      return;
    }

    this.lastUserLocation = location;

    const point: [number, number] = [location.latitude, location.longitude];
    const accuracy = Math.min(Math.max(location.accuracy || 30, 15), 400);

    if (!this.userMarker) {
      this.userMarker = leaflet.circleMarker(point, {
        radius: 8,
        color: '#ffffff',
        weight: 3,
        fillColor: '#2563eb',
        fillOpacity: 1,
        className: 'user-location-dot'
      }).addTo(layer);

      this.userMarker.bindPopup('You are here');
    } else {
      this.userMarker.setLatLng(point);
    }

    if (!this.accuracyCircle) {
      this.accuracyCircle = leaflet.circle(point, {
        radius: accuracy,
        color: '#2563eb',
        weight: 1,
        fillColor: '#3b82f6',
        fillOpacity: 0.1
      }).addTo(layer);
    } else {
      this.accuracyCircle.setLatLng(point);
      this.accuracyCircle.setRadius(accuracy);
    }

    if (recenter) {
      if (this.issues.length > 0 && !this.hasFittedReports) {
        this.hasFittedReports = true;
        this.fitReports();
      } else {
        map.flyTo(point, 16, {
          animate: true,
          duration: 0.9
        });
      }
    }

    this.changeDetector.markForCheck();
  }

  private openReportHerePopup(latlng: LeafletLatLng): void {
    const leaflet = this.leaflet;
    const map = this.map;

    if (!leaflet || !map) {
      return;
    }

    const container = document.createElement('div');
    container.className = 'report-here-popup';

    const title = document.createElement('strong');
    title.textContent = 'Report a barrier here';
    container.appendChild(title);

    const coordinates = document.createElement('span');
    coordinates.textContent = `${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`;
    container.appendChild(coordinates);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'report-here-button';
    button.textContent = 'Use this location';
    button.addEventListener('click', () => {
      this.pickLocation.emit({ latitude: latlng.lat, longitude: latlng.lng });
      map.closePopup();
    });
    container.appendChild(button);

    leaflet.popup({
      closeButton: true,
      className: 'report-here-popup-wrapper',
      offset: [0, -8]
    })
      .setLatLng(latlng)
      .setContent(container)
      .openOn(map);
  }

  private syncMarkers(): void {
    const leaflet = this.leaflet;
    const map = this.map;
    const layer = this.markerLayer;

    if (!leaflet || !map || !layer) {
      return;
    }

    layer.clearLayers();
    this.markers.clear();

    for (const issue of this.issues) {
      const marker = leaflet.marker(
        [issue.latitude, issue.longitude],
        {
          icon: this.createMarkerIcon(issue),
          title: issue.classification,
          alt: `${issue.classification}, ${this.needLabel(issue)}, ${issue.severity} severity`,
          riseOnHover: true
        }
      );

      marker.bindPopup(this.createPopup(issue), {
        maxWidth: 300,
        minWidth: 250,
        className: 'radar-popup',
        closeButton: true,
        autoPanPadding: [36, 36]
      });

      marker.addTo(layer);
      this.markers.set(issue.id, marker);
    }

    if (!this.hasFittedReports && this.issues.length > 0 && !this.lastUserLocation) {
      this.hasFittedReports = true;
      this.fitReports();
    }
  }

  private createMarkerIcon(issue: Issue): import('leaflet').DivIcon {
    const leaflet = this.leaflet as LeafletModule;
    const need = needStyle(issue.need);
    const severityColor = issue.severity === 'high' ? '#d14b2b' : issue.severity === 'medium' ? '#d18b2d' : '#42695c';

    return leaflet.divIcon({
      className: 'radar-marker',
      html: `
        <span class="radar-marker__pin" style="--marker-color: ${need.color}; --severity-color: ${severityColor}">
          <span class="radar-marker__icon"><span class="material-icons">${need.icon}</span></span>
          <i class="radar-marker__severity"></i>
        </span>
      `,
      iconSize: [38, 46],
      iconAnchor: [19, 44],
      popupAnchor: [0, -40]
    });
  }

  private createPopup(issue: Issue): string {
    const imageUrl = this.escapeHtml(this.issueService.imageUrl(issue));
    const title = this.escapeHtml(issue.classification);
    const need = needStyle(issue.need);
    const category = categoryStyle(issue.category);
    const description = this.escapeHtml(issue.description);
    const severity = this.escapeHtml(issue.severity);
    const date = this.escapeHtml(this.formatDate(issue.createdAt));
    const coordinates = `${issue.latitude.toFixed(5)}, ${issue.longitude.toFixed(5)}`;

    return `
      <article class="radar-popup-card">
        <div class="radar-popup-card__image">
          <img src="${imageUrl}" alt="${title}" loading="lazy">
        </div>
        <div class="radar-popup-card__body">
          <span class="radar-popup-card__severity radar-popup-card__severity--${severity}">
            <i></i>${severity}
          </span>
          <h3>${title}</h3>
          <div class="radar-popup-card__tags">
            <span class="radar-popup-card__need" style="--need-color: ${need.color}; --need-pale: ${need.pale}">
              <span class="material-icons">${need.icon}</span>${this.escapeHtml(need.label)}
            </span>
            <span class="radar-popup-card__category">${this.escapeHtml(category.label)}</span>
          </div>
          <p>${description}</p>
          <div class="radar-popup-card__meta">
            <span>${date}</span>
            <span>${coordinates}</span>
          </div>
        </div>
      </article>
    `;
  }

  private needLabel(issue: Issue): string {
    return needStyle(issue.need).label;
  }

  private formatDate(value: string): string {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return 'Date unavailable';
    }

    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }).format(date);
  }

  private escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, character => {
      switch (character) {
        case '&':
          return '&amp;';
        case '<':
          return '&lt;';
        case '>':
          return '&gt;';
        case '"':
          return '&quot;';
        default:
          return '&#39;';
      }
    });
  }

  private clearSearchTimer(): void {
    if (this.searchTimer !== null) {
      window.clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
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

  private showMessage(message: string): void {
    this.snackBar.open(message, 'Close', {
      duration: 6000,
      panelClass: ['error-snackbar']
    });
  }
}
