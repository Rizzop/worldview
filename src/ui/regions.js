/**
 * Region Presets UI - Quick navigation to hotspot regions
 * Provides dropdown/button bar for flying camera to preset conflict zones.
 * Styled with glassmorphism to match controls panel.
 */

/**
 * Predefined region presets with camera settings
 * Each region has center coordinates and viewing range
 * Per task spec: Global, Middle East (33,44), Ukraine (48.5,35), East Asia (24,120), Europe (50,10)
 */
const REGION_PRESETS = {
  global: {
    name: 'Global',
    description: 'Full globe view',
    lat: 20,
    lon: 0,
    range: 20000000, // 20,000 km - full globe
  },
  middleeast: {
    name: 'Middle East',
    description: 'Middle East conflict zone',
    lat: 33.0,
    lon: 44.0,
    range: 3000000, // 3,000 km
  },
  ukraine: {
    name: 'Ukraine / Black Sea',
    description: 'Ukraine and Black Sea region',
    lat: 48.5,
    lon: 35.0,
    range: 2000000, // 2,000 km
  },
  eastasia: {
    name: 'East Asia / Taiwan',
    description: 'Taiwan Strait and East Asia',
    lat: 24.0,
    lon: 120.0,
    range: 2000000, // 2,000 km
  },
  europe: {
    name: 'Europe',
    description: 'European continent',
    lat: 50.0,
    lon: 10.0,
    range: 3000000, // 3,000 km
  },
  korea: {
    name: 'Korean Peninsula',
    description: 'North and South Korea',
    lat: 38.0,
    lon: 127.5,
    range: 1500000, // 1,500 km
  },
  southchinasea: {
    name: 'South China Sea',
    description: 'South China Sea and disputed territories',
    lat: 15.0,
    lon: 115.0,
    range: 2500000, // 2,500 km
  },
};

/**
 * Simple EventEmitter for event-driven communication
 * @private
 */
class EventEmitter {
  constructor() {
    this._events = new Map();
  }

  on(event, listener) {
    if (!this._events.has(event)) {
      this._events.set(event, []);
    }
    this._events.get(event).push(listener);
  }

  off(event, listener) {
    if (!this._events.has(event)) return;
    const listeners = this._events.get(event);
    const index = listeners.indexOf(listener);
    if (index > -1) {
      listeners.splice(index, 1);
    }
  }

  emit(event, data) {
    if (!this._events.has(event)) return;
    for (const listener of this._events.get(event)) {
      try {
        listener(data);
      } catch (e) {
        // Prevent errors from breaking other listeners
      }
    }
  }
}

/**
 * Regions class - Region presets dropdown UI
 * Emits events: 'regionSelect'
 */
export class Regions extends EventEmitter {
  /**
   * Create a new Regions instance
   * @param {Object} options - Configuration options
   * @param {string|HTMLElement} [options.container] - Container element or ID
   * @param {Object} [options.globe] - Globe instance for camera control
   */
  constructor(options = {}) {
    super();

    this.container = null;
    this.panel = null;
    this.globe = options.globe || null;
    this._currentRegion = 'global';
    this._domAvailable = this._checkDOMAvailable();

    if (options.container && this._domAvailable) {
      this.render(options.container);
    }
  }

  /**
   * Check if DOM is available
   * @private
   * @returns {boolean}
   */
  _checkDOMAvailable() {
    return typeof document !== 'undefined' && typeof document.createElement === 'function';
  }

  /**
   * Set globe reference for camera control
   * @param {Object} globe - Globe instance
   */
  setGlobe(globe) {
    this.globe = globe;
  }

  /**
   * Get current selected region
   * @returns {string} Region key
   */
  getCurrentRegion() {
    return this._currentRegion;
  }

  /**
   * Get all available regions
   * @returns {Object} Region presets object
   */
  getRegions() {
    return { ...REGION_PRESETS };
  }

