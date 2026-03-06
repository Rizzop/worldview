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
 * Proxy URL for CORS-blocked requests
 */
const PROXY_URL = 'http://localhost:8091';

/**
 * Maximum number of satellite entities for performance (capped at 200 per task spec)
 */
const MAX_SATELLITE_ENTITIES = 200;

/**
 * Number of orbit path sample points (90 points around one orbit)
 */
const ORBIT_SAMPLE_POINTS = 90;

/**
 * Priority satellite patterns for filtering
 * Order: ISS, GPS, Starlink sample, military reconnaissance
 */
const PRIORITY_PATTERNS = [
  { pattern: /^ISS\s*\(ZARYA\)/i, priority: 1, limit: 1 },
  { pattern: /^ISS\b/i, priority: 2, limit: 5 },
  { pattern: /^GPS\b/i, priority: 3, limit: 30 },
  { pattern: /^NAVSTAR/i, priority: 4, limit: 10 },
  { pattern: /^STARLINK/i, priority: 5, limit: 50 },
  { pattern: /USA[-\s]?\d+/i, priority: 6, limit: 30 },  // Military/reconnaissance
  { pattern: /^NROL/i, priority: 7, limit: 10 },
  { pattern: /^LACROSSE/i, priority: 8, limit: 5 },
  { pattern: /^KEYHOLE/i, priority: 9, limit: 5 },
  { pattern: /^COSMOS/i, priority: 10, limit: 20 },
  { pattern: /^GLONASS/i, priority: 11, limit: 20 },
];

/**
 * Cinematic satellite visualization settings
 * Small cyan dots with thin subtle orbit lines
 */
