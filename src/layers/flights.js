/**
 * Flight Data Layer - OpenSky Network
 * Fetches live aircraft positions from OpenSky Network API and parses into flight objects.
 * Renders aircraft on a Cesium globe with color-coded markers based on military/civilian status.
 */

import { fetchWithRetry } from '../utils/api.js';
import { isMilitary } from './military.js';

// Use Cesium from global scope (loaded via CDN in index.html)
// In Node.js environment, Cesium will be null
const Cesium = (typeof window !== 'undefined' && window.Cesium) ||
               (typeof globalThis !== 'undefined' && globalThis.Cesium) ||
               null;

/**
 * OpenSky proxy URL - use local proxy to avoid CORS issues
 * The proxy runs on localhost:8091 and forwards requests to opensky-network.org
 */
const DEFAULT_OPENSKY_PROXY_URL = 'http://localhost:8091';

/**
 * OpenSky Network API endpoint for all aircraft states
 * Uses local proxy to avoid CORS and preflight issues with Authorization header
 */
const DEFAULT_OPENSKY_URL = DEFAULT_OPENSKY_PROXY_URL + '/api/states/all';

/**
 * OpenSky states array field indices
 * Reference: https://openskynetwork.github.io/opensky-api/rest.html#all-state-vectors
 */
const OPENSKY_FIELDS = {
  ICAO24: 0,        // Unique ICAO 24-bit address (hex string)
  CALLSIGN: 1,      // Callsign (8 chars, may be null)
  ORIGIN_COUNTRY: 2, // Country of origin
  TIME_POSITION: 3, // Unix timestamp of last position update
  LAST_CONTACT: 4,  // Unix timestamp of last contact
  LONGITUDE: 5,     // WGS-84 longitude in degrees
  LATITUDE: 6,      // WGS-84 latitude in degrees
  BARO_ALTITUDE: 7, // Barometric altitude in meters
  ON_GROUND: 8,     // Boolean, true if on ground
  VELOCITY: 9,      // Ground speed in m/s
  TRUE_TRACK: 10,   // Track angle in degrees clockwise from north
  VERTICAL_RATE: 11, // Vertical rate in m/s
  SENSORS: 12,      // Array of sensor IDs
  GEO_ALTITUDE: 13, // Geometric altitude in meters
  SQUAWK: 14,       // Transponder code (squawk)
  SPI: 15,          // Special purpose indicator
  POSITION_SOURCE: 16, // 0=ADS-B, 1=ASTERIX, 2=MLAT, 3=FLARM
};

/**
 * Altitude scale factor for visibility
 * Flight altitudes in meters are scaled up for better globe visualization
 */
const ALTITUDE_SCALE_FACTOR = 50;

/**
 * Maximum number of flight entities for performance
 */
const MAX_FLIGHT_ENTITIES = 2000;

/**
 * Cinematic flight visualization settings
 * Flights appear as tiny bright dots like stars moving across the globe
 */
const CINEMATIC_SETTINGS = {
  // Civilian: tiny bright cyan points
  civilianPixelSize: 3,
  civilianColor: 'CYAN',
  // Military: slightly larger red points with callsign labels
  militaryPixelSize: 5,
  militaryColor: 'RED',
  // Trail settings for military aircraft
  trailEnabled: true,
  trailFadeDuration: 5 * 60 * 1000, // 5 minutes in ms
};

/**
 * FlightLayer class
 * Manages flight data fetching and parsing from OpenSky Network.
 */
