/**
 * News Events Layer - GDELT News API
 * Fetches news articles from GDELT DOC API and renders on globe.
 * Uses country geocoding since DOC API returns sourcecountry but no lat/lon.
 * Focuses on conflict and military news events.
 */

import { fetchWithRetry } from '../utils/api.js';

// Use Cesium from global scope (loaded via CDN in index.html)
const Cesium = (typeof window !== 'undefined' && window.Cesium) ||
               (typeof globalThis !== 'undefined' && globalThis.Cesium) ||
               null;

/**
 * GDELT DOC API endpoint for news articles
 * Free API - no authentication required
 * Uses local CORS proxy to avoid browser CORS restrictions
 */
const GDELT_API_URL = 'http://localhost:8091/gdelt/api/v2/doc/doc';

/**
 * Maximum number of news markers for performance
 * Per task spec: cap at 100 events
 */
const MAX_NEWS_MARKERS = 100;

/**
 * Refresh interval for news events (5 minutes)
 * GDELT wants max 1 request per 5 seconds, so 5 minutes is safe
 */
const NEWS_REFRESH_INTERVAL = 300000;

/**
 * Minimum retry delay after failure (30 seconds)
 */
const MIN_RETRY_DELAY = 30000;

/**
 * Country centroid coordinates lookup table
 * Maps country names to [lat, lon] for geocoding articles
 */
const COUNTRY_COORDS = {
    'United States': [39.8, -98.5],
    'Russia': [61.5, 105.3],
    'Ukraine': [48.4, 31.2],
    'China': [35.9, 104.2],
    'Iran': [32.4, 53.7],
    'Israel': [31.0, 34.8],
    'Syria': [35.0, 38.0],
    'Iraq': [33.2, 43.7],
    'Yemen': [15.6, 48.5],
    'Lebanon': [33.9, 35.5],
    'Turkey': [39.9, 32.9],
    'Palestine': [31.9, 35.2],
    'Saudi Arabia': [23.9, 45.1],
    'Pakistan': [30.4, 69.3],
    'India': [20.6, 79.0],
    'North Korea': [40.3, 127.5],
    'South Korea': [35.9, 127.8],
    'Taiwan': [23.7, 121.0],
    'Japan': [36.2, 138.3],
    'United Kingdom': [55.4, -3.4],
    'France': [46.2, 2.2],
    'Germany': [51.2, 10.4],
    'Poland': [51.9, 19.1],
    'Lithuania': [55.2, 23.9],
    'Myanmar': [19.7, 96.1],
    'Sudan': [12.9, 30.2],
    'Somalia': [5.2, 46.2],
    'Libya': [26.3, 17.2],
    'Nigeria': [9.1, 8.7],
    'Afghanistan': [33.9, 67.7],
    'Egypt': [26.8, 30.8],
    'Jordan': [30.6, 36.2]
};

/**
 * Cinematic news visualization settings
 * Pulsing orange markers for conflict news - per task spec: pixelSize 7
 */
const CINEMATIC_SETTINGS = {
  markerPixelSize: 7,
  markerColor: 'ORANGE',
  markerOpacity: 0.9,
  pulseAmplitude: 0.3,
  pulsePeriod: 1.5,
  // Glow effect settings - larger semi-transparent circle behind marker
  glowPixelSize: 20,
  glowOpacity: 0.15,
};

/**
 * Parse GDELT date format "20260306T090000Z" into a Date object
 * @param {string|Date} dateValue - GDELT date string or Date object
 * @returns {Date} Parsed Date object
 */
