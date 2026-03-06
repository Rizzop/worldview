/**
 * News Events Layer - GDELT News API
 * Fetches geocoded news events from GDELT Project API and renders on globe.
 * Focuses on conflict and military news events.
 */

import { fetchWithRetry } from '../utils/api.js';

// Use Cesium from global scope (loaded via CDN in index.html)
const Cesium = (typeof window !== 'undefined' && window.Cesium) ||
               (typeof globalThis !== 'undefined' && globalThis.Cesium) ||
               null;

/**
 * GDELT GeoJSON API endpoint for geocoded news events
 * Free API - no authentication required
 */
const GDELT_API_URL = 'https://api.gdeltproject.org/api/v2/geo/geo';

/**
 * Maximum number of news markers for performance
 */
const MAX_NEWS_MARKERS = 100;

/**
 * Refresh interval for news events (5 minutes)
 */
const NEWS_REFRESH_INTERVAL = 5 * 60 * 1000;

/**
 * Cinematic news visualization settings
 * Small pulsing orange/amber markers for conflict news
 */
const CINEMATIC_SETTINGS = {
  markerPixelSize: 6,
  markerColor: 'ORANGE',
  markerOpacity: 0.8,
  pulseAmplitude: 0.2,
  pulsePeriod: 1.5,
};

/**
 * NewsLayer class
 * Manages news event data fetching and rendering from GDELT API.
 */
export class NewsLayer {
  /**
   * Create a new NewsLayer
   * @param {Object} options - Configuration options
   * @param {string} [options.query] - Search query (default: 'conflict military')
   * @param {string} [options.timespan] - Time span for news (default: '1h')
   * @param {number} [options.timeout] - Fetch timeout in ms (default: 30000)
   * @param {number} [options.retries] - Number of fetch retries (default: 3)
   */
  constructor(options = {}) {
    this.query = options.query || 'conflict military';
    this.timespan = options.timespan || '1h';
    this.timeout = options.timeout || 30000;
    this.retries = options.retries || 3;
    this.events = [];
    this.lastFetch = null;
    this._renderedEntityIds = new Set();
    this._clickHandler = null;
  }

  /**
   * Build the GDELT API URL
   * @returns {string} Full API URL
   * @private
   */
  _buildUrl() {
    const params = new URLSearchParams({
      query: this.query,
      format: 'GeoJSON',
      timespan: this.timespan,
    });
    return `${GDELT_API_URL}?${params.toString()}`;
  }

  /**
   * Fetch news data from GDELT API
   * @returns {Promise<Object|null>} GeoJSON data or null on failure
   */
  async fetchData() {
    try {
      const url = this._buildUrl();
      const response = await fetchWithRetry(url, {
        timeout: this.timeout,
        retries: this.retries,
      });

      if (!response || !response.ok) {
        console.warn('[NewsLayer] GDELT API request failed');
        return null;
      }

      const data = await response.json();
      this.lastFetch = new Date();
      return data;
    } catch (error) {
      console.warn('[NewsLayer] Failed to fetch GDELT data:', error.message);
      return null;
    }
  }

