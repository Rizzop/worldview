/**
 * Entity Info Panel - Displays detailed information for clicked entities
 * Supports satellite, flight, earthquake, and CCTV entity types.
 * Shows all available data fields with a close button.
 */

import { parseGdeltDate, formatTimeAgo } from './news-feed.js';

/**
 * Entity type identifiers
 */
const ENTITY_TYPES = {
  SATELLITE: 'satellite',
  FLIGHT: 'flight',
  EARTHQUAKE: 'earthquake',
  CCTV: 'cctv',
  NEWS: 'news',
};

/**
 * InfoPanel class - Displays entity information in a panel overlay
 */
export class InfoPanel {
  /**
   * Create a new InfoPanel instance
   * @param {Object} options - Configuration options
   * @param {string|HTMLElement} [options.container] - Container element or ID for the panel
   */
  constructor(options = {}) {
    this.container = null;
    this.panel = null;
    this._currentEntity = null;
    this._domAvailable = this._checkDOMAvailable();

    // If container provided and DOM available, initialize immediately
    if (options.container && this._domAvailable) {
      this._initContainer(options.container);
    }
  }

  /**
   * Check if DOM is available (browser environment)
   * @private
   * @returns {boolean}
   */
  _checkDOMAvailable() {
    return typeof document !== 'undefined' && typeof document.createElement === 'function';
  }

  /**
   * Initialize the container element
   * @private
   * @param {string|HTMLElement} container - Container element or ID
   */
  _initContainer(container) {
    if (typeof container === 'string') {
      this.container = document.getElementById(container);
    } else {
      this.container = container;
    }
  }

  /**
   * Detect entity type from entity data
   * @private
   * @param {Object} entity - Entity data object
   * @returns {string|null} Entity type or null if unknown
   */
  _detectEntityType(entity) {
    if (!entity) return null;

    // Check for explicit type property
    if (entity.type) {
      const type = entity.type.toLowerCase();
      if (type === 'satellite' || type === 'orbit') return ENTITY_TYPES.SATELLITE;
      if (type === 'flight') return ENTITY_TYPES.FLIGHT;
      if (type === 'earthquake') return ENTITY_TYPES.EARTHQUAKE;
      if (type === 'cctv') return ENTITY_TYPES.CCTV;
      if (type === 'news') return ENTITY_TYPES.NEWS;
    }

    // Detect by unique properties
    if (entity.noradId !== undefined) return ENTITY_TYPES.SATELLITE;
    if (entity.icao24 !== undefined) return ENTITY_TYPES.FLIGHT;
    if (entity.magnitude !== undefined && entity.depth !== undefined) return ENTITY_TYPES.EARTHQUAKE;
    if (entity.feedId !== undefined || entity.feedUrl !== undefined) return ENTITY_TYPES.CCTV;
    if (entity.headline !== undefined && entity.source !== undefined) return ENTITY_TYPES.NEWS;

    return null;
  }

  /**
   * Get display title for entity
   * @private
   * @param {Object} entity - Entity data object
   * @param {string} type - Entity type
   * @returns {string} Display title
   */
  _getTitle(entity, type) {
    if (!entity) return 'Unknown Entity';

    switch (type) {
      case ENTITY_TYPES.SATELLITE:
        return entity.name || `Satellite ${entity.noradId || 'Unknown'}`;
      case ENTITY_TYPES.FLIGHT:
        return entity.callsign || entity.icao24 || 'Unknown Flight';
      case ENTITY_TYPES.EARTHQUAKE:
        return entity.place || `M${entity.magnitude || '?'} Earthquake`;
      case ENTITY_TYPES.CCTV:
        return entity.name || entity.feedId || 'CCTV Feed';
      case ENTITY_TYPES.NEWS:
        return entity.headline || 'News Event';
      default:
        return entity.name || 'Unknown Entity';
    }
  }

  /**
   * Format a value for display, handling various types
   * @private
   * @param {*} value - Value to format
   * @param {string} key - Key name for context
   * @returns {string} Formatted string
   */
  _formatValue(value, key) {
    if (value === null || value === undefined) {
      return 'N/A';
    }

    // Handle Date objects - show relative time for recent dates (within 24h)
    if (value instanceof Date) {
      const now = Date.now();
      const diff = now - value.getTime();
      // If within 24 hours, show relative time
      if (diff >= 0 && diff < 86400000 && key === 'timestamp') {
        return formatTimeAgo(value);
      }
      return value.toLocaleString();
    }

    // Handle ISO date strings
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
      try {
        const date = new Date(value);
        const now = Date.now();
        const diff = now - date.getTime();
        // If within 24 hours and is a timestamp field, show relative time
        if (diff >= 0 && diff < 86400000 && key === 'timestamp') {
          return formatTimeAgo(date);
        }
        return date.toLocaleString();
      } catch (e) {
        return value;
      }
    }

