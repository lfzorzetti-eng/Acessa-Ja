import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, switchMap, timeout } from 'rxjs';

export interface GeocodingResult {
  displayName: string;
  latitude: number;
  longitude: number;
}

interface NominatimPlace {
  display_name?: string;
  lat?: string;
  lon?: string;
}

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    name?: string;
    housenumber?: string;
    street?: string;
    district?: string;
    city?: string;
    county?: string;
    state?: string;
    country?: string;
    postcode?: string;
  };
}

interface PhotonResponse {
  features?: PhotonFeature[];
}

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org';
const PHOTON_URL = 'https://photon.komoot.io';

@Injectable({
  providedIn: 'root'
})
export class GeocodingService {
  private readonly http = inject(HttpClient);

  search(query: string): Observable<GeocodingResult[]> {
    const value = query.trim();

    if (value.length < 3) {
      return of([]);
    }

    return this.searchNominatim(value).pipe(
      switchMap(results => (results.length > 0 ? of(results) : this.searchPhoton(value))),
      catchError(() => this.searchPhoton(value)),
      catchError(() => of([]))
    );
  }

  reverse(latitude: number, longitude: number): Observable<string | null> {
    return this.reverseNominatim(latitude, longitude).pipe(
      switchMap(address => (address ? of(address) : this.reversePhoton(latitude, longitude))),
      catchError(() => this.reversePhoton(latitude, longitude)),
      catchError(() => of(null))
    );
  }

  private searchNominatim(value: string): Observable<GeocodingResult[]> {
    return this.http
      .get<NominatimPlace[]>(`${NOMINATIM_URL}/search`, {
        params: {
          q: value,
          format: 'jsonv2',
          limit: '6',
          dedupe: '1',
          'accept-language': 'pt-BR'
        }
      })
      .pipe(
        timeout({ first: 8000 }),
        map(places =>
          (Array.isArray(places) ? places : [])
            .map(place => ({
              displayName: place.display_name ?? '',
              latitude: Number(place.lat),
              longitude: Number(place.lon)
            }))
            .filter(place => place.displayName && Number.isFinite(place.latitude) && Number.isFinite(place.longitude))
        )
      );
  }

  private searchPhoton(value: string): Observable<GeocodingResult[]> {
    return this.http
      .get<PhotonResponse>(`${PHOTON_URL}/api`, {
        params: {
          q: value,
          limit: '6'
        }
      })
      .pipe(
        timeout({ first: 8000 }),
        map(response =>
          (response?.features ?? [])
            .map(feature => this.fromPhotonFeature(feature))
            .filter((place): place is GeocodingResult => place !== null)
        )
      );
  }

  private reverseNominatim(latitude: number, longitude: number): Observable<string | null> {
    return this.http
      .get<NominatimPlace>(`${NOMINATIM_URL}/reverse`, {
        params: {
          lat: String(latitude),
          lon: String(longitude),
          format: 'jsonv2',
          zoom: '18',
          'accept-language': 'pt-BR'
        }
      })
      .pipe(
        timeout({ first: 8000 }),
        map(place => {
          if (!place?.display_name) {
            return null;
          }

          return place.display_name.split(',').map(part => part.trim()).slice(0, 4).join(', ');
        })
      );
  }

  private reversePhoton(latitude: number, longitude: number): Observable<string | null> {
    return this.http
      .get<PhotonResponse>(`${PHOTON_URL}/reverse`, {
        params: {
          lat: String(latitude),
          lon: String(longitude)
        }
      })
      .pipe(
        timeout({ first: 8000 }),
        map(response => {
          const feature = response?.features?.[0];

          if (!feature) {
            return null;
          }

          const parts = [
            this.photonStreet(feature),
            feature.properties?.district,
            feature.properties?.city,
            feature.properties?.state
          ].filter((part): part is string => Boolean(part && part.trim()));

          return parts.slice(0, 4).join(', ') || null;
        })
      );
  }

  private fromPhotonFeature(feature: PhotonFeature): GeocodingResult | null {
    const coordinates = feature.geometry?.coordinates;

    if (!coordinates || coordinates.length < 2) {
      return null;
    }

    const [longitude, latitude] = coordinates;

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }

    const parts = [
      this.photonStreet(feature),
      feature.properties?.district,
      feature.properties?.city,
      feature.properties?.county,
      feature.properties?.state,
      feature.properties?.country
    ].filter((part): part is string => Boolean(part && part.trim()));

    return {
      displayName: parts.join(', ') || 'Local encontrado',
      latitude,
      longitude
    };
  }

  private photonStreet(feature: PhotonFeature): string | undefined {
    const properties = feature.properties;
    const street = properties?.street ?? properties?.name;

    if (!street) {
      return properties?.name;
    }

    return properties?.housenumber ? `${street}, ${properties.housenumber}` : street;
  }
}