export class FlightLayer {
  /**
   * Create a new FlightLayer
   * @param {Object} options - Configuration options
   * @param {string} [options.url] - OpenSky API URL (default: /states/all)
   * @param {string} [options.username] - OpenSky username for authenticated access
   * @param {string} [options.password] - OpenSky password for authenticated access
   * @param {number} [options.timeout] - Fetch timeout in ms (default: 30000)
   * @param {number} [options.retries] - Number of fetch retries (default: 3)
   * @param {Object} [options.bounds] - Geographic bounds to filter {lamin, lomin, lamax, lomax}
   */
  constructor(options = {}) {
    this.baseUrl = options.url || DEFAULT_OPENSKY_URL;
    this.username = options.username || null;
    this.password = options.password || null;
    this.timeout = options.timeout || 30000;
    this.retries = options.retries || 3;
    this.bounds = options.bounds || null;
    this.flights = [];
    this.lastFetch = null;
    this.responseTime = null;
    // Track rendered entity IDs for smooth updates
    this._renderedEntityIds = new Set();
    // Flag to prevent concurrent updates
    this._updating = false;
  }

  /**
   * Build the API URL with optional bounds and authentication
   * @returns {string} Full API URL
   * @private
   */
  _buildUrl() {
    let url = this.baseUrl;
    const params = new URLSearchParams();

    // Add geographic bounds if specified
    if (this.bounds) {
      if (this.bounds.lamin != null) params.append('lamin', this.bounds.lamin);
      if (this.bounds.lomin != null) params.append('lomin', this.bounds.lomin);
      if (this.bounds.lamax != null) params.append('lamax', this.bounds.lamax);
      if (this.bounds.lomax != null) params.append('lomax', this.bounds.lomax);
    }

    const paramString = params.toString();
    if (paramString) {
      url += (url.includes('?') ? '&' : '?') + paramString;
    }

    return url;
  }

  /**
   * Build fetch options including authentication headers if credentials are provided
   * @returns {Object} Fetch options
   * @private
   */
  _buildFetchOptions() {
    const options = {
      timeout: this.timeout,
      retries: this.retries,
    };

    // Add basic auth header if credentials are provided
    if (this.username && this.password) {
      // Use btoa() for browser-compatible Base64 encoding
      const credentials = btoa(`${this.username}:${this.password}`);
      options.headers = {
        'Authorization': `Basic ${credentials}`,
      };
    }

    return options;
  }

  /**
   * Fetch flight data from the OpenSky Network API
   * @returns {Promise<Object|null>} Raw JSON response or null on failure
   */
  async fetchData() {
    try {
      const url = this._buildUrl();
      const options = this._buildFetchOptions();

      const response = await fetchWithRetry(url, options);

      if (!response || !response.ok) {
        return null;
      }

      const data = await response.json();
      this.lastFetch = new Date();
      this.responseTime = data.time ? new Date(data.time * 1000) : null;
      return data;
    } catch (error) {
      return null;
    }
  }

  /**
   * Parse OpenSky response into flight objects
   *
   * @param {Object} response - Raw OpenSky API response
   * @returns {Array<Object>} Array of flight objects with:
   *   - icao24: Unique ICAO 24-bit address (hex string)
   *   - callsign: Flight callsign (trimmed, may be null)
   *   - lat: WGS-84 latitude in degrees
   *   - lon: WGS-84 longitude in degrees
   *   - altitude: Altitude in meters (barometric or geometric)
   *   - velocity: Ground speed in m/s
   *   - heading: True track in degrees (0-360)
   *   - verticalRate: Vertical rate in m/s
   *   - onGround: Boolean indicating if aircraft is on ground
   *   - originCountry: Country of origin
   *   - squawk: Transponder squawk code
   */
  parseResponse(response) {
    if (!response || !response.states || !Array.isArray(response.states)) {
      return [];
    }

    const flights = [];

    for (const state of response.states) {
      // Skip if no position data
      if (state[OPENSKY_FIELDS.LATITUDE] == null || state[OPENSKY_FIELDS.LONGITUDE] == null) {
        continue;
      }

      const icao24 = state[OPENSKY_FIELDS.ICAO24];
      const callsign = state[OPENSKY_FIELDS.CALLSIGN];
      const lat = state[OPENSKY_FIELDS.LATITUDE];
      const lon = state[OPENSKY_FIELDS.LONGITUDE];

      // Use barometric altitude, fall back to geometric if unavailable
      const baroAlt = state[OPENSKY_FIELDS.BARO_ALTITUDE];
      const geoAlt = state[OPENSKY_FIELDS.GEO_ALTITUDE];
      const altitude = baroAlt != null ? baroAlt : geoAlt;

      const velocity = state[OPENSKY_FIELDS.VELOCITY];
      const heading = state[OPENSKY_FIELDS.TRUE_TRACK];
      const verticalRate = state[OPENSKY_FIELDS.VERTICAL_RATE];
      const onGround = state[OPENSKY_FIELDS.ON_GROUND];
      const originCountry = state[OPENSKY_FIELDS.ORIGIN_COUNTRY];
      const squawk = state[OPENSKY_FIELDS.SQUAWK];

      flights.push({
        icao24,
        callsign: callsign ? callsign.trim() : null,
        lat,
        lon,
        altitude,
        velocity,
        heading,
        verticalRate,
        onGround: Boolean(onGround),
        originCountry,
        squawk,
      });
    }

    this.flights = flights;
    return flights;
  }

