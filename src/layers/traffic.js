/**
 * Traffic Data Layer - OSM Road Network
 * Fetches road network from OpenStreetMap Overpass API and parses into road segments.
 * Road segments are arrays of {lat, lon} waypoints for use in particle system visualization.
 */

import { fetchWithRetry } from '../utils/api.js';

/**
 * Default Overpass API endpoint
 */
const DEFAULT_OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

/**
 * TrafficLayer class
 * Manages road network data fetching and parsing from OpenStreetMap Overpass API.
 */
export class TrafficLayer {
  /**
   * Create a new TrafficLayer
   * @param {Object} options - Configuration options
   * @param {string} [options.url] - Overpass API URL (default: overpass-api.de)
   * @param {number} [options.timeout] - Fetch timeout in ms (default: 60000)
   * @param {number} [options.retries] - Number of fetch retries (default: 3)
   */
  constructor(options = {}) {
    this.url = options.url || DEFAULT_OVERPASS_URL;
    this.timeout = options.timeout || 60000;
    this.retries = options.retries || 3;
    this.roadSegments = [];
    this.lastFetch = null;
  }

  /**
   * Build Overpass QL query for road network within bounding box
   * @param {Object} bbox - Bounding box {south, west, north, east}
   * @returns {string} Overpass QL query string
   * @private
   */
  _buildQuery(bbox) {
    // Overpass uses (south, west, north, east) format
    const { south, west, north, east } = bbox;

    // Query for highways (roads) within the bounding box
    // Returns geometry as JSON with all waypoints
    return `
      [out:json][timeout:60];
      (
        way["highway"](${south},${west},${north},${east});
      );
      out body;
      >;
      out skel qt;
    `.trim();
  }

  /**
   * Fetch road data from Overpass API for a given bounding box
   * @param {Object} bbox - Bounding box {south, west, north, east}
   * @returns {Promise<Object|null>} Raw JSON response or null on failure
   */
  async fetchData(bbox) {
    if (!bbox || typeof bbox.south !== 'number' || typeof bbox.west !== 'number' ||
        typeof bbox.north !== 'number' || typeof bbox.east !== 'number') {
      return null;
    }

    try {
      const query = this._buildQuery(bbox);

      const response = await fetchWithRetry(this.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `data=${encodeURIComponent(query)}`,
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
   * Parse Overpass response into road segments
   * Each road segment is an array of {lat, lon} waypoints
   *
   * @param {Object} response - Raw Overpass API JSON response
   * @returns {Array<Object>} Array of road segment objects with:
   *   - id: OSM way ID
   *   - highway: Road type (motorway, primary, residential, etc.)
   *   - name: Road name (if available)
   *   - waypoints: Array of {lat, lon} coordinates
   */
  parseResponse(response) {
    if (!response || !response.elements || !Array.isArray(response.elements)) {
      return [];
    }

    // Build a map of node IDs to coordinates
    const nodeMap = new Map();

    for (const element of response.elements) {
      if (element.type === 'node' && typeof element.lat === 'number' && typeof element.lon === 'number') {
        nodeMap.set(element.id, { lat: element.lat, lon: element.lon });
      }
    }

    const roadSegments = [];

    // Process ways (roads)
    for (const element of response.elements) {
      if (element.type !== 'way') {
        continue;
      }

      // Skip ways without node references
      if (!element.nodes || !Array.isArray(element.nodes) || element.nodes.length < 2) {
        continue;
      }

      // Build waypoints array from node references
      const waypoints = [];
      for (const nodeId of element.nodes) {
        const coords = nodeMap.get(nodeId);
        if (coords) {
          waypoints.push({ lat: coords.lat, lon: coords.lon });
        }
      }

      // Skip if we couldn't resolve enough waypoints
      if (waypoints.length < 2) {
        continue;
      }

      // Extract tags
      const tags = element.tags || {};

      roadSegments.push({
        id: element.id,
        highway: tags.highway || null,
        name: tags.name || null,
        waypoints,
      });
    }

    this.roadSegments = roadSegments;
    return roadSegments;
  }

  /**
   * Fetch and parse road data in one step
   * @param {Object} bbox - Bounding box {south, west, north, east}
   * @returns {Promise<Array<Object>>} Array of road segment objects
   */
  async fetchAndParse(bbox) {
    const response = await this.fetchData(bbox);
    if (!response) {
      return [];
    }
    return this.parseResponse(response);
  }

  /**
   * Get road segment by OSM way ID
   * @param {number} id - OSM way ID
   * @returns {Object|null} Road segment object or null if not found
   */
  getRoadById(id) {
    return this.roadSegments.find(road => road.id === id) || null;
  }

  /**
   * Get roads filtered by highway type
   * @param {string|Array<string>} types - Highway type(s) to filter by
   * @returns {Array<Object>} Filtered road segments
   */
  getRoadsByType(types) {
    const typeArray = Array.isArray(types) ? types : [types];
    return this.roadSegments.filter(road => typeArray.includes(road.highway));
  }

  /**
   * Get roads that have a name
   * @returns {Array<Object>} Named road segments
   */
  getNamedRoads() {
    return this.roadSegments.filter(road => road.name !== null);
  }

  /**
   * Get count of loaded road segments
   * @returns {number} Number of road segments
   */
  get count() {
    return this.roadSegments.length;
  }

  /**
   * Get total number of waypoints across all segments
   * @returns {number} Total waypoint count
   */
  get totalWaypoints() {
    return this.roadSegments.reduce((sum, road) => sum + road.waypoints.length, 0);
  }

  /**
   * Get road segment info by ID
   * @param {number} roadId - OSM way ID
   * @returns {Object|null} Road data object
   */
  getInfo(roadId) {
    const road = this.getRoadById(roadId);
    if (!road) {
      return null;
    }

    return {
      id: road.id,
      highway: road.highway,
      name: road.name,
      waypointCount: road.waypoints.length,
      waypoints: road.waypoints,
      lastFetch: this.lastFetch,
    };
  }
}

export { DEFAULT_OVERPASS_URL };
