/**
 * Satellite Data Layer - Fetch and Parse TLE
 * Fetches TLE data from CelesTrak and parses into satellite objects with computed positions.
 * Data-only layer - no rendering.
 */

import { fetchWithRetry } from '../utils/api.js';
import { propagateTLE } from '../utils/sgp4.js';

/**
 * Default TLE source URL for active satellites
 */
const DEFAULT_TLE_URL = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle';

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
}

export { DEFAULT_TLE_URL };