    // Handle GDELT date format strings (20260306T090000Z)
    if (typeof value === 'string' && /^\d{8}T\d{6}Z$/.test(value)) {
      const date = parseGdeltDate(value);
      return formatTimeAgo(date);
    }

    // Handle numbers with context
    if (typeof value === 'number') {
      // Coordinates
      if (key === 'lat' || key === 'latitude') {
        return `${value.toFixed(4)}°`;
      }
      if (key === 'lon' || key === 'longitude') {
        return `${value.toFixed(4)}°`;
      }
      // Altitude
      if (key === 'alt' || key === 'altitude') {
        return `${value.toLocaleString()} m`;
      }
      // Depth (earthquakes)
      if (key === 'depth') {
        return `${value.toFixed(1)} km`;
      }
      // Magnitude
      if (key === 'magnitude') {
        return value.toFixed(1);
      }
      // Velocity
      if (key === 'velocity') {
        return `${value.toFixed(1)} m/s`;
      }
      // Heading
      if (key === 'heading') {
        return `${value.toFixed(0)}°`;
      }
      // Vertical rate
      if (key === 'verticalRate') {
        return `${value.toFixed(1)} m/s`;
      }
      // NORAD ID
      if (key === 'noradId') {
        return value.toString();
      }
      // Default number formatting
      return value.toLocaleString();
    }

