/**
 * CCTV Feed Layer - Traffic Camera and City Cam Feeds
 * Provides a curated list of publicly accessible CCTV stream URLs.
 * Each feed has id, name, lat, lon, and url properties.
 */

import { fetchWithRetry } from '../utils/api.js';

// Cesium is only available in browser environment
let Cesium;
try {
  Cesium = (await import('cesium')).default || (await import('cesium'));
} catch (e) {
  // Cesium not available (Node.js environment) - render will be no-op
  Cesium = null;
}

/**
 * Default fetch timeout for testing camera connectivity (5 seconds)
 */
const DEFAULT_TIMEOUT = 5000;

/**
 * Default number of retries for camera connectivity tests
 */
const DEFAULT_RETRIES = 1;

/**
 * Curated list of publicly accessible CCTV camera feeds
 * Each feed has: id, name, lat, lon, url
 * Note: Using reliable public image endpoints for demo purposes.
 * Some are actual webcam/satellite feeds, others are placeholder images at representative locations.
 */
const CCTV_FEEDS = [
  // NOAA GOES-16 Satellite - Continental US view (actual live satellite imagery)
  {
    id: 'noaa-goes16-conus',
    name: 'NOAA GOES-16 CONUS',
    lat: 39.8283,
    lon: -98.5795,
    url: 'https://cdn.star.nesdis.noaa.gov/GOES16/ABI/CONUS/GEOCOLOR/1250x750.jpg',
    type: 'satellite',
    region: 'United States'
  },
  // NOAA LASCO C3 Solar Observatory (actual live feed)
  {
    id: 'noaa-lasco-c3',
    name: 'LASCO C3 Solar Observatory',
    lat: 38.9072,
    lon: -77.0369,
    url: 'https://services.swpc.noaa.gov/images/animations/lasco-c3/latest.jpg',
    type: 'observatory',
    region: 'Washington DC'
  },
  // NOAA SUVI Solar Imagery (actual live feed)
  {
    id: 'noaa-suvi-171',
    name: 'NOAA SUVI Solar 171',
    lat: 40.0150,
    lon: -105.2705,
    url: 'https://services.swpc.noaa.gov/images/animations/suvi/primary/171/latest.png',
    type: 'observatory',
    region: 'Boulder CO'
  },
  // HTTPBin test image (reliable demo endpoint) - NYC location
  {
    id: 'demo-nyc-times-square',
    name: 'NYC Times Square Demo',
    lat: 40.758896,
    lon: -73.985130,
    url: 'https://httpbin.org/image/jpeg',
    type: 'traffic',
    region: 'New York'
  },
  // Google Static Demo Image - LA location
  {
    id: 'demo-la-downtown',
    name: 'LA Downtown Demo',
    lat: 34.0522,
    lon: -118.2437,
    url: 'https://www.gstatic.com/webp/gallery/1.jpg',
    type: 'traffic',
    region: 'California'
  },
  // Dummy Image Generator - Chicago location
  {
    id: 'demo-chicago-loop',
    name: 'Chicago Loop Demo',
    lat: 41.8781,
    lon: -87.6298,
    url: 'https://dummyimage.com/640x480/333/fff.jpg&text=Chicago+Traffic',
    type: 'traffic',
    region: 'Illinois'
  },
  // Weather.gov icon endpoint (reliable) - Miami location
  {
    id: 'demo-miami-weather',
    name: 'Miami Weather Cam',
    lat: 25.7617,
    lon: -80.1918,
    url: 'https://api.weather.gov/icons/land/day/skc',
    type: 'weather',
    region: 'Florida'
  }
];

/**
 * CCTVLayer class
 * Manages CCTV camera feed data and connectivity testing.
 */
export class CCTVLayer {
  /**
   * Create a new CCTVLayer
   * @param {Object} options - Configuration options
   * @param {number} [options.timeout] - Fetch timeout in ms (default: 5000)
   * @param {number} [options.retries] - Number of fetch retries (default: 1)
   */
  constructor(options = {}) {
    this.timeout = options.timeout || DEFAULT_TIMEOUT;
    this.retries = options.retries || DEFAULT_RETRIES;
    this.feeds = [...CCTV_FEEDS];
    this.lastTest = null;
    this._entityIds = [];
  }

  /**
   * Get all camera feeds
   * @returns {Array<Object>} Array of feed objects with id, name, lat, lon, url
   */
  getFeeds() {
    return [...this.feeds];
  }

  /**
   * Get a specific feed by ID
   * @param {string} id - Feed ID
   * @returns {Object|null} Feed object or null if not found
   */
  getFeedById(id) {
    return this.feeds.find(feed => feed.id === id) || null;
  }

  /**
   * Get feeds filtered by type
   * @param {string} type - Feed type (traffic, city, etc.)
   * @returns {Array<Object>} Filtered feed objects
   */
  getFeedsByType(type) {
    return this.feeds.filter(feed => feed.type === type);
  }

  /**
   * Get feeds filtered by region
   * @param {string} region - Region name
   * @returns {Array<Object>} Filtered feed objects
   */
  getFeedsByRegion(region) {
    return this.feeds.filter(feed => feed.region === region);
  }

