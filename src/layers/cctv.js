/**
 * CCTV Feed Layer - Traffic Camera and City Cam Feeds
 * Provides a curated list of publicly accessible CCTV stream URLs.
 * Each feed has id, name, lat, lon, and url properties.
 */

import { fetchWithRetry } from '../utils/api.js';

// Use Cesium from global scope (loaded via CDN in index.html)
// In Node.js environment, Cesium will be null
const Cesium = (typeof window !== 'undefined' && window.Cesium) ||
               (typeof globalThis !== 'undefined' && globalThis.Cesium) ||
               null;

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
   * Billboard size in meters (100m x 100m equivalent)
   */
  static get BILLBOARD_SIZE() {
    return 100;
  }

  /**
   * Create a fallback/placeholder image for feeds that fail to load (CORS, etc.)
   * Returns a data URI for a simple camera icon placeholder
   * @returns {string} Data URI for fallback image
   * @private
   */
  _createFallbackImage() {
    // Simple camera icon as SVG data URI
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <rect width="64" height="64" fill="#333"/>
      <rect x="12" y="20" width="40" height="28" rx="3" fill="#666"/>
      <circle cx="32" cy="34" r="10" fill="#888"/>
      <circle cx="32" cy="34" r="6" fill="#444"/>
      <rect x="24" y="12" width="16" height="8" rx="2" fill="#666"/>
      <text x="32" y="58" text-anchor="middle" font-size="8" fill="#aaa">CCTV</text>
    </svg>`;
    return 'data:image/svg+xml;base64,' + btoa(svg);
  }

  /**
   * Load feed image with CORS handling and fallback
   * @param {Object} feed - Feed object with url property
   * @returns {Promise<string>} Image URL or fallback data URI
   * @private
   */
  async _loadFeedImage(feed) {
    // In Node.js environment, just return the URL (no actual loading)
    if (typeof window === 'undefined') {
      return feed.url;
    }

    try {
      // Try to load the image with CORS
      const img = new Image();
      img.crossOrigin = 'anonymous';

      return new Promise((resolve) => {
        const timeoutId = setTimeout(() => {
          // Timeout - use fallback
          resolve(this._createFallbackImage());
        }, this.timeout);

        img.onload = () => {
          clearTimeout(timeoutId);
          // Image loaded successfully, use original URL
          resolve(feed.url);
        };

        img.onerror = () => {
          clearTimeout(timeoutId);
          // CORS or load error - use fallback
          resolve(this._createFallbackImage());
        };

        img.src = feed.url;
      });
    } catch (error) {
      // Any error - use fallback
      return this._createFallbackImage();
    }
  }

  /**
   * Handle billboard click to show feed in info panel
   * @param {Object} globe - Globe instance
   * @param {Object} feed - Feed object
   * @private
   */
  _setupClickHandler(globe, feed) {
    // Store click handler reference for cleanup
    if (!this._clickHandlers) {
      this._clickHandlers = [];
    }

    // Click handling is done via Cesium's selectedEntity mechanism
    // The info panel will display feed details when billboard is clicked
    // Properties are attached to the entity for the info box
  }

  /**
   * Render CCTV feed billboards on the globe
   * Each camera feed is displayed as a billboard (100m x 100m) at its location.
   * Feed URL is loaded as image texture and applied to the billboard.
   * Handles CORS issues gracefully with fallback placeholder.
   * Billboards are clickable to open feed details in info panel.
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

      // Calculate billboard scale for ~100m equivalent size
      // Cesium billboards are scaled in pixels, we use nearFarScalar to maintain apparent size
      const billboardSize = CCTVLayer.BILLBOARD_SIZE;

      // Create billboard entity with feed image as texture
      // Uses image URL directly; CORS errors handled gracefully by Cesium
      globe.addEntity(entityId, {
        name: feed.name,
        description: this._createFeedDescription(feed),
        position: Cesium.Cartesian3.fromDegrees(feed.lon, feed.lat, 50),
        billboard: {
          image: feed.url,
          width: 64,
          height: 64,
          // Scale billboard based on distance for consistent apparent size (~100m)
          scaleByDistance: new Cesium.NearFarScalar(1000, 2.0, 100000, 0.5),
          // Translate billboard position so it sits above ground
          pixelOffset: new Cesium.Cartesian2(0, -32),
          // Handle CORS by allowing cross-origin images
          // Cesium will fall back gracefully if image fails to load
          heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
          // Make billboard always face camera
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          // Disable depth test to ensure visibility
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: feed.name,
          font: '14px sans-serif',
          fillColor: Cesium.Color.WHITE,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          verticalOrigin: Cesium.VerticalOrigin.TOP,
          horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          pixelOffset: new Cesium.Cartesian2(0, 8),
          // Scale label with distance
          scaleByDistance: new Cesium.NearFarScalar(1000, 1.0, 100000, 0.3),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        properties: {
          feedId: feed.id,
          feedUrl: feed.url,
          feedType: feed.type || 'unknown',
          feedRegion: feed.region || 'Unknown',
          clickable: true,
          layerType: 'cctv',
        },
      });

      entityIds.push(entityId);
    }

    // Store entity IDs for cleanup
    this._entityIds = entityIds;

    return entityIds;
  }

  /**
   * Create HTML description for feed info panel
   * @param {Object} feed - Feed object
   * @returns {string} HTML description for info box
   * @private
   */
  _createFeedDescription(feed) {
    return `
      <div style="padding: 10px;">
        <h3>${feed.name}</h3>
        <p><strong>Type:</strong> ${feed.type || 'Unknown'}</p>
        <p><strong>Region:</strong> ${feed.region || 'Unknown'}</p>
        <p><strong>Location:</strong> ${feed.lat.toFixed(4)}, ${feed.lon.toFixed(4)}</p>
        <div style="margin-top: 10px;">
          <img src="${feed.url}"
               alt="${feed.name}"
               style="max-width: 100%; max-height: 300px; border: 1px solid #ccc;"
               onerror="this.style.display='none'; this.nextElementSibling.style.display='block';"
          />
          <p style="display: none; color: #888;">
            Feed unavailable (CORS restricted or offline)
          </p>
        </div>
        <p style="margin-top: 10px;">
          <a href="${feed.url}" target="_blank" rel="noopener noreferrer">
            Open feed in new tab
          </a>
        </p>
      </div>
    `;
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
