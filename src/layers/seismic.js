/**
 * Seismic Data Layer - USGS Earthquakes
 * Fetches earthquake data from USGS GeoJSON API and parses into earthquake objects.
 * Renders earthquakes on a Cesium globe with pulsing circles sized by magnitude.
 */

import { fetchWithRetry } from '../utils/api.js';

// Use Cesium from global scope (loaded via CDN in index.html)
// In Node.js environment, Cesium will be null
const Cesium = (typeof window !== 'undefined' && window.Cesium) ||
               (typeof globalThis !== 'undefined' && globalThis.Cesium) ||
               null;

/**
 * Default USGS earthquake feed URL (all earthquakes in the past day)
 */
const DEFAULT_USGS_URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson';

/**
 * Maximum number of seismic markers for performance
 */
const MAX_SEISMIC_MARKERS = 200;

/**
 * Cinematic seismic visualization settings
 * Subtle pulsing rings at earthquake locations
 */
const CINEMATIC_SETTINGS = {
  // Ring appearance: thin outline, pulsing animation
  ringOpacity: 0.4,
  ringOutlineOpacity: 0.7,
  pulseAmplitude: 0.3,
  pulsePeriod: 2.5,
};

/**
 * SeismicLayer class
 * Manages earthquake data fetching and parsing from USGS GeoJSON feed.
 */
export class SeismicLayer {
  /**
   * Create a new SeismicLayer
   * @param {Object} options - Configuration options
   * @param {string} [options.url] - USGS feed URL (default: all_day.geojson)
   * @param {number} [options.timeout] - Fetch timeout in ms (default: 30000)
   * @param {number} [options.retries] - Number of fetch retries (default: 3)
   */
  constructor(options = {}) {
    this.url = options.url || DEFAULT_USGS_URL;
    this.timeout = options.timeout || 30000;
    this.retries = options.retries || 3;
    this.earthquakes = [];
    this.lastFetch = null;
  }

  /**
   * Fetch earthquake data from the configured URL
   * @returns {Promise<Object|null>} Raw GeoJSON data or null on failure
   */
  async fetchData() {
    try {
      const response = await fetchWithRetry(this.url, {
        timeout: this.timeout,
        retries: this.retries,
      });

      if (!response || !response.ok) {
        return null;
      }

      const json = await response.json();
      this.lastFetch = new Date();
      return json;
    } catch (error) {
      return null;
    }
  }

  /**
   * Parse GeoJSON response into earthquake objects
   * GeoJSON coordinates are [lon, lat, depth]
   *
   * @param {Object} geojson - Raw GeoJSON data from USGS
   * @returns {Array<Object>} Array of earthquake objects with:
   *   - id: USGS event ID
   *   - magnitude: Earthquake magnitude
   *   - lat: Latitude in degrees
   *   - lon: Longitude in degrees
   *   - depth: Depth in km
   *   - timestamp: Event time as Date object
   *   - place: Description of location
   *   - url: USGS event page URL
   */
  parseResponse(geojson) {
    if (!geojson || !geojson.features || !Array.isArray(geojson.features)) {
      return [];
    }

    const earthquakes = [];

    for (const feature of geojson.features) {
      // Validate feature structure
      if (!feature.geometry || !feature.properties) {
        continue;
      }

      const coords = feature.geometry.coordinates;
      const props = feature.properties;

      // GeoJSON coordinates are [lon, lat, depth]
      if (!Array.isArray(coords) || coords.length < 3) {
        continue;
      }

      const lon = coords[0];
      const lat = coords[1];
      const depth = coords[2];

      // Skip invalid coordinates
      if (typeof lon !== 'number' || typeof lat !== 'number' || typeof depth !== 'number') {
        continue;
      }

      // Extract magnitude (may be null for some events)
      const magnitude = typeof props.mag === 'number' ? props.mag : null;

      // Extract timestamp (in milliseconds since epoch)
      const timestamp = typeof props.time === 'number' ? new Date(props.time) : null;

      earthquakes.push({
        id: feature.id || null,
        magnitude,
        lat,
        lon,
        depth,
        timestamp,
        place: props.place || null,
        url: props.url || null,
      });
    }

    this.earthquakes = earthquakes;
    return earthquakes;
  }

  /**
   * Fetch and parse earthquake data in one step
   * @returns {Promise<Array<Object>>} Array of earthquake objects
   */
  async fetchAndParse() {
    const geojson = await this.fetchData();
    if (!geojson) {
      return [];
    }
    return this.parseResponse(geojson);
  }

