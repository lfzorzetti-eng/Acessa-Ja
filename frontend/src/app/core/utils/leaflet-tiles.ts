import type { Map as LeafletMap, TileLayer, TileLayerOptions } from 'leaflet';

type LeafletModule = typeof import('leaflet');

interface TileProvider {
  url: string;
  options: TileLayerOptions;
}

const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

/**
 * Basemap providers tried in order. If the first one keeps failing (blocked
 * network, CDN outage, rate limit), the next one is used automatically so the
 * map never stays blank.
 */
const PROVIDERS: TileProvider[] = [
  {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    options: {
      subdomains: 'abcd',
      maxZoom: 20,
      attribution: `${ATTRIBUTION} contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>`
    }
  },
  {
    url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
    options: {
      subdomains: 'abc',
      maxZoom: 19,
      attribution: `${ATTRIBUTION} contributors, tiles by <a href="https://www.hotosm.org/" target="_blank" rel="noopener">HOT</a>`
    }
  },
  {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    options: {
      maxZoom: 19,
      attribution: `${ATTRIBUTION} contributors`
    }
  }
];

const FAILURES_BEFORE_SWITCH = 3;
const SWITCH_TIMEOUT_MS = 4000;

export function addTileLayerWithFallback(leaflet: LeafletModule, map: LeafletMap): TileLayer {
  let providerIndex = 0;
  let failures = 0;
  let anyTileLoaded = false;
  let timeoutId: number | null = null;
  let layer: TileLayer | null = null;

  const clearSwitchTimeout = (): void => {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  const switchProvider = (): void => {
    if (providerIndex >= PROVIDERS.length - 1 || !layer) {
      return;
    }

    clearSwitchTimeout();
    map.removeLayer(layer);
    providerIndex += 1;
    failures = 0;
    anyTileLoaded = false;
    attach();
  };

  const attach = (): void => {
    const provider = PROVIDERS[providerIndex];

    const currentLayer = leaflet.tileLayer(provider.url, provider.options).addTo(map);
    layer = currentLayer;

    timeoutId = window.setTimeout(() => {
      if (!anyTileLoaded) {
        switchProvider();
      }
    }, SWITCH_TIMEOUT_MS);

    currentLayer.on('tileload', () => {
      anyTileLoaded = true;
      clearSwitchTimeout();
    });

    currentLayer.on('tileerror', () => {
      failures += 1;

      if (!anyTileLoaded && failures >= FAILURES_BEFORE_SWITCH) {
        switchProvider();
      }
    });
  };

  attach();
  return layer!;
}
