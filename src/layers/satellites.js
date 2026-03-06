/**
 * Satellite Data Layer - Fetch, Parse, and Render TLE
 * Fetches TLE data from CelesTrak and parses into satellite objects with computed positions.
 * Renders satellites on a Cesium globe with orbit paths and click handlers.
 */

import { fetchWithRetry } from '../utils/api.js';
import { propagateTLE } from '../utils/sgp4.js';

// Use Cesium from global scope (loaded via CDN in index.html)
// In Node.js environment, Cesium will be null
const Cesium = (typeof window !== 'undefined' && window.Cesium) ||
               (typeof globalThis !== 'undefined' && globalThis.Cesium) ||
               null;

/**
 * Default TLE source URL for active satellites
 */
const DEFAULT_TLE_URL = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle';

/**
 * Maximum number of satellite entities for performance
 */
const MAX_SATELLITE_ENTITIES = 500;

/**
 * Cinematic satellite visualization settings
 * Thin subtle orbit lines with tiny bright dots at current position
 */
const CINEMATIC_SETTINGS = {
  // Orbit line: very thin, low opacity cyan/white
  orbitLineWidth: 1,
  orbitLineOpacity: 0.2,
  orbitLineColor: 'CYAN',
  // Satellite point: tiny bright dot
  satellitePixelSize: 4,
  satelliteColor: 'WHITE',
};

/**
 * SatelliteLayer class
 * Manages satellite data fetching, parsing, and position computation.
 */
export class SatelliteLayer {
  /**
   * Create a new SatelliteLayer
   * @param {Object} options - Configuration options
   * @param {string} [options.url] - TLE data source URL (default: CelesTrak active satellites)
   * @param {number} [options.timeout] - Fetch timeout in ms (default: 30000)
   * @param {number} [options.retries] - Number of fetch retries (default: 3)
   */
  constructor(options = {}) {
    this.url = options.url || DEFAULT_TLE_URL;
    this.timeout = options.timeout || 30000;
    this.retries = options.retries || 3;
    this.satellites = [];
    this.lastFetch = null;
  }

  /**
   * Fetch TLE data from the configured URL
   * @returns {Promise<string|null>} Raw TLE text data or null on failure
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

      const text = await response.text();
      this.lastFetch = new Date();
      return text;
    } catch (error) {
      return null;
    }
  }

  /**
   * Parse TLE response text into satellite objects with computed positions
   * TLE format: 3 lines per satellite - name, line1, line2
   *
   * @param {string} tleText - Raw TLE text data
   * @param {Date} [date] - Date for position computation (default: now)
   * @returns {Array<Object>} Array of satellite objects with:
   *   - name: Satellite name
   *   - noradId: NORAD catalog number
   *   - line1: TLE line 1
   *   - line2: TLE line 2
   *   - position: { lat, lon, alt } or null if propagation failed
   */
  parseResponse(tleText, date = new Date()) {
    if (!tleText || typeof tleText !== 'string') {
      return [];
    }

    const lines = tleText.trim().split('\n').map(line => line.trim());
    const satellites = [];

    // TLE data comes in 3-line format: name, line1, line2
    for (let i = 0; i + 2 < lines.length; i += 3) {
      const name = lines[i];
      const line1 = lines[i + 1];
      const line2 = lines[i + 2];

      // Validate TLE lines start with correct identifiers
      if (!line1.startsWith('1 ') || !line2.startsWith('2 ')) {
        continue;
      }

      // Extract NORAD catalog ID from line 1 (columns 3-7)
      const noradId = parseInt(line1.substring(2, 7).trim(), 10);

      // Compute current position using SGP4
      let position = null;
      try {
        position = propagateTLE(line1, line2, date);
      } catch (error) {
        // Propagation failed - position remains null
      }

      satellites.push({
        name,
        noradId,
        line1,
        line2,
        position,
      });
    }

    this.satellites = satellites;
    return satellites;
  }

  /**
   * Fetch and parse TLE data in one step
   * @param {Date} [date] - Date for position computation (default: now)
   * @returns {Promise<Array<Object>>} Array of satellite objects
   */
  async fetchAndParse(date = new Date()) {
    const tleText = await this.fetchData();
    if (!tleText) {
      return [];
    }
    return this.parseResponse(tleText, date);
  }

  /**
   * Update positions of all loaded satellites to a new time
   * @param {Date} date - New date for position computation
   * @returns {Array<Object>} Updated satellite array
   */
  updatePositions(date) {
    for (const sat of this.satellites) {
      try {
        sat.position = propagateTLE(sat.line1, sat.line2, date);
      } catch (error) {
        sat.position = null;
      }
    }
    return this.satellites;
  }

  /**
   * Get satellite by NORAD ID
   * @param {number} noradId - NORAD catalog number
   * @returns {Object|null} Satellite object or null if not found
   */
  getSatelliteById(noradId) {
    return this.satellites.find(sat => sat.noradId === noradId) || null;
  }

