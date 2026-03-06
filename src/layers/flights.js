/**
 * Flight Data Layer - OpenSky Network
 * Fetches live aircraft positions from OpenSky Network API and parses into flight objects.
 * Renders aircraft on a Cesium globe with color-coded markers based on military/civilian status.
 */

import { fetchWithRetry } from '../utils/api.js';
import { isMilitary } from './military.js';

// Cesium is only available in browser environment
let Cesium;
try {
  Cesium = (await import('cesium')).default || (await import('cesium'));
} catch (e) {
  // Cesium not available (Node.js environment) - render will be no-op
  Cesium = null;
}

/**
 * OpenSky Network API endpoint for all aircraft states
 */
const DEFAULT_OPENSKY_URL = 'https://opensky-network.org/api/states/all';

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
      const credentials = Buffer.from(`${this.username}:${this.password}`).toString('base64');
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
   * Calculate marker size based on altitude
   * Low altitude = smaller marker, high altitude = larger marker
   * @param {number|null} altitude - Altitude in meters
   * @returns {number} Pixel size for marker (8-16)
   * @private
   */
  _getMarkerSizeByAltitude(altitude) {
    if (altitude == null || altitude <= 0) {
      return 8; // Ground or unknown altitude - minimum size
    }

    // Typical cruising altitude is ~10,000-12,000m
    // Scale from 8px (ground) to 16px (high altitude)
    const maxAltitude = 15000; // meters
    const minSize = 8;
    const maxSize = 16;

    const normalizedAlt = Math.min(altitude, maxAltitude) / maxAltitude;
    return Math.round(minSize + normalizedAlt * (maxSize - minSize));
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
   * Render flights on the globe with markers and labels
   * Military aircraft are colored red, civilian aircraft are colored blue.
   * Marker size varies by altitude (larger = higher).
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

    for (const flight of this.flights) {
      // Skip flights without valid positions
      if (flight.lat == null || flight.lon == null) {
        continue;
      }

      // Skip flights on ground (optional, but cleaner visualization)
      // Actually, let's keep them but with smaller markers

      const entityId = `flight-${flight.icao24}`;

      // Determine if this is a military aircraft
      const military = isMilitary(flight);

      // Color: military = red, civilian = blue
      const markerColor = military ? Cesium.Color.RED : Cesium.Color.BLUE;

      // Marker size based on altitude
      const pixelSize = this._getMarkerSizeByAltitude(flight.altitude);

      // Altitude for display (convert to feet for label)
      const altFeet = flight.altitude != null ? Math.round(flight.altitude * 3.281) : 0;

      // Callsign for label (fallback to ICAO24 if no callsign)
      const labelText = flight.callsign || flight.icao24 || 'Unknown';

      // Create flight marker entity with label
      globe.addEntity(entityId, {
        name: labelText,
        position: Cesium.Cartesian3.fromDegrees(
          flight.lon,
          flight.lat,
          (flight.altitude || 0) // Altitude already in meters
        ),
        point: {
          pixelSize: pixelSize,
          color: markerColor,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 1,
        },
        label: {
          text: labelText,
          font: '11px sans-serif',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -10),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 5000000),
        },
        properties: {
          icao24: flight.icao24,
          callsign: flight.callsign,
          isMilitary: military,
          altitude: flight.altitude,
          type: 'flight',
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
            if (props && props.icao24) {
              const icao24 = props.icao24.getValue();
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
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

        // Store handler reference for cleanup
        this._clickHandler = handler;
      }
    }

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

    for (const flight of this.flights) {
      globe.removeEntity(`flight-${flight.icao24}`);
    }

    // Clean up click handler
    if (this._clickHandler) {
      this._clickHandler.destroy();
      this._clickHandler = null;
    }
  }
}

export { DEFAULT_OPENSKY_URL, OPENSKY_FIELDS };