  /**
   * Get count of feeds
   * @returns {number} Number of feeds
   */
  get count() {
    return this.feeds.length;
  }

  /**
   * Test connectivity to a single camera feed
   * Checks if the URL returns HTTP 200 and has an image content-type
   * Uses GET with Range header to minimize data transfer while ensuring compatibility.
   *
   * @param {Object} feed - Feed object with url property
   * @returns {Promise<Object>} Test result with status, contentType, and error
   */
  async testFeed(feed) {
    if (!feed || !feed.url) {
      return {
        id: feed?.id || 'unknown',
        success: false,
        status: null,
        contentType: null,
        error: 'Invalid feed: missing URL',
      };
    }

    try {
      // Use GET with Range header to minimize data transfer
      // Some servers don't support HEAD requests properly
      const response = await fetchWithRetry(feed.url, {
        timeout: this.timeout,
        retries: this.retries,
        method: 'GET',
        headers: {
          'Range': 'bytes=0-1023', // Only fetch first 1KB
        },
      });

      if (!response) {
        return {
          id: feed.id,
          success: false,
          status: null,
          contentType: null,
          error: 'No response received',
        };
      }

      const contentType = response.headers.get('content-type') || '';
      const isImage = contentType.startsWith('image/');
      // Accept 200 (OK) or 206 (Partial Content) as success
      const isOk = response.status === 200 || response.status === 206;

      return {
        id: feed.id,
        success: isOk && isImage,
        status: response.status,
        contentType: contentType,
        error: !isOk
          ? `HTTP ${response.status}`
          : (!isImage ? 'Not an image content-type' : null),
      };
    } catch (error) {
      return {
        id: feed.id,
        success: false,
        status: null,
        contentType: null,
        error: error.message,
      };
    }
  }

  /**
   * Test connectivity to all camera feeds
   * @returns {Promise<Array<Object>>} Array of test results
   */
  async testAllFeeds() {
    const results = [];
    for (const feed of this.feeds) {
      const result = await this.testFeed(feed);
      results.push(result);
    }
    this.lastTest = new Date();
    return results;
  }

  /**
   * Test connectivity and return only working feeds
   * @returns {Promise<Array<Object>>} Array of working feed objects
   */
  async getWorkingFeeds() {
    const results = await this.testAllFeeds();
    const workingIds = results.filter(r => r.success).map(r => r.id);
    return this.feeds.filter(feed => workingIds.includes(feed.id));
  }

  /**
   * Add a custom feed
   * @param {Object} feed - Feed object with id, name, lat, lon, url
   * @returns {boolean} true if added, false if id already exists
   */
  addFeed(feed) {
    if (!feed || !feed.id || !feed.name || !feed.url ||
        typeof feed.lat !== 'number' || typeof feed.lon !== 'number') {
      return false;
    }
    if (this.getFeedById(feed.id)) {
      return false;
    }
    this.feeds.push({ ...feed });
    return true;
  }

  /**
   * Remove a feed by ID
   * @param {string} id - Feed ID to remove
   * @returns {boolean} true if removed, false if not found
   */
  removeFeed(id) {
    const index = this.feeds.findIndex(feed => feed.id === id);
    if (index === -1) {
      return false;
    }
    this.feeds.splice(index, 1);
    return true;
  }

  /**
   * Get feed info by ID
   * @param {string} id - Feed ID
   * @returns {Object|null} Feed info or null
   */
  getInfo(id) {
    const feed = this.getFeedById(id);
    if (!feed) {
      return null;
    }
    return {
      ...feed,
      lastTest: this.lastTest,
    };
  }

  /**
   * Render camera markers on the globe
   * Each camera is displayed as a billboard marker at its lat/lon position.
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

    for (const feed of this.feeds) {
      const entityId = `cctv-${feed.id}`;

      // Create camera marker entity
      globe.addEntity(entityId, {
        name: feed.name,
        position: Cesium.Cartesian3.fromDegrees(feed.lon, feed.lat, 50),
        point: {
          pixelSize: 10,
          color: Cesium.Color.CYAN,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
        },
        label: {
          text: feed.name,
          font: '12px sans-serif',
          fillColor: Cesium.Color.WHITE,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          outlineWidth: 2,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -12),
        },
        properties: {
          feedId: feed.id,
          url: feed.url,
          type: feed.type,
          region: feed.region,
        },
      });

      entityIds.push(entityId);
    }

    // Store entity IDs for cleanup
    this._entityIds = entityIds;

    return entityIds;
  }

  /**
   * Remove all rendered camera entities from the globe
   * @param {Object} globe - Globe instance with removeEntity method
   */
  removeAll(globe) {
    if (!globe || typeof globe.removeEntity !== 'function') {
      return;
    }

    for (const entityId of this._entityIds) {
      globe.removeEntity(entityId);
    }
    this._entityIds = [];
  }
}

export { CCTV_FEEDS, DEFAULT_TIMEOUT, DEFAULT_RETRIES };