  /**
   * Fetch and parse flight data in one step
   * @returns {Promise<Array<Object>>} Array of flight objects
   */
  async fetchAndParse() {
    const response = await this.fetchData();
    if (!response) {
      return [];
    }
    return this.parseResponse(response);
  }

  /**
   * Get flight by ICAO24 address
   * @param {string} icao24 - ICAO 24-bit address (hex string)
   * @returns {Object|null} Flight object or null if not found
   */
  getFlightById(icao24) {
    if (!icao24) return null;
    const searchId = icao24.toLowerCase();
    return this.flights.find(f => f.icao24 && f.icao24.toLowerCase() === searchId) || null;
  }

  /**
   * Get flights by callsign (case-insensitive partial match)
   * @param {string} callsign - Callsign to search
   * @returns {Array<Object>} Matching flights
   */
  getFlightsByCallsign(callsign) {
    if (!callsign) return [];
    const searchCallsign = callsign.toLowerCase();
    return this.flights.filter(f =>
      f.callsign && f.callsign.toLowerCase().includes(searchCallsign)
    );
  }

  /**
   * Get flights by origin country (case-insensitive partial match)
   * @param {string} country - Country name to search
   * @returns {Array<Object>} Matching flights
   */
  getFlightsByCountry(country) {
    if (!country) return [];
    const searchCountry = country.toLowerCase();
    return this.flights.filter(f =>
      f.originCountry && f.originCountry.toLowerCase().includes(searchCountry)
    );
  }

  /**
   * Get flights within altitude range
   * @param {number} minAlt - Minimum altitude in meters
   * @param {number} maxAlt - Maximum altitude in meters
   * @returns {Array<Object>} Flights within altitude range
   */
  getFlightsByAltitude(minAlt, maxAlt) {
    return this.flights.filter(f =>
      f.altitude != null && f.altitude >= minAlt && f.altitude <= maxAlt
    );
  }

  /**
   * Get flights that are currently airborne
   * @returns {Array<Object>} Airborne flights
   */
  getAirborneFlights() {
    return this.flights.filter(f => !f.onGround);
  }

  /**
   * Get flights that are on the ground
   * @returns {Array<Object>} Grounded flights
   */
  getGroundedFlights() {
    return this.flights.filter(f => f.onGround);
  }

  /**
   * Get count of loaded flights
   * @returns {number} Number of flights
   */
  get count() {
    return this.flights.length;
  }

  /**
   * Get count of military aircraft
   * @returns {number} Number of military flights
   */
  getMilitaryCount() {
    return this.flights.filter(f => isMilitary(f)).length;
  }

  /**
   * Get all military flights
   * @returns {Array<Object>} Array of military flight objects
   */
  getMilitaryFlights() {
    return this.flights.filter(f => isMilitary(f));
  }

