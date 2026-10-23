import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, timeout } from 'rxjs';

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

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org';

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

    return this.http
      .get<NominatimPlace[]>(`${NOMINATIM_URL}/search`, {
        params: {
          q: value,
          format: 'jsonv2',
          limit: '6',
          dedupe: '1',
          'accept-language': 'pt-BR,en'
        }
      })
      .pipe(
        timeout({ first: 10000 }),
        map(places =>
          (Array.isArray(places) ? places : [])
            .map(place => ({
              displayName: place.display_name ?? '',
              latitude: Number(place.lat),
              longitude: Number(place.lon)
            }))
            .filter(place => Number.isFinite(place.latitude) && Number.isFinite(place.longitude))
        ),
        catchError(() => of([]))
      );
  }

  reverse(latitude: number, longitude: number): Observable<string | null> {
    return this.http
      .get<NominatimPlace>(`${NOMINATIM_URL}/reverse`, {
        params: {
          lat: String(latitude),
          lon: String(longitude),
          format: 'jsonv2',
          zoom: '18',
          'accept-language': 'pt-BR,en'
        }
      })
      .pipe(
        timeout({ first: 10000 }),
        map(place => place?.display_name ?? null),
        catchError(() => of(null))
      );
  }
}