  /**
   * Parse GeoJSON response into news event objects
   * @param {Object} geojson - GeoJSON response from GDELT
   * @returns {Array<Object>} Array of news event objects
   */
  parseResponse(geojson) {
    if (!geojson || !geojson.features || !Array.isArray(geojson.features)) {
      return [];
    }

    const events = [];

    for (const feature of geojson.features) {
      if (!feature.geometry || !feature.properties) {
        continue;
      }

      const coords = feature.geometry.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) {
        continue;
      }

      const lon = coords[0];
      const lat = coords[1];

      // Skip invalid coordinates
      if (typeof lon !== 'number' || typeof lat !== 'number') {
        continue;
      }

      const props = feature.properties;

      events.push({
        id: props.urlpubtimeserial || `news-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        headline: props.name || props.title || 'News Event',
        source: props.domain || props.source || 'Unknown Source',
        url: props.url || props.shareimage || null,
        timestamp: props.seendate ? new Date(props.seendate) : new Date(),
        lat,
        lon,
        imageUrl: props.shareimage || null,
        tone: props.tone || 0,
        type: 'news',
      });
    }

    this.events = events;
    return events;
  }

  /**
   * Fetch and parse news data in one step
   * @returns {Promise<Array<Object>>} Array of news event objects
   */
  async fetchAndParse() {
    const geojson = await this.fetchData();
    if (!geojson) {
      return [];
    }
    return this.parseResponse(geojson);
  }

  /**
   * Get news event by ID
   * @param {string} id - Event ID
   * @returns {Object|null} News event or null if not found
   */
  getEventById(id) {
    return this.events.find(e => e.id === id) || null;
  }

  /**
   * Get count of loaded news events
   * @returns {number} Number of events
   */
  get count() {
    return this.events.length;
  }

  /**
   * Get news event info by ID
   * @param {string} eventId - Event ID
   * @returns {Object|null} Event data object
   */
  getInfo(eventId) {
    const event = this.getEventById(eventId);
    if (!event) {
      return null;
    }

    return {
      ...event,
      lastFetch: this.lastFetch,
    };
  }

  /**
   * Create a pulsing size callback for animated marker effect
   * @param {number} baseSize - Base pixel size
   * @returns {Object} Cesium CallbackProperty for pulsing size
   * @private
   */
  _createPulsingSize(baseSize) {
    if (!Cesium) return baseSize;

    const startTime = Date.now();

    return new Cesium.CallbackProperty(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      const phase = (elapsed % CINEMATIC_SETTINGS.pulsePeriod) / CINEMATIC_SETTINGS.pulsePeriod;
      const pulseFactor = 1 + CINEMATIC_SETTINGS.pulseAmplitude * Math.sin(phase * 2 * Math.PI);
      return baseSize * pulseFactor;
    }, false);
  }

  /**
   * Render news events on the globe with pulsing amber markers
   * @param {Object} globe - Globe instance with addEntity method
   * @returns {Array<string>} Array of created entity IDs
   */
  render(globe) {
    if (!globe || typeof globe.addEntity !== 'function') {
      return [];
    }

    if (!Cesium) {
      return [];
    }

    const entityIds = [];
    const self = this;
    const currentEventIds = new Set();

    // Limit events for performance
    const eventsToRender = this.events.slice(0, MAX_NEWS_MARKERS);

    for (const event of eventsToRender) {
      if (event.lat == null || event.lon == null) {
        continue;
      }

      const entityId = `news-${event.id}`;
      currentEventIds.add(entityId);

      // Check if entity already exists
      const existingEntity = globe.getEntity(entityId);

      if (!existingEntity) {
        // Create pulsing marker
        const pulsingSize = this._createPulsingSize(CINEMATIC_SETTINGS.markerPixelSize);

        globe.addEntity(entityId, {
          name: event.headline,
          position: Cesium.Cartesian3.fromDegrees(event.lon, event.lat, 1000),
          point: {
            pixelSize: pulsingSize,
            color: Cesium.Color.ORANGE.withAlpha(CINEMATIC_SETTINGS.markerOpacity),
            outlineColor: Cesium.Color.DARKORANGE,
            outlineWidth: 1,
          },
          label: {
            text: event.headline.substring(0, 40) + (event.headline.length > 40 ? '...' : ''),
            font: '9px monospace',
            fillColor: Cesium.Color.ORANGE.withAlpha(0.9),
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 1,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -10),
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 2000000),
            show: true,
          },
          properties: {
            newsId: event.id,
            headline: event.headline,
            source: event.source,
            url: event.url,
            timestamp: event.timestamp,
            type: 'news',
          },
        });

        this._renderedEntityIds.add(entityId);
      }

      entityIds.push(entityId);
    }

    // Remove entities for events no longer in data
    for (const oldId of this._renderedEntityIds) {
      if (!currentEventIds.has(oldId)) {
        globe.removeEntity(oldId);
        this._renderedEntityIds.delete(oldId);
      }
    }

    this._renderedEntityIds = currentEventIds;

    // Set up click handler
    if (!this._clickHandler && globe.getViewer && typeof globe.getViewer === 'function') {
      const viewer = globe.getViewer();
      if (viewer && viewer.scene) {
        const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

        handler.setInputAction((click) => {
          const pickedObject = viewer.scene.pick(click.position);
          if (Cesium.defined(pickedObject) && pickedObject.id) {
            const entity = pickedObject.id;
            const props = entity.properties;
            if (props && props.type) {
              const entityType = props.type.getValue ? props.type.getValue() : props.type;
              if (entityType === 'news' && props.newsId) {
                const newsId = props.newsId.getValue ? props.newsId.getValue() : props.newsId;
                const info = self.getInfo(newsId);
                if (info) {
                  const event = new CustomEvent('newsClick', { detail: info });
                  if (typeof document !== 'undefined') {
                    document.dispatchEvent(event);
                  }
                }
              }
            }
          }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

        this._clickHandler = handler;
      }
    }

    return entityIds;
  }

  /**
   * Remove all rendered news entities from the globe
   * @param {Object} globe - Globe instance with removeEntity method
   */
  removeAll(globe) {
    if (!globe || typeof globe.removeEntity !== 'function') {
      return;
    }

    for (const entityId of this._renderedEntityIds) {
      globe.removeEntity(entityId);
    }
    this._renderedEntityIds.clear();

    if (this._clickHandler) {
      this._clickHandler.destroy();
      this._clickHandler = null;
    }
  }
}

export { GDELT_API_URL, NEWS_REFRESH_INTERVAL };
