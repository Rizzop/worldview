/**
 * Location Search Module - Nominatim Geocoding Integration
 * Provides location search functionality with camera fly-to animation.
 */

import { fetchJSON } from '../utils/api.js';

// Nominatim API base URL
const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org/search';

// User-Agent header required by Nominatim usage policy
const USER_AGENT = 'WorldViewApp/1.0 (https://github.com/worldview)';

/**
 * Search class - Handles location geocoding and camera navigation
 */
export class Search {
  /**
   * Create a new Search instance
   * @param {Object} globe - Globe instance with flyTo method
   */
  constructor(globe) {
    this.globe = globe;
  }

  /**
   * Search for locations using Nominatim geocoding API
   * @param {string} query - Search query (location name, address, etc.)
   * @returns {Promise<Array<{name: string, lat: number, lon: number}>>} Array of results
   */
  async search(query) {
    if (!query || typeof query !== 'string' || query.trim() === '') {
      return [];
    }

    const encodedQuery = encodeURIComponent(query.trim());
    const url = `${NOMINATIM_BASE_URL}?q=${encodedQuery}&format=json&limit=10`;

    try {
      const data = await fetchJSON(url, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'application/json'
        },
        timeout: 10000,
        retries: 2
      });

      // Handle no results or failed request
      if (!data || !Array.isArray(data) || data.length === 0) {
        return [];
      }

      // Transform results to simplified format
      return data.map(item => ({
        name: item.display_name || 'Unknown location',
        lat: parseFloat(item.lat),
        lon: parseFloat(item.lon)
      }));

    } catch (error) {
      // Return empty array on error - graceful handling
      console.error('Search error:', error.message);
      return [];
    }
  }

  /**
   * Fly camera to a specific location
   * @param {number} lat - Latitude in degrees
   * @param {number} lon - Longitude in degrees
   * @param {number} [height=1000000] - Camera height in meters
   * @param {number} [duration=3] - Flight duration in seconds
   * @returns {Promise|undefined} Promise from globe.flyTo or undefined if no globe
   */
  flyTo(lat, lon, height = 1000000, duration = 3) {
    if (!this.globe || typeof this.globe.flyTo !== 'function') {
      console.error('No globe instance available for flyTo');
      return;
    }

    // Call globe's flyTo method with destination object
    return this.globe.flyTo({
      latitude: lat,
      longitude: lon,
      height: height
    }, duration);
  }

  /**
   * Search and fly to the first result
   * @param {string} query - Search query
   * @param {number} [height=1000000] - Camera height in meters
   * @param {number} [duration=3] - Flight duration in seconds
   * @returns {Promise<Object|null>} The result that was flown to, or null if not found
   */
  async searchAndFlyTo(query, height = 1000000, duration = 3) {
    const results = await this.search(query);

    if (results.length === 0) {
      return null;
    }

    const firstResult = results[0];
    this.flyTo(firstResult.lat, firstResult.lon, height, duration);

    return firstResult;
  }
}

export default Search;