  /**
   * Get detailed flight info by ICAO24 address
   * @param {string} icao24 - ICAO 24-bit address
   * @returns {Object|null} Flight info object
   */
  getInfo(icao24) {
    const flight = this.getFlightById(icao24);
    if (!flight) {
      return null;
    }

    return {
      ...flight,
      lastFetch: this.lastFetch,
      responseTime: this.responseTime,
    };
  }

  /**
   * Calculate marker size for cinematic display
   * Returns small pixel sizes for elegant star-like appearance
   * @param {boolean} isMilitary - Whether the flight is military
   * @returns {number} Pixel size for marker (3-5)
   * @private
   */
  _getMarkerSize(isMilitary) {
    return isMilitary ? CINEMATIC_SETTINGS.militaryPixelSize : CINEMATIC_SETTINGS.civilianPixelSize;
  }

  /**
   * Get marker color based on military status
   * @param {boolean} isMilitary - Whether the flight is military
   * @returns {Object} Cesium Color object
   * @private
   */
  _getMarkerColor(isMilitary) {
    if (!Cesium) return null;
    return isMilitary ? Cesium.Color.RED : Cesium.Color.CYAN;
  }

  /**
   * Get color based on altitude (green=low, red=high)
   * @param {number|null} altitude - Altitude in meters
   * @returns {Object} Cesium Color object
   * @private
   */
  _getAltitudeColor(altitude) {
    if (!Cesium) return null;

    if (altitude == null || altitude <= 0) {
      return Cesium.Color.GREEN; // Ground or unknown - green
    }

    // Interpolate from green (low) to red (high)
    const maxAltitude = 12000; // meters for full red
    const ratio = Math.min(altitude / maxAltitude, 1);

    // Green (0,1,0) -> Yellow (1,1,0) -> Red (1,0,0)
    if (ratio <= 0.5) {
      // Green to Yellow
      const r = ratio * 2;
      return new Cesium.Color(r, 1, 0, 1);
    } else {
      // Yellow to Red
      const g = 1 - (ratio - 0.5) * 2;
      return new Cesium.Color(1, g, 0, 1);
    }
  }

  /**
   * Get scaled altitude for visualization
   * Scales flight altitude for better visibility on the globe
   * @param {number|null} altitude - Altitude in meters
   * @returns {number} Scaled altitude in meters
   * @private
   */
  _getScaledAltitude(altitude) {
    if (altitude == null || altitude <= 0) {
      return 1000; // Minimum height above surface for visibility
    }
    // Scale altitude for visibility (real altitudes are tiny compared to Earth)
    return altitude * ALTITUDE_SCALE_FACTOR;
  }