  /**
   * Get earthquake by ID
   * @param {string} id - USGS event ID
   * @returns {Object|null} Earthquake object or null if not found
   */
  getEarthquakeById(id) {
    return this.earthquakes.find(eq => eq.id === id) || null;
  }

  /**
   * Get earthquakes filtered by minimum magnitude
   * @param {number} minMagnitude - Minimum magnitude threshold
   * @returns {Array<Object>} Filtered earthquakes
   */
  getEarthquakesByMagnitude(minMagnitude) {
    return this.earthquakes.filter(eq =>
      eq.magnitude !== null && eq.magnitude >= minMagnitude
    );
  }

  /**
   * Get count of loaded earthquakes
   * @returns {number} Number of earthquakes
   */
  get count() {
    return this.earthquakes.length;
  }

  /**
   * Get earthquake info by ID
   * @param {string} earthquakeId - USGS event ID
   * @returns {Object|null} Earthquake data object
   */
  getInfo(earthquakeId) {
    const eq = this.getEarthquakeById(earthquakeId);
    if (!eq) {
      return null;
    }

    return {
      id: eq.id,
      magnitude: eq.magnitude,
      lat: eq.lat,
      lon: eq.lon,
      depth: eq.depth,
      timestamp: eq.timestamp,
      place: eq.place,
      url: eq.url,
      lastFetch: this.lastFetch,
    };
  }

  /**
   * Calculate circle radius based on earthquake magnitude
   * Magnitude 5 = 50km radius, Magnitude 7 = 200km radius
   * Uses exponential scaling for visual effect
   * @param {number|null} magnitude - Earthquake magnitude
   * @returns {number} Radius in meters
   * @private
   */
  _getRadiusByMagnitude(magnitude) {
    if (magnitude == null || magnitude < 0) {
      return 25000; // Default 25km for unknown magnitude
    }

    // Linear interpolation: mag 5 = 50km, mag 7 = 200km
    // slope = (200 - 50) / (7 - 5) = 75 km per magnitude unit
    // For magnitudes below 5 or above 7, we still use the formula but clamp minimum
    const baseRadius = 50000; // 50km at mag 5
    const slope = 75000; // 75km per magnitude unit

    const radius = baseRadius + (magnitude - 5) * slope;

    // Minimum radius of 10km, maximum of 500km
    return Math.max(10000, Math.min(500000, radius));
  }

  /**
   * Get color based on earthquake depth
   * Shallow (<70km) = red, Intermediate (70-300km) = orange, Deep (>300km) = blue
   * @param {number|null} depth - Depth in kilometers
   * @returns {Object} Cesium Color object
   * @private
   */
  _getColorByDepth(depth) {
    if (!Cesium) return null;

    if (depth == null || depth < 0) {
      return Cesium.Color.GRAY; // Unknown depth
    }

    if (depth < 70) {
      // Shallow earthquake - red
      return Cesium.Color.RED;
    } else if (depth <= 300) {
      // Intermediate earthquake - orange
      return Cesium.Color.ORANGE;
    } else {
      // Deep earthquake - blue
      return Cesium.Color.BLUE;
    }
  }

  /**
   * Create a pulsing radius callback for animated ring effect
   * @param {number} baseRadius - Base radius in meters
   * @param {number} pulseAmplitude - Pulse amplitude as fraction (0.0 - 1.0)
   * @param {number} pulsePeriod - Pulse period in seconds
   * @returns {Object} Cesium CallbackProperty for pulsing radius
   * @private
   */
  _createPulsingRadius(baseRadius, pulseAmplitude = CINEMATIC_SETTINGS.pulseAmplitude, pulsePeriod = CINEMATIC_SETTINGS.pulsePeriod) {
    if (!Cesium) return baseRadius;

    const startTime = Date.now();

    return new Cesium.CallbackProperty(() => {
      const elapsed = (Date.now() - startTime) / 1000; // seconds
      const phase = (elapsed % pulsePeriod) / pulsePeriod; // 0 to 1
      const pulseFactor = 1 + pulseAmplitude * Math.sin(phase * 2 * Math.PI);
      return baseRadius * pulseFactor;
    }, false);
  }

