/**
 * Seismic Data Layer - USGS Earthquakes
 * Fetches earthquake data from USGS GeoJSON API and parses into earthquake objects.
 * Data-only layer - no rendering logic.
 */

import { fetchWithRetry } from '../utils/api.js';

/**
 * Default USGS earthquake feed URL (all earthquakes in the past day)
 */
const DEFAULT_USGS_URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson';

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
}

export { DEFAULT_USGS_URL };