  /**
   * Render flights on the globe with markers and labels
   * Military aircraft are colored red, civilian aircraft are colored blue.
   * Marker size varies by altitude (larger = higher).
   * Uses smooth updates via setValue() instead of removing/recreating entities.
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

    // Prevent concurrent updates
    if (this._updating) {
      return Array.from(this._renderedEntityIds);
    }
    this._updating = true;

    const entityIds = [];
    const self = this;
    const currentFlightIds = new Set();

    // Limit flights for performance
    const flightsToRender = this.flights.slice(0, MAX_FLIGHT_ENTITIES);

    for (const flight of flightsToRender) {
      // Skip flights without valid positions
      if (flight.lat == null || flight.lon == null) {
        continue;
      }

      const entityId = `flight-${flight.icao24}`;
      currentFlightIds.add(entityId);

      // Determine if this is a military aircraft
      const military = isMilitary(flight);

      // Cinematic styling: tiny bright dots
      const markerColor = this._getMarkerColor(military);
      const pixelSize = this._getMarkerSize(military);

      // Callsign for label (only shown for military)
      const labelText = flight.callsign || flight.icao24 || 'Unknown';

      // Calculate scaled altitude for visibility
      const scaledAltitude = this._getScaledAltitude(flight.altitude);

      // Check if entity already exists for smooth update
      const existingEntity = globe.getEntity(entityId);

      if (existingEntity) {
        // SMOOTH UPDATE: Update position using setValue() instead of recreating
        const newPosition = Cesium.Cartesian3.fromDegrees(
          flight.lon,
          flight.lat,
          scaledAltitude
        );
        existingEntity.position.setValue(newPosition);

        // Update other properties if needed
        if (existingEntity.point) {
          existingEntity.point.pixelSize.setValue(pixelSize);
          existingEntity.point.color.setValue(markerColor);
        }
        if (existingEntity.label && military) {
          existingEntity.label.text.setValue(labelText);
          existingEntity.label.show.setValue(true);
        } else if (existingEntity.label) {
          existingEntity.label.show.setValue(false);
        }
      } else {
        // Create new entity for flights not yet on globe
        // Cinematic look: tiny bright points, labels only for military
        globe.addEntity(entityId, {
          name: labelText,
          position: Cesium.Cartesian3.fromDegrees(
            flight.lon,
            flight.lat,
            scaledAltitude
          ),
          point: {
            pixelSize: pixelSize,
            color: markerColor,
            outlineColor: Cesium.Color.TRANSPARENT,
            outlineWidth: 0,
          },
          // Labels only for military aircraft
          label: military ? {
            text: labelText,
            font: '10px monospace',
            fillColor: Cesium.Color.RED.withAlpha(0.9),
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 1,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -8),
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 3000000),
            show: true,
          } : {
            text: '',
            show: false,
          },
          properties: {
            icao24: flight.icao24,
            callsign: flight.callsign,
            isMilitary: military,
            altitude: flight.altitude,
            velocity: flight.velocity,
            heading: flight.heading,
            originCountry: flight.originCountry,
            type: 'flight',
          },
        });
        this._renderedEntityIds.add(entityId);
      }

      entityIds.push(entityId);
    }

    // Remove entities for flights that are no longer in the data
    for (const oldId of this._renderedEntityIds) {
      if (!currentFlightIds.has(oldId)) {
        globe.removeEntity(oldId);
        this._renderedEntityIds.delete(oldId);
      }
    }

    // Update tracked entity IDs
    this._renderedEntityIds = currentFlightIds;

    // Set up click handler on the viewer (only once)
    if (!this._clickHandler && globe.getViewer && typeof globe.getViewer === 'function') {
      const viewer = globe.getViewer();
      if (viewer && viewer.scene) {
        // Create a new handler for picking
        const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

        handler.setInputAction((click) => {
          const pickedObject = viewer.scene.pick(click.position);
          if (Cesium.defined(pickedObject) && pickedObject.id) {
            const entity = pickedObject.id;
            const props = entity.properties;
            if (props && props.type) {
              const entityType = props.type.getValue ? props.type.getValue() : props.type;
              if (entityType === 'flight' && props.icao24) {
                const icao24 = props.icao24.getValue ? props.icao24.getValue() : props.icao24;
                const info = self.getInfo(icao24);
                if (info) {
                  // Dispatch custom event with flight info
                  const event = new CustomEvent('flightClick', { detail: info });
                  if (typeof document !== 'undefined') {
                    document.dispatchEvent(event);
                  }
                }
              }
            }
          }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

        // Store handler reference for cleanup
        this._clickHandler = handler;
      }
    }

    this._updating = false;
    return entityIds;
  }

  /**
   * Remove all rendered flight entities from the globe
   * @param {Object} globe - Globe instance with removeEntity method
   */
  removeAll(globe) {
    if (!globe || typeof globe.removeEntity !== 'function') {
      return;
    }

    // Remove all tracked entities
    for (const entityId of this._renderedEntityIds) {
      globe.removeEntity(entityId);
    }
    this._renderedEntityIds.clear();

    // Clean up click handler
    if (this._clickHandler) {
      this._clickHandler.destroy();
      this._clickHandler = null;
    }
  }
}

export { DEFAULT_OPENSKY_URL, DEFAULT_OPENSKY_PROXY_URL, OPENSKY_FIELDS };