function parseGdeltDate(dateValue) {
  if (dateValue instanceof Date && !isNaN(dateValue.getTime())) {
    return dateValue;
  }
  if (typeof dateValue === 'string') {
    // GDELT seendate format: 20260306T090000Z
    const parsed = dateValue.replace(
      /(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/,
      '$1-$2-$3T$4:$5:$6Z'
    );
    const date = new Date(parsed);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }
  return new Date();
}

/**
 * NewsLayer class
 * Manages news event data fetching and rendering from GDELT DOC API.
 */
export class NewsLayer {
  /**
   * Create a new NewsLayer
   * @param {Object} options - Configuration options
   * @param {string} [options.query] - Search query (default: military conflict war)
   * @param {string} [options.timespan] - Time span for news (default: '24h')
   * @param {number} [options.timeout] - Fetch timeout in ms (default: 30000)
   * @param {number} [options.retries] - Number of fetch retries (default: 3)
   */
  constructor(options = {}) {
    this.query = options.query || 'military conflict war';
    this.timespan = options.timespan || '24h';
    this.timeout = options.timeout || 30000;
    this.retries = options.retries || 3;
    this.events = [];
    this.lastFetch = null;
    this.lastFailure = null;
    this._renderedEntityIds = new Set();
    this._clickHandler = null;
  }

  /**
   * Build the GDELT DOC API URL
   * @returns {string} Full API URL
   * @private
   */
  _buildUrl() {
    const params = new URLSearchParams({
      query: this.query,
      mode: 'ArtList',
      format: 'json',
      timespan: this.timespan,
      maxrecords: '100'
    });
    return `${GDELT_API_URL}?${params.toString()}`;
  }

  /**
   * Check if we should retry after a failure
   * @returns {boolean} True if enough time has passed since last failure
   * @private
   */
  _canRetry() {
    if (!this.lastFailure) return true;
    return (Date.now() - this.lastFailure) >= MIN_RETRY_DELAY;
  }

  /**
   * Fetch news data from GDELT DOC API
   * @returns {Promise<Object|null>} JSON data or null on failure
   */
  async fetchData() {
    // Respect rate limit - don't retry too soon after failure
    if (!this._canRetry()) {
      console.log('[News] Waiting before retry (rate limit protection)');
      return null;
    }

    try {
      const url = this._buildUrl();
      console.log('[News] Fetching from GDELT DOC API...');
      const response = await fetchWithRetry(url, {
        timeout: this.timeout,
        retries: this.retries,
      });

      if (!response || !response.ok) {
        console.warn('[NewsLayer] GDELT API request failed');
        this.lastFailure = Date.now();
        return null;
      }

      const data = await response.json();
      this.lastFetch = new Date();
      this.lastFailure = null;
      return data;
    } catch (error) {
      console.warn('[NewsLayer] Failed to fetch GDELT data:', error.message);
      this.lastFailure = Date.now();
      return null;
    }
  }

  /**
   * Parse DOC API response into news event objects with geocoding
   * @param {Object} response - JSON response from GDELT DOC API
   * @returns {Array<Object>} Array of news event objects with coordinates
   */
  parseResponse(response) {
    const articles = response.articles || [];
    const events = [];

    for (const article of articles) {
      const coords = COUNTRY_COORDS[article.sourcecountry];
      if (!coords) {
        // Skip articles from unknown countries
        continue;
      }

      // Add small random offset so articles from same country don't stack
      const lat = coords[0] + (Math.random() - 0.5) * 2;
      const lon = coords[1] + (Math.random() - 0.5) * 2;

      events.push({
        id: `news-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        headline: article.title || 'News Event',
        source: article.domain || 'Unknown Source',
        url: article.url || null,
        timestamp: article.seendate ? parseGdeltDate(article.seendate) : new Date(),
        lat,
        lon,
        country: article.sourcecountry,
        language: article.language,
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
    const data = await this.fetchData();
    if (!data) {
      console.log('[News] No data received from GDELT');
      return [];
    }
    const events = this.parseResponse(data);
    console.log(`[News] Fetched ${events.length} conflict events, rendering...`);
    return events;
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
   * Render news events on the globe with pulsing orange markers
   * Per task spec: Orange pulsing dot (pixelSize: 7, color: Cesium.Color.ORANGE)
   * console.log('[News] Added N markers to globe')
   * @param {Object} globe - Globe instance with addEntity method
   * @returns {Array<string>} Array of created entity IDs
   */
  render(globe) {
    if (!globe || typeof globe.addEntity !== 'function') {
      console.warn('[News] Globe not available for rendering');
      return [];
    }

    if (!Cesium) {
      console.warn('[News] Cesium not available');
      return [];
    }

    const entityIds = [];
    const self = this;
    const currentEventIds = new Set();

    // Limit events for performance (cap at 100 per task spec)
    const eventsToRender = this.events.slice(0, MAX_NEWS_MARKERS);
    let addedCount = 0;

    for (const event of eventsToRender) {
      if (event.lat == null || event.lon == null) {
        continue;
      }

      const entityId = `news-${event.id}`;
      currentEventIds.add(entityId);

      // Check if entity already exists
      const existingEntity = globe.getEntity(entityId);

      if (!existingEntity) {
        // Create pulsing marker - use viewer.entities.add directly for guaranteed visibility
        const pulsingSize = this._createPulsingSize(CINEMATIC_SETTINGS.markerPixelSize);
        const position = Cesium.Cartesian3.fromDegrees(event.lon, event.lat, 5000);

        // Add glow effect - larger semi-transparent orange circle behind marker
        const glowEntityId = `${entityId}-glow`;
        globe.addEntity(glowEntityId, {
          position: position,
          point: {
            pixelSize: CINEMATIC_SETTINGS.glowPixelSize,
            color: Cesium.Color.ORANGE.withAlpha(CINEMATIC_SETTINGS.glowOpacity),
            outlineColor: Cesium.Color.TRANSPARENT,
            outlineWidth: 0,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          properties: {
            type: 'news-glow',
            parentId: event.id,
          },
        });
        this._renderedEntityIds.add(glowEntityId);

        // Per task spec: Orange pulsing dot, small label with truncated headline (first 40 chars, font: '10px monospace')
        globe.addEntity(entityId, {
          name: event.headline,
          position: position,
          point: {
            pixelSize: pulsingSize,
            color: Cesium.Color.ORANGE.withAlpha(CINEMATIC_SETTINGS.markerOpacity),
            outlineColor: Cesium.Color.DARKORANGE,
            outlineWidth: 2,
            disableDepthTestDistance: Number.POSITIVE_INFINITY, // Always visible
          },
          label: {
            text: event.headline.substring(0, 40) + (event.headline.length > 40 ? '...' : ''),
            font: '10px monospace', // Per task spec: 10px monospace
            fillColor: Cesium.Color.ORANGE.withAlpha(0.95),
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -12),
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 3000000),
            disableDepthTestDistance: Number.POSITIVE_INFINITY, // Always visible
            showBackground: true,
            backgroundColor: Cesium.Color.BLACK.withAlpha(0.6),
            show: true,
          },
          properties: {
            newsId: event.id,
            headline: event.headline,
            source: event.source,
            url: event.url,
            timestamp: event.timestamp,
            country: event.country,
            type: 'news',
          },
        });

        this._renderedEntityIds.add(entityId);
        addedCount++;
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

    // Per task spec: console.log('[News] Added N markers to globe')
    console.log(`[News] Added ${entityIds.length} markers to globe`);

    // Set up click handler for news marker clicks
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
                  const customEvent = new CustomEvent('newsClick', { detail: info });
                  if (typeof document !== 'undefined') {
                    document.dispatchEvent(customEvent);
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

export { GDELT_API_URL, NEWS_REFRESH_INTERVAL, COUNTRY_COORDS };