    // Handle booleans
    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No';
    }

    // Handle objects (position, etc.)
    if (typeof value === 'object') {
      if (value.lat !== undefined && value.lon !== undefined) {
        const lat = value.lat.toFixed(4);
        const lon = value.lon.toFixed(4);
        const alt = value.alt ? ` @ ${value.alt.toFixed(1)} km` : '';
        return `${lat}°, ${lon}°${alt}`;
      }
      return JSON.stringify(value);
    }

    return String(value);
  }

  /**
   * Format key name for display
   * @private
   * @param {string} key - Key name
   * @returns {string} Formatted key name
   */
  _formatKey(key) {
    // Map of special key names
    const keyNames = {
      noradId: 'NORAD ID',
      icao24: 'ICAO24',
      lat: 'Latitude',
      lon: 'Longitude',
      alt: 'Altitude',
      line1: 'TLE Line 1',
      line2: 'TLE Line 2',
      lastFetch: 'Last Updated',
      responseTime: 'Data Time',
      originCountry: 'Origin Country',
      verticalRate: 'Vertical Rate',
      onGround: 'On Ground',
      feedId: 'Feed ID',
      feedUrl: 'Feed URL',
      feedType: 'Feed Type',
      feedRegion: 'Region',
      headline: 'Headline',
      source: 'Source',
    };

    if (keyNames[key]) {
      return keyNames[key];
    }

    // Convert camelCase to Title Case
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  }

  /**
   * Get field display order and filtering for entity type
   * @private
   * @param {string} type - Entity type
   * @returns {Object} Configuration with order array and skip set
   */
  _getFieldConfig(type) {
    const configs = {
      [ENTITY_TYPES.SATELLITE]: {
        order: ['name', 'noradId', 'position', 'line1', 'line2', 'lastFetch'],
        skip: new Set(['type']),
      },
      [ENTITY_TYPES.FLIGHT]: {
        order: ['callsign', 'icao24', 'originCountry', 'lat', 'lon', 'altitude', 'velocity', 'heading', 'verticalRate', 'onGround', 'squawk', 'isMilitary', 'lastFetch'],
        skip: new Set(['type']),
      },
      [ENTITY_TYPES.EARTHQUAKE]: {
        order: ['place', 'magnitude', 'depth', 'lat', 'lon', 'timestamp', 'id', 'url', 'lastFetch'],
        skip: new Set(['type']),
      },
      [ENTITY_TYPES.CCTV]: {
        order: ['name', 'feedId', 'feedType', 'feedRegion', 'lat', 'lon', 'feedUrl', 'url', 'lastTest'],
        skip: new Set(['type', 'id']),
      },
      [ENTITY_TYPES.NEWS]: {
        order: ['headline', 'source', 'timestamp', 'lat', 'lon', 'url', 'lastFetch'],
        skip: new Set(['type', 'id', 'imageUrl', 'tone']),
      },
    };

    return configs[type] || { order: [], skip: new Set(['type']) };
  }

  /**
   * Build content HTML for entity fields
   * @private
   * @param {Object} entity - Entity data object
   * @param {string} type - Entity type
   * @returns {string} HTML content
   */
  _buildFieldsHTML(entity, type) {
    if (!entity) return '';

    const config = this._getFieldConfig(type);
    const renderedKeys = new Set();
    let html = '<div class="info-panel-fields">';

    // Render fields in preferred order first
    for (const key of config.order) {
      if (entity[key] !== undefined && !config.skip.has(key)) {
        html += this._buildFieldRow(key, entity[key]);
        renderedKeys.add(key);
      }
    }

    // Render remaining fields
    for (const [key, value] of Object.entries(entity)) {
      if (!renderedKeys.has(key) && !config.skip.has(key)) {
        html += this._buildFieldRow(key, value);
      }
    }

    html += '</div>';
    return html;
  }

  /**
   * Build a single field row HTML
   * @private
   * @param {string} key - Field key
   * @param {*} value - Field value
   * @returns {string} HTML row
   */
  _buildFieldRow(key, value) {
    const formattedKey = this._formatKey(key);
    const formattedValue = this._formatValue(value, key);

    // Special handling for URLs - make them clickable
    if ((key === 'url' || key === 'feedUrl') && typeof value === 'string' && value.startsWith('http')) {
      return `
        <div class="info-panel-row">
          <span class="info-panel-label">${formattedKey}:</span>
          <span class="info-panel-value">
            <a href="${value}" target="_blank" rel="noopener noreferrer">Open Link</a>
          </span>
        </div>
      `;
    }

    // Special handling for TLE lines - use monospace
    if (key === 'line1' || key === 'line2') {
      return `
        <div class="info-panel-row">
          <span class="info-panel-label">${formattedKey}:</span>
          <span class="info-panel-value info-panel-mono">${formattedValue}</span>
        </div>
      `;
    }

    return `
      <div class="info-panel-row">
        <span class="info-panel-label">${formattedKey}:</span>
        <span class="info-panel-value">${formattedValue}</span>
      </div>
    `;
  }

  /**
   * Get icon for entity type
   * @private
   * @param {string} type - Entity type
   * @returns {string} Icon character or emoji
   */
  _getIcon(type) {
    const icons = {
      [ENTITY_TYPES.SATELLITE]: '🛰',
      [ENTITY_TYPES.FLIGHT]: '✈',
      [ENTITY_TYPES.EARTHQUAKE]: '🌍',
      [ENTITY_TYPES.CCTV]: '📷',
      [ENTITY_TYPES.NEWS]: '📰',
    };
    return icons[type] || '📍';
  }

  /**
   * Build full panel HTML
   * @private
   * @param {Object} entity - Entity data object
   * @param {string} type - Entity type
   * @returns {string} Complete panel HTML
   */
  _buildPanelHTML(entity, type) {
    const title = this._getTitle(entity, type);
    const icon = this._getIcon(type);
    const fields = this._buildFieldsHTML(entity, type);

    return `
      <div class="info-panel-header">
        <span class="info-panel-icon">${icon}</span>
        <h3 class="info-panel-title">${title}</h3>
        <button class="info-panel-close" aria-label="Close panel">&times;</button>
      </div>
      <div class="info-panel-content">
        ${fields}
      </div>
    `;
  }

  /**
   * Show the info panel with entity details
   * Clears any previous content before showing new entity.
   * @param {Object} entity - Entity data object to display
   * @returns {HTMLElement|null} The panel element, or null if DOM unavailable
   */
  show(entity) {
    if (!this._domAvailable) {
      return null;
    }

    // Detect entity type
    const type = this._detectEntityType(entity);

    // Store current entity reference
    this._currentEntity = entity;

    // Create or get panel element
    if (!this.panel) {
      this.panel = document.createElement('div');
      this.panel.className = 'info-panel';
      this.panel.setAttribute('role', 'dialog');
      this.panel.setAttribute('aria-label', 'Entity Information');
    }

    // Clear previous content
    this.panel.innerHTML = '';

    // Build and set new content
    this.panel.innerHTML = this._buildPanelHTML(entity, type);

    // Add to container or body
    const parent = this.container || document.body;
    if (!this.panel.parentNode) {
      parent.appendChild(this.panel);
    }

    // Make visible
    this.panel.style.display = 'block';

    // Bind close button handler
    this._bindCloseHandler();

    return this.panel;
  }

  /**
   * Bind click handler to close button
   * @private
   */
  _bindCloseHandler() {
    if (!this.panel) return;

    const closeBtn = this.panel.querySelector('.info-panel-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.hide();
      });
    }
  }

  /**
   * Hide the info panel
   */
  hide() {
    if (this.panel) {
      this.panel.style.display = 'none';
    }
    this._currentEntity = null;
  }

  /**
   * Check if panel is currently visible
   * @returns {boolean} True if panel is visible
   */
  isVisible() {
    return this.panel && this.panel.style.display !== 'none';
  }

  /**
   * Get the currently displayed entity
   * @returns {Object|null} Current entity or null
   */
  getCurrentEntity() {
    return this._currentEntity;
  }

  /**
   * Remove the panel from the DOM and clean up
   */
  destroy() {
    if (this.panel && this.panel.parentNode) {
      this.panel.parentNode.removeChild(this.panel);
    }
    this.panel = null;
    this.container = null;
    this._currentEntity = null;
  }
}

// Export entity types for external use
export { ENTITY_TYPES };

export default InfoPanel;
