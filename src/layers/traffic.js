/**
 * Traffic Data Layer - OSM Road Network
 * Fetches road network from OpenStreetMap Overpass API and parses into road segments.
 * Road segments are arrays of {lat, lon} waypoints for use in particle system visualization.
 * Renders traffic particles that animate along road segments.
 */

import { fetchWithRetry } from '../utils/api.js';

// Use Cesium from global scope (loaded via CDN in index.html)
// In Node.js environment, Cesium will be null
const Cesium = (typeof window !== 'undefined' && window.Cesium) ||
               (typeof globalThis !== 'undefined' && globalThis.Cesium) ||
               null;

/**
 * Maximum number of active traffic particles (performance limit)
 */
const MAX_PARTICLES = 500;

/**
 * Particle animation duration in seconds (time to traverse one road segment)
 */
const PARTICLE_DURATION = 30;

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

  /**
   * Calculate total road length across all segments
   * Used to distribute particles proportionally
   * @returns {number} Total road length (sum of waypoint counts as proxy)
   * @private
   */
  _calculateTotalRoadDensity() {
    return this.roadSegments.reduce((sum, road) => sum + road.waypoints.length, 0);
  }

  /**
   * Get color for a traffic particle based on road type
   * Highways are blue, primary roads are green, others are yellow
   * @param {string|null} highway - Road type from OSM
   * @returns {Object} Cesium Color object
   * @private
   */
  _getParticleColor(highway) {
    if (!Cesium) return null;

    switch (highway) {
      case 'motorway':
      case 'motorway_link':
      case 'trunk':
      case 'trunk_link':
        return Cesium.Color.CYAN;
      case 'primary':
      case 'primary_link':
        return Cesium.Color.LIME;
      case 'secondary':
      case 'secondary_link':
        return Cesium.Color.YELLOW;
      default:
        return Cesium.Color.ORANGE;
    }
  }

  /**
   * Calculate the total length of a road segment in degrees (approximate)
   * @param {Array<Object>} waypoints - Array of {lat, lon} coordinates
   * @returns {number} Approximate length
   * @private
   */
  _calculateRoadLength(waypoints) {
    let length = 0;
    for (let i = 1; i < waypoints.length; i++) {
      const dx = waypoints[i].lon - waypoints[i - 1].lon;
      const dy = waypoints[i].lat - waypoints[i - 1].lat;
      length += Math.sqrt(dx * dx + dy * dy);
    }
    return length;
  }

  /**
   * Select a random point along a road segment
   * Returns the waypoint index and interpolation factor
   * @param {Object} road - Road segment object
   * @returns {Object} {waypointIndex, factor} where factor is 0-1
   * @private
   */
  _selectRandomStartPoint(road) {
    const segmentCount = road.waypoints.length - 1;
    const waypointIndex = Math.floor(Math.random() * segmentCount);
    const factor = Math.random();
    return { waypointIndex, factor };
  }

  /**
   * Create a SampledPositionProperty for smooth particle animation along waypoints
   * @param {Array<Object>} waypoints - Array of {lat, lon} coordinates
   * @param {number} startIndex - Starting waypoint index
   * @param {number} startFactor - Interpolation factor at start position (0-1)
   * @param {number} duration - Animation duration in seconds
   * @returns {Object} Cesium SampledPositionProperty
   * @private
   */
  _createParticlePath(waypoints, startIndex, startFactor, duration) {
    if (!Cesium) return null;

    const positionProperty = new Cesium.SampledPositionProperty();
    const startTime = Cesium.JulianDate.now();

    // Calculate remaining waypoints from start point
    const remainingWaypoints = waypoints.slice(startIndex);
    if (remainingWaypoints.length < 2) {
      // Not enough waypoints, use entire path
      return this._createFullPath(waypoints, duration);
    }

    // Calculate time per segment based on remaining waypoints
    const segmentCount = remainingWaypoints.length - 1;
    const timePerSegment = duration / segmentCount;

    // Add starting position (interpolated between waypoints)
    const startWp = remainingWaypoints[0];
    const nextWp = remainingWaypoints[1];
    const startLon = startWp.lon + (nextWp.lon - startWp.lon) * startFactor;
    const startLat = startWp.lat + (nextWp.lat - startWp.lat) * startFactor;

    positionProperty.addSample(
      startTime,
      Cesium.Cartesian3.fromDegrees(startLon, startLat, 10)
    );

    // Add subsequent waypoints
    for (let i = 1; i < remainingWaypoints.length; i++) {
      const wp = remainingWaypoints[i];
      const adjustedTime = (i - startFactor) * timePerSegment;
      const time = Cesium.JulianDate.addSeconds(startTime, adjustedTime, new Cesium.JulianDate());
      positionProperty.addSample(
        time,
        Cesium.Cartesian3.fromDegrees(wp.lon, wp.lat, 10)
      );
    }

    // Set interpolation for smooth movement
    positionProperty.setInterpolationOptions({
      interpolationDegree: 1,
      interpolationAlgorithm: Cesium.LinearApproximation,
    });

    return positionProperty;
  }

  /**
   * Create a SampledPositionProperty for the full path
   * @param {Array<Object>} waypoints - Array of {lat, lon} coordinates
   * @param {number} duration - Animation duration in seconds
   * @returns {Object} Cesium SampledPositionProperty
   * @private
   */
  _createFullPath(waypoints, duration) {
    if (!Cesium || waypoints.length < 2) return null;

    const positionProperty = new Cesium.SampledPositionProperty();
    const startTime = Cesium.JulianDate.now();
    const segmentCount = waypoints.length - 1;
    const timePerSegment = duration / segmentCount;

    for (let i = 0; i < waypoints.length; i++) {
      const wp = waypoints[i];
      const time = Cesium.JulianDate.addSeconds(startTime, i * timePerSegment, new Cesium.JulianDate());
      positionProperty.addSample(
        time,
        Cesium.Cartesian3.fromDegrees(wp.lon, wp.lat, 10)
      );
    }

    positionProperty.setInterpolationOptions({
      interpolationDegree: 1,
      interpolationAlgorithm: Cesium.LinearApproximation,
    });

    return positionProperty;
  }

  /**
   * Distribute particles across road segments proportionally to road density
   * @param {number} maxParticles - Maximum number of particles to create
   * @returns {Array<Object>} Array of particle specifications with road and start info
   * @private
   */
  _distributeParticles(maxParticles) {
    if (this.roadSegments.length === 0) {
      return [];
    }

    const particles = [];
    const totalDensity = this._calculateTotalRoadDensity();

    if (totalDensity === 0) {
      return [];
    }

    // Calculate particles per road proportionally to waypoint count (proxy for length)
    for (const road of this.roadSegments) {
      // Roads need at least 2 waypoints
      if (road.waypoints.length < 2) {
        continue;
      }

      const roadDensity = road.waypoints.length;
      const proportion = roadDensity / totalDensity;
      const particleCount = Math.max(1, Math.round(proportion * maxParticles));

      for (let i = 0; i < particleCount && particles.length < maxParticles; i++) {
        const startPoint = this._selectRandomStartPoint(road);
        particles.push({
          road,
          startIndex: startPoint.waypointIndex,
          startFactor: startPoint.factor,
        });
      }

      // Stop if we've hit the limit
      if (particles.length >= maxParticles) {
        break;
      }
    }

    return particles;
  }

  /**
   * Render traffic particles on the globe
   * Spawns particles at random points on road segments that animate along waypoints.
   * Particle count is proportional to road density, capped at MAX_PARTICLES for performance.
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

    // Guard against no road data
    if (this.roadSegments.length === 0) {
      return [];
    }

    const entityIds = [];

    // Distribute particles across roads
    const particleSpecs = this._distributeParticles(MAX_PARTICLES);

    for (let i = 0; i < particleSpecs.length; i++) {
      const spec = particleSpecs[i];
      const entityId = `traffic-particle-${spec.road.id}-${i}`;

      // Create animated position along waypoints
      const positionProperty = this._createParticlePath(
        spec.road.waypoints,
        spec.startIndex,
        spec.startFactor,
        PARTICLE_DURATION
      );

      if (!positionProperty) {
        continue;
      }

      // Get particle color based on road type
      const color = this._getParticleColor(spec.road.highway);

      // Create particle entity with animated position
      globe.addEntity(entityId, {
        name: `Traffic on ${spec.road.name || 'road'}`,
        position: positionProperty,
        point: {
          pixelSize: 6,
          color: color,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 1,
        },
        properties: {
          roadId: spec.road.id,
          highway: spec.road.highway,
          type: 'traffic-particle',
        },
      });

      entityIds.push(entityId);
    }

    // Store entity IDs for cleanup
    this._particleEntityIds = entityIds;

    return entityIds;
  }

  /**
   * Remove all rendered traffic particle entities from the globe
   * @param {Object} globe - Globe instance with removeEntity method
   */
  removeAll(globe) {
    if (!globe || typeof globe.removeEntity !== 'function') {
      return;
    }

    if (this._particleEntityIds) {
      for (const entityId of this._particleEntityIds) {
        globe.removeEntity(entityId);
      }
      this._particleEntityIds = [];
    }
  }
}

export { DEFAULT_OVERPASS_URL, MAX_PARTICLES, PARTICLE_DURATION };