const CINEMATIC_SETTINGS = {
  // Orbit line: very thin, low opacity cyan
  orbitLineWidth: 1,
  orbitLineOpacity: 0.2,
  orbitLineColor: 'CYAN',
  // Satellite point: small cyan dot (pixelSize: 2 per task spec)
  satellitePixelSize: 2,
  satelliteColor: 'CYAN',
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
   * Fetch TLE data from the configured URL, with CORS proxy fallback
   * @returns {Promise<string|null>} Raw TLE text data or null on failure
   */
  async fetchData() {
    // Try direct fetch first
    try {
      const response = await fetchWithRetry(this.url, {
        timeout: this.timeout,
        retries: 1, // Only 1 retry for direct fetch before proxy fallback
      });

      if (response && response.ok) {
        const text = await response.text();
        this.lastFetch = new Date();
        console.log('[SatelliteLayer] TLE data fetched directly from CelesTrak');
        return text;
      }
    } catch (error) {
      console.log('[SatelliteLayer] Direct fetch failed, trying proxy...', error.message);
    }

    // Fallback to CORS proxy at localhost:8091
    try {
      // Route through proxy - use /NORAD/ path which proxy will forward to CelesTrak
      const proxyUrl = `${PROXY_URL}/NORAD/elements/gp.php?GROUP=active&FORMAT=tle`;
      const response = await fetchWithRetry(proxyUrl, {
        timeout: this.timeout,
        retries: this.retries,
      });

      if (!response || !response.ok) {
        console.error('[SatelliteLayer] Proxy fetch failed with status:', response?.status);
        return null;
      }

      const text = await response.text();
      this.lastFetch = new Date();
      console.log('[SatelliteLayer] TLE data fetched via CORS proxy');
      return text;
    } catch (error) {
      console.error('[SatelliteLayer] All fetch attempts failed:', error.message);
      return null;
    }
  }

  /**
   * Filter and prioritize satellites based on PRIORITY_PATTERNS
   * Caps total at MAX_SATELLITE_ENTITIES (200), prioritizing ISS, GPS, Starlink, military
   * @param {Array<Object>} satellites - All parsed satellites
   * @returns {Array<Object>} Filtered and prioritized satellites
   * @private
   */
  _filterByPriority(satellites) {
    const selected = [];
    const usedNoradIds = new Set();

    // Process each priority pattern in order
    for (const { pattern, limit } of PRIORITY_PATTERNS) {
      const matches = satellites.filter(sat =>
        pattern.test(sat.name) && !usedNoradIds.has(sat.noradId)
      );

      // Take up to limit satellites matching this pattern
      const toAdd = matches.slice(0, limit);
      for (const sat of toAdd) {
        if (selected.length >= MAX_SATELLITE_ENTITIES) break;
        selected.push(sat);
        usedNoradIds.add(sat.noradId);
      }

      if (selected.length >= MAX_SATELLITE_ENTITIES) break;
    }

    // Fill remaining slots with other satellites (first come, first serve)
    if (selected.length < MAX_SATELLITE_ENTITIES) {
      for (const sat of satellites) {
        if (selected.length >= MAX_SATELLITE_ENTITIES) break;
        if (!usedNoradIds.has(sat.noradId)) {
          selected.push(sat);
          usedNoradIds.add(sat.noradId);
        }
      }
    }

    console.log(`[SatelliteLayer] Filtered to ${selected.length} priority satellites`);
    return selected;
  }

  /**
   * Parse TLE response text into satellite objects with computed positions
   * TLE format: 3 lines per satellite - name, line1, line2
   * Applies priority filtering to cap at 200 satellites
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
    const allSatellites = [];

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

      allSatellites.push({
        name,
        noradId,
        line1,
        line2,
        position,
      });
    }

    console.log(`[SatelliteLayer] Parsed ${allSatellites.length} satellites from TLE data`);

    // Apply priority filtering to cap at 200 satellites
    this.satellites = this._filterByPriority(allSatellites);
    return this.satellites;
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
   * Samples 90 points around one full orbit period
   * @param {Object} sat - Satellite object with TLE data
   * @returns {Array<Object>} Array of positions { lat, lon, alt }
   * @private
   */
  _propagateOrbitPath(sat) {
    const positions = [];
    const now = new Date();

    // Extract mean motion from TLE line 2 (revolutions per day)
    // Columns 53-63: Mean Motion
    const meanMotion = parseFloat(sat.line2.substring(52, 63).trim());

    // Calculate orbital period in minutes (1440 minutes/day divided by revs/day)
    // Default to 90 minutes if extraction fails (typical LEO orbit)
    const orbitalPeriodMinutes = meanMotion > 0 ? (1440 / meanMotion) : 90;

    // Sample 90 points around one orbit
    const intervalMinutes = orbitalPeriodMinutes / ORBIT_SAMPLE_POINTS;

    for (let i = 0; i < ORBIT_SAMPLE_POINTS; i++) {
      const minutesAhead = i * intervalMinutes;
      const futureTime = new Date(now.getTime() + minutesAhead * 60 * 1000);
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
   * Render satellites on the globe with markers and orbit paths
   * Uses cinematic styling: small cyan dots (pixelSize: 2), thin subtle orbit lines
   * @param {Object} globe - Globe instance with addEntity method or Cesium viewer
   * @returns {Array<string>} Array of created entity IDs
   */
  render(globe) {
    // Guard against missing Cesium (Node.js environment)
    if (!Cesium) {
      console.warn('[SatelliteLayer] Cesium not available, skipping render');
      return [];
    }

    // Support both globe wrapper objects and direct Cesium viewers
    const viewer = globe?.getViewer ? globe.getViewer() : globe?.viewer || globe;
    const hasAddEntity = globe && typeof globe.addEntity === 'function';
    const hasEntities = viewer && viewer.entities && typeof viewer.entities.add === 'function';

    if (!hasAddEntity && !hasEntities) {
      console.warn('[SatelliteLayer] No valid render target (need addEntity or entities.add)');
      return [];
    }

    const entityIds = [];
    const self = this;

    // Filter satellites with valid positions (already capped at 200 by priority filter)
    const satellitesToRender = this.satellites
      .filter(sat => sat.position && sat.position.lat != null && sat.position.lon != null);

    console.log(`[SatelliteLayer] Rendering ${satellitesToRender.length} satellites`);

    for (const sat of satellitesToRender) {
      const satEntityId = `satellite-${sat.noradId}`;
      const orbitEntityId = `orbit-${sat.noradId}`;

      // Calculate position in Cesium coordinates
      const satPosition = Cesium.Cartesian3.fromDegrees(
        sat.position.lon,
        sat.position.lat,
        (sat.position.alt || 0) * 1000 // Convert km to meters
      );

      // Build satellite entity definition: small cyan dot (pixelSize: 2)
      const satelliteEntityDef = {
        id: satEntityId,
        name: sat.name,
        position: satPosition,
        point: {
          pixelSize: CINEMATIC_SETTINGS.satellitePixelSize, // 2
          color: Cesium.Color.CYAN,
          outlineColor: Cesium.Color.TRANSPARENT,
          outlineWidth: 0,
        },
        // Minimal label at close zoom
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
          altitude: sat.position.alt,
          type: 'satellite',
        },
      };

      // Add entity using available method
      if (hasAddEntity) {
        globe.addEntity(satEntityId, satelliteEntityDef);
      } else if (hasEntities) {
        viewer.entities.add(satelliteEntityDef);
      }
      entityIds.push(satEntityId);

      // Propagate orbit path (90 sample points around one orbit)
      const orbitPositions = this._propagateOrbitPath(sat);

      if (orbitPositions.length >= 2) {
        // Convert positions to Cartesian3 array for polyline
        const cartesianPositions = orbitPositions.map(pos =>
          Cesium.Cartesian3.fromDegrees(
            pos.lon,
            pos.lat,
            (pos.alt || 0) * 1000 // Convert km to meters
          )
        );

        // Cinematic orbit path: thin cyan line (width: 1, opacity: 0.2)
        const orbitEntityDef = {
          id: orbitEntityId,
          name: `${sat.name} Orbit`,
          polyline: {
            positions: cartesianPositions,
            width: CINEMATIC_SETTINGS.orbitLineWidth, // 1
            material: Cesium.Color.CYAN.withAlpha(CINEMATIC_SETTINGS.orbitLineOpacity), // 0.2
          },
          properties: {
            noradId: sat.noradId,
            type: 'orbit',
          },
        };

        if (hasAddEntity) {
          globe.addEntity(orbitEntityId, orbitEntityDef);
        } else if (hasEntities) {
          viewer.entities.add(orbitEntityDef);
        }
        entityIds.push(orbitEntityId);
      }
    }

    // Set up click handler on the viewer for satellite selection
    if (viewer && viewer.scene) {
      const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

      handler.setInputAction((click) => {
        const pickedObject = viewer.scene.pick(click.position);
        if (Cesium.defined(pickedObject) && pickedObject.id) {
          const entity = pickedObject.id;
          const props = entity.properties;

          // Check if this is a satellite entity
          if (props && props.type && props.type.getValue() === 'satellite') {
            const noradId = props.noradId ? props.noradId.getValue() : null;
            const name = props.name ? props.name.getValue() : entity.name;
            const altitude = props.altitude ? props.altitude.getValue() : null;

            // Dispatch custom event with satellite info (name, NORAD ID, altitude)
            const eventDetail = {
              name: name,
              noradId: noradId,
              altitude: altitude,
            };

            console.log('[SatelliteLayer] Satellite clicked:', eventDetail);

            const event = new CustomEvent('satelliteClick', { detail: eventDetail });
            if (typeof document !== 'undefined') {
              document.dispatchEvent(event);
            }
            if (typeof window !== 'undefined') {
              window.dispatchEvent(event);
            }
          }
        }
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

      // Store handler reference for cleanup
      this._clickHandler = handler;
    }

    console.log(`[SatelliteLayer] Rendered ${entityIds.length} entities (satellites + orbits)`);
    return entityIds;
  }

  /**
   * Remove all rendered satellite entities from the globe
   * @param {Object} globe - Globe instance with removeEntity method or Cesium viewer
   */
  removeAll(globe) {
    const hasRemoveEntity = globe && typeof globe.removeEntity === 'function';
    const viewer = globe?.getViewer ? globe.getViewer() : globe?.viewer || globe;
    const hasEntities = viewer && viewer.entities && typeof viewer.entities.removeById === 'function';

    if (!hasRemoveEntity && !hasEntities) {
      return;
    }

    for (const sat of this.satellites) {
      const satId = `satellite-${sat.noradId}`;
      const orbitId = `orbit-${sat.noradId}`;

      if (hasRemoveEntity) {
        globe.removeEntity(satId);
        globe.removeEntity(orbitId);
      } else if (hasEntities) {
        viewer.entities.removeById(satId);
        viewer.entities.removeById(orbitId);
      }
    }

    // Clean up click handler
    if (this._clickHandler) {
      this._clickHandler.destroy();
      this._clickHandler = null;
    }
  }
}

export { DEFAULT_TLE_URL };