  /**
   * Get satellite by name (case-insensitive partial match)
   * @param {string} name - Satellite name or partial name
   * @returns {Array<Object>} Matching satellites
   */
  getSatellitesByName(name) {
    const lowerName = name.toLowerCase();
    return this.satellites.filter(sat =>
      sat.name.toLowerCase().includes(lowerName)
    );
  }

  /**
   * Get count of loaded satellites
   * @returns {number} Number of satellites
   */
  get count() {
    return this.satellites.length;
  }

  /**
   * Get satellite info by NORAD ID
   * @param {number} satelliteId - NORAD catalog number
   * @returns {Object|null} Satellite data object with name, noradId, position, TLE data
   */
  getInfo(satelliteId) {
    const sat = this.getSatelliteById(satelliteId);
    if (!sat) {
      return null;
    }

    return {
      name: sat.name,
      noradId: sat.noradId,
      position: sat.position,
      line1: sat.line1,
      line2: sat.line2,
      lastFetch: this.lastFetch,
    };
  }

  /**
   * Propagate orbit path positions for a satellite
   * @param {Object} sat - Satellite object with TLE data
   * @param {number} minutes - Number of minutes to propagate forward
   * @param {number} intervalMinutes - Interval between points in minutes
   * @returns {Array<Object>} Array of positions { lat, lon, alt }
   * @private
   */
  _propagateOrbitPath(sat, minutes = 90, intervalMinutes = 2) {
    const positions = [];
    const now = new Date();

    for (let m = 0; m <= minutes; m += intervalMinutes) {
      const futureTime = new Date(now.getTime() + m * 60 * 1000);
      try {
        const pos = propagateTLE(sat.line1, sat.line2, futureTime);
        if (pos) {
          positions.push(pos);
        }
      } catch (e) {
        // Skip this point if propagation fails
      }
    }

    return positions;
  }

  /**
   * Render satellites on the globe with markers, labels, and orbit paths
   * Uses cinematic styling: thin subtle orbit lines, tiny bright dots
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

    // Limit satellites for performance
    const satellitesToRender = this.satellites
      .filter(sat => sat.position && sat.position.lat != null && sat.position.lon != null)
      .slice(0, MAX_SATELLITE_ENTITIES);

    for (const sat of satellitesToRender) {
      const satEntityId = `satellite-${sat.noradId}`;
      const orbitEntityId = `orbit-${sat.noradId}`;

      // Cinematic satellite marker: tiny bright white dot
      globe.addEntity(satEntityId, {
        name: sat.name,
        position: Cesium.Cartesian3.fromDegrees(
          sat.position.lon,
          sat.position.lat,
          (sat.position.alt || 0) * 1000 // Convert km to meters
        ),
        point: {
          pixelSize: CINEMATIC_SETTINGS.satellitePixelSize,
          color: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.TRANSPARENT,
          outlineWidth: 0,
        },
        // Minimal labels only at close zoom
        label: {
          text: sat.name,
          font: '9px monospace',
          fillColor: Cesium.Color.CYAN.withAlpha(0.7),
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 1,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -6),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 5000000),
        },
        properties: {
          noradId: sat.noradId,
          name: sat.name,
          type: 'satellite',
        },
      });

      entityIds.push(satEntityId);

      // Propagate orbit path (90 minutes forward)
      const orbitPositions = this._propagateOrbitPath(sat, 90, 2);

      if (orbitPositions.length >= 2) {
        // Convert positions to Cartesian3 array for polyline
        const cartesianPositions = orbitPositions.map(pos =>
          Cesium.Cartesian3.fromDegrees(
            pos.lon,
            pos.lat,
            (pos.alt || 0) * 1000 // Convert km to meters
          )
        );

        // Cinematic orbit path: thin, low opacity cyan line
        globe.addEntity(orbitEntityId, {
          name: `${sat.name} Orbit`,
          polyline: {
            positions: cartesianPositions,
            width: CINEMATIC_SETTINGS.orbitLineWidth,
            material: Cesium.Color.CYAN.withAlpha(CINEMATIC_SETTINGS.orbitLineOpacity),
          },
          properties: {
            noradId: sat.noradId,
            type: 'orbit',
          },
        });

        entityIds.push(orbitEntityId);
      }
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
            if (props && props.noradId) {
              const noradId = props.noradId.getValue();
              const info = self.getInfo(noradId);
              if (info) {
                // Dispatch custom event with satellite info
                const event = new CustomEvent('satelliteClick', { detail: info });
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
   * Remove all rendered satellite entities from the globe
   * @param {Object} globe - Globe instance with removeEntity method
   */
  removeAll(globe) {
    if (!globe || typeof globe.removeEntity !== 'function') {
      return;
    }

    for (const sat of this.satellites) {
      globe.removeEntity(`satellite-${sat.noradId}`);
      globe.removeEntity(`orbit-${sat.noradId}`);
    }

    // Clean up click handler
    if (this._clickHandler) {
      this._clickHandler.destroy();
      this._clickHandler = null;
    }
  }
}

export { DEFAULT_TLE_URL };