  /**
   * Create a pulsing opacity callback for animated ring effect
   * @param {number} baseOpacity - Base opacity (0.0 - 1.0)
   * @param {number} pulsePeriod - Pulse period in seconds
   * @returns {Object} Cesium CallbackProperty for pulsing opacity
   * @private
   */
  _createPulsingOpacity(baseOpacity, pulsePeriod = CINEMATIC_SETTINGS.pulsePeriod) {
    if (!Cesium) return baseOpacity;

    const startTime = Date.now();

    return new Cesium.CallbackProperty(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      const phase = (elapsed % pulsePeriod) / pulsePeriod;
      // Opacity pulses between 0.2 and baseOpacity
      const opacityFactor = 0.5 + 0.5 * Math.sin(phase * 2 * Math.PI);
      return baseOpacity * opacityFactor;
    }, false);
  }

  /**
   * Render earthquakes on the globe with pulsing ring markers
   * Cinematic look: subtle pulsing rings, not solid circles
   *
   * @param {Object} globe - Globe instance with addEntity method
   * @returns {Array<string>} Array of created entity IDs
   */
  render(globe) {
    // Guard against null or undefined globe
    if (!globe || typeof globe.addEntity !== 'function') {
      return [];
    }

    // Guard against missing Cesium (Node.js environment)
    if (!Cesium) {
      return [];
    }

    const entityIds = [];
    const self = this;

    // Limit earthquakes for performance, prioritize higher magnitude
    const earthquakesToRender = this.earthquakes
      .filter(eq => eq.lat != null && eq.lon != null)
      .sort((a, b) => (b.magnitude || 0) - (a.magnitude || 0))
      .slice(0, MAX_SEISMIC_MARKERS);

    for (const eq of earthquakesToRender) {
      const entityId = `earthquake-${eq.id}`;

      // Calculate radius based on magnitude
      const baseRadius = this._getRadiusByMagnitude(eq.magnitude);

      // Get color based on depth
      const color = this._getColorByDepth(eq.depth);

      // Create pulsing radius effect for ring
      const pulsingRadius = this._createPulsingRadius(baseRadius);

      // Magnitude display string
      const magStr = eq.magnitude != null ? eq.magnitude.toFixed(1) : '?';

      // Cinematic earthquake ring: pulsing outline, very subtle fill
      globe.addEntity(entityId, {
        name: eq.place || `M${magStr} Earthquake`,
        position: Cesium.Cartesian3.fromDegrees(eq.lon, eq.lat, 0),
        ellipse: {
          semiMajorAxis: pulsingRadius,
          semiMinorAxis: pulsingRadius,
          // Very subtle fill - mostly transparent
          material: color.withAlpha(CINEMATIC_SETTINGS.ringOpacity * 0.3),
          outline: true,
          outlineColor: color.withAlpha(CINEMATIC_SETTINGS.ringOutlineOpacity),
          outlineWidth: 1.5,
          height: 0,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
        // Minimal label
        label: {
          text: `M${magStr}`,
          font: '10px monospace',
          fillColor: color.withAlpha(0.9),
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 1,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -5),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 5000000),
        },
        properties: {
          earthquakeId: eq.id,
          magnitude: eq.magnitude,
          depth: eq.depth,
          place: eq.place,
          timestamp: eq.timestamp,
          type: 'earthquake',
        },
      });

      entityIds.push(entityId);
    }

    // Set up click handler on the viewer
    if (globe.getViewer && typeof globe.getViewer === 'function') {
      const viewer = globe.getViewer();
      if (viewer && viewer.screenSpaceEventHandler) {
        // Create a new handler for picking
        const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

        handler.setInputAction((click) => {
          const pickedObject = viewer.scene.pick(click.position);
          if (Cesium.defined(pickedObject) && pickedObject.id) {
            const entity = pickedObject.id;
            const props = entity.properties;
            if (props && props.earthquakeId) {
              const earthquakeId = props.earthquakeId.getValue();
              const info = self.getInfo(earthquakeId);
              if (info) {
                // Dispatch custom event with earthquake info
                const event = new CustomEvent('earthquakeClick', { detail: info });
                if (typeof document !== 'undefined') {
                  document.dispatchEvent(event);
                }
              }
            }
          }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

        // Store handler reference for cleanup
        this._clickHandler = handler;
      }
    }

    return entityIds;
  }

  /**
   * Remove all rendered earthquake entities from the globe
   * @param {Object} globe - Globe instance with removeEntity method
   */
  removeAll(globe) {
    if (!globe || typeof globe.removeEntity !== 'function') {
      return;
    }

    for (const eq of this.earthquakes) {
      globe.removeEntity(`earthquake-${eq.id}`);
    }

    // Clean up click handler
    if (this._clickHandler) {
      this._clickHandler.destroy();
      this._clickHandler = null;
    }
  }
}

export { DEFAULT_USGS_URL };