  /**
   * Fly to a specific region
   * Uses Cesium camera.flyTo with Cartesian3.fromDegrees destination
   * @param {string} regionKey - Key of the region to fly to
   * @returns {boolean} True if flight initiated
   */
  flyToRegion(regionKey) {
    const region = REGION_PRESETS[regionKey];
    if (!region) {
      console.warn(`[Regions] Unknown region: ${regionKey}`);
      return false;
    }

    this._currentRegion = regionKey;

    // Update dropdown if it exists
    if (this._dropdown) {
      this._dropdown.value = regionKey;
    }

    // Fly camera to region using Cesium.Cartesian3.fromDegrees
    if (this.globe) {
      const viewer = this.globe.getViewer ? this.globe.getViewer() : null;
      const Cesium = window.Cesium;

      if (viewer && Cesium) {
        // Use camera.flyTo with Cesium.Cartesian3.fromDegrees destination
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(region.lon, region.lat, region.range),
          duration: 2,
          orientation: {
            heading: Cesium.Math.toRadians(0),
            pitch: Cesium.Math.toRadians(-90),
            roll: 0
          }
        });
        console.log(`[Regions] Flying to ${region.name} (${region.lat}, ${region.lon}) at ${region.range}m`);
      } else if (this.globe.flyTo) {
        // Fallback to globe.flyTo method
        this.globe.flyTo({
          latitude: region.lat,
          longitude: region.lon,
          height: region.range,
        }, 2);
      }
    }

    // Dispatch custom event for HUD update: "REGION: MIDDLE EAST" etc.
    if (typeof document !== 'undefined') {
      const hudEvent = new CustomEvent('regionChange', {
        detail: {
          region: regionKey,
          name: region.name.toUpperCase()
        }
      });
      document.dispatchEvent(hudEvent);

      // Per task spec PART D: When user selects a region, auto-enable news layer
      // Dispatch event to enable news layer if not already on
      const newsEnableEvent = new CustomEvent('enableNewsLayer', {
        detail: {
          region: regionKey,
          regionName: region.name
        }
      });
      document.dispatchEvent(newsEnableEvent);
    }

    // Emit event
    this.emit('regionSelect', { region: regionKey, ...region });

    return true;
  }

  /**
   * Render the regions panel to the DOM
   * @param {string|HTMLElement} container - Container element or ID
   * @returns {HTMLElement|null} The created panel element
   */
  render(container) {
    if (!this._domAvailable) {
      return null;
    }

    // Resolve container
    if (typeof container === 'string') {
      this.container = document.getElementById(container);
    } else {
      this.container = container;
    }

    if (!this.container) {
      // Create container if needed
      this.container = document.createElement('div');
      this.container.id = 'regionsContainer';
      this.container.className = 'regions-container';
      document.body.appendChild(this.container);
    }

    // Create panel with glassmorphism styling
    this.panel = document.createElement('div');
    this.panel.className = 'regions-panel';
    this.panel.setAttribute('role', 'region');
    this.panel.setAttribute('aria-label', 'Region Presets');

    // Build panel HTML
    this.panel.innerHTML = this._buildPanelHTML();

    // Append to container
    this.container.appendChild(this.panel);

    // Bind event handlers
    this._bindEventHandlers();

    return this.panel;
  }

  /**
   * Build the panel HTML
   * @private
   * @returns {string} HTML string
   */
  _buildPanelHTML() {
    const optionsHTML = Object.entries(REGION_PRESETS)
      .map(([key, region]) => `
        <option value="${key}" ${this._currentRegion === key ? 'selected' : ''}>
          ${region.name}
        </option>
      `)
      .join('');

    return `
      <div class="regions-section">
        <label class="regions-label" for="region-select">REGION</label>
        <select id="region-select" class="regions-dropdown">
          ${optionsHTML}
        </select>
      </div>
    `;
  }

  /**
   * Bind event handlers
   * @private
   */
  _bindEventHandlers() {
    if (!this.panel) return;

    this._dropdown = this.panel.querySelector('#region-select');
    if (this._dropdown) {
      this._dropdown.addEventListener('change', (e) => {
        this.flyToRegion(e.target.value);
      });
    }
  }

  /**
   * Remove panel from DOM
   */
  destroy() {
    if (this.panel && this.panel.parentNode) {
      this.panel.parentNode.removeChild(this.panel);
    }
    this.panel = null;
    this.container = null;
    this._dropdown = null;
    this._events.clear();
  }
}

// Export constants
export { REGION_PRESETS };

export default Regions;
