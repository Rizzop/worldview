// WorldView - Main Application Entry Point
// Initializes globe, layers, UI controls, and manages refresh intervals

// Import Globe
import { Globe } from './globe.js';

// Import all layers
import { SatelliteLayer } from './layers/satellites.js';
import { FlightLayer } from './layers/flights.js';
import { SeismicLayer } from './layers/seismic.js';
import { TrafficLayer } from './layers/traffic.js';
import { CCTVLayer } from './layers/cctv.js';
import { NewsLayer } from './layers/news.js';

// Import UI modules
import { Controls } from './ui/controls.js';
import { InfoPanel } from './ui/info-panel.js';
import { Search } from './ui/search.js';
import { HUD } from './ui/hud.js';
import { Regions } from './ui/regions.js';

// Import shader manager
import { ShaderManager } from './shaders/shader-manager.js';

// Import config, falling back to example if config.js doesn't exist
let config;
try {
  config = (await import('../config.js')).default;
} catch (e) {
  try {
    config = (await import('../config.example.js')).default;
  } catch (e2) {
    // Fallback to minimal default config if neither exists
    config = {
      CESIUM_ION_TOKEN: '',
      REFRESH_RATES: {
        satellites: 60000,
        flights: 15000,
        seismic: 300000,
        traffic: 120000,
        cctv: 60000
      },
      view: {
        defaultLatitude: 0,
        defaultLongitude: 0,
        defaultHeight: 20000000
      }
    };
  }
}

/**
 * WorldViewApp - Main application class
 * Orchestrates globe, layers, UI, and refresh intervals
 */
export class WorldViewApp {
  /**
   * Create a new WorldViewApp instance
   * @param {Object} options - Configuration options
   * @param {string|HTMLElement} options.container - Container for the globe
   * @param {string|HTMLElement} [options.controlsContainer] - Container for controls panel
   * @param {string|HTMLElement} [options.hudContainer] - Container for HUD overlay
   * @param {Object} [options.layers] - Initial layer enable states
   */
  constructor(options = {}) {
    this.options = options;
    this.globe = null;
    this.shaderManager = null;

    // Layer instances
    this.layers = {
      satellites: null,
      flights: null,
      seismic: null,
      traffic: null,
      cctv: null,
      news: null
    };

    // Layer enabled states (default: only flights enabled for cinematic look)
    // Other layers toggled on manually per task requirements
    this.layerStates = {
      satellites: options.layers?.satellites ?? false,
      flights: options.layers?.flights ?? true,
      seismic: options.layers?.seismic ?? false,
      traffic: options.layers?.traffic ?? false,
      cctv: options.layers?.cctv ?? false,
      news: options.layers?.news ?? false
    };

    // UI components
    this.controls = null;
    this.infoPanel = null;
    this.search = null;
    this.hud = null;
    this.regions = null;

    // Refresh interval IDs
    this._refreshIntervals = {
      satellites: null,
      flights: null,
      seismic: null,
      traffic: null,
      cctv: null,
      news: null
    };

    // Initialization state
    this._initialized = false;
  }

  /**
   * Initialize the application
   * Creates globe, layers, and UI components
   * @returns {Promise<WorldViewApp>} This instance for chaining
   */
  async init() {
    if (this._initialized) {
      return this;
    }

    console.log('[WorldView] Initializing application...');

    // Initialize globe with config for Cesium Ion token
    try {
      this.globe = new Globe(this.options.container, {}, config);
      console.log('[WorldView] Globe initialized');
    } catch (error) {
      console.error('[WorldView] Failed to initialize globe:', error.message);
      throw error;
    }

    // Initialize layers (catch errors for each individually)
    await this._initLayers();

    // Initialize UI components
    this._initUI();

    // Bind UI controls to layer toggles
    this._bindControls();

    // Start refresh intervals for enabled layers
    this._startRefreshIntervals();

    // Set up event listeners for entity clicks
    this._setupEntityClickHandlers();

    // Enable all layers that are marked as enabled (fetch and render initial data)
    await this._enableInitialLayers();

    this._initialized = true;
    console.log('[WorldView] Application initialized');

    return this;
  }

  /**
   * Initialize all data layers
   * Catches and logs errors for each layer individually
   * @private
   */
  async _initLayers() {
    // Initialize Satellite Layer
    try {
      this.layers.satellites = new SatelliteLayer({
        timeout: 30000,
        retries: 3
      });
      console.log('[WorldView] SatelliteLayer initialized');
    } catch (error) {
      console.error('[WorldView] Failed to initialize SatelliteLayer:', error.message);
      this.layers.satellites = null;
      this.layerStates.satellites = false;
    }

    // Initialize Flight Layer with OpenSky credentials from config
    try {
      this.layers.flights = new FlightLayer({
        timeout: 30000,
        retries: 3,
        username: config.OPENSKY_USERNAME || null,
        password: config.OPENSKY_PASSWORD || null
      });
      console.log('[WorldView] FlightLayer initialized');
    } catch (error) {
      console.error('[WorldView] Failed to initialize FlightLayer:', error.message);
      this.layers.flights = null;
      this.layerStates.flights = false;
    }

    // Initialize Seismic Layer
    try {
      this.layers.seismic = new SeismicLayer({
        timeout: 30000,
        retries: 3
      });
      console.log('[WorldView] SeismicLayer initialized');
    } catch (error) {
      console.error('[WorldView] Failed to initialize SeismicLayer:', error.message);
      this.layers.seismic = null;
      this.layerStates.seismic = false;
    }

    // Initialize Traffic Layer
    try {
      this.layers.traffic = new TrafficLayer({
        timeout: 60000,
        retries: 3
      });
      console.log('[WorldView] TrafficLayer initialized');
    } catch (error) {
      console.error('[WorldView] Failed to initialize TrafficLayer:', error.message);
      this.layers.traffic = null;
      this.layerStates.traffic = false;
    }

    // Initialize CCTV Layer
    try {
      this.layers.cctv = new CCTVLayer({
        timeout: 5000,
        retries: 1
      });
      console.log('[WorldView] CCTVLayer initialized');
    } catch (error) {
      console.error('[WorldView] Failed to initialize CCTVLayer:', error.message);
      this.layers.cctv = null;
      this.layerStates.cctv = false;
    }

    // Initialize News Layer (GDELT)
    // Do NOT override query/timespan - NewsLayer defaults are per task spec:
    // query: conflict war military attack missile airstrike, timespan: 24h
    try {
      this.layers.news = new NewsLayer({
        timeout: 30000,
        retries: 2
      });
      console.log('[WorldView] NewsLayer initialized');
    } catch (error) {
      console.error('[WorldView] Failed to initialize NewsLayer:', error.message);
      this.layers.news = null;
      this.layerStates.news = false;
    }
  }

  /**
   * Initialize UI components
   * @private
   */
  _initUI() {
    // Initialize Controls panel
    try {
      this.controls = new Controls({
        container: this.options.controlsContainer,
        layers: this.layerStates,
        mode: 'none',
        opacity: 100
      });
      console.log('[WorldView] Controls initialized');
    } catch (error) {
      console.error('[WorldView] Failed to initialize Controls:', error.message);
    }

    // Initialize Info Panel with container set to document body for overlay
    try {
      this.infoPanel = new InfoPanel({
        container: document.body
      });
      console.log('[WorldView] InfoPanel initialized');
    } catch (error) {
      console.error('[WorldView] Failed to initialize InfoPanel:', error.message);
    }

    // Initialize Search
    try {
      this.search = new Search(this.globe);
      console.log('[WorldView] Search initialized');
    } catch (error) {
      console.error('[WorldView] Failed to initialize Search:', error.message);
    }

    // Initialize HUD
    try {
      this.hud = new HUD({
        container: this.options.hudContainer,
        layers: this._getActiveLayersForHUD(),
        updateInterval: 1000
      });
      console.log('[WorldView] HUD initialized');
    } catch (error) {
      console.error('[WorldView] Failed to initialize HUD:', error.message);
    }

    // Initialize ShaderManager (only in browser with valid viewer)
    try {
      if (this.globe && this.globe.getViewer) {
        const viewer = this.globe.getViewer();
        if (viewer) {
          this.shaderManager = new ShaderManager(viewer);
          console.log('[WorldView] ShaderManager initialized');
        }
      }
    } catch (error) {
      console.error('[WorldView] Failed to initialize ShaderManager:', error.message);
    }

    // Initialize Regions dropdown
    try {
      this.regions = new Regions({
        globe: this.globe,
        container: 'regionsContainer'
      });
      console.log('[WorldView] Regions initialized');
    } catch (error) {
      console.error('[WorldView] Failed to initialize Regions:', error.message);
    }
  }

  /**
   * Get active layers formatted for HUD registration
   * @private
   * @returns {Object} Map of layer names to layer instances
   */
  _getActiveLayersForHUD() {
    const hudLayers = {};
    for (const [name, layer] of Object.entries(this.layers)) {
      if (layer && this.layerStates[name]) {
        hudLayers[name] = layer;
      }
    }
    return hudLayers;
  }

  /**
   * Bind UI controls to layer toggle methods
   * @private
   */
  _bindControls() {
    if (!this.controls) {
      return;
    }

    // Listen for layer toggle events
    this.controls.on('layerToggle', ({ layer, enabled }) => {
      this._handleLayerToggle(layer, enabled);
    });

    // Listen for visual mode changes
    this.controls.on('modeChange', ({ mode }) => {
      this._handleModeChange(mode);
    });

    // Listen for map mode changes
    this.controls.on('mapModeChange', ({ mode }) => {
      this._handleMapModeChange(mode);
    });

    // Listen for borders toggle events
    this.controls.on('bordersToggle', ({ visible }) => {
      this._handleBordersToggle(visible);
    });

    // Listen for opacity changes
    this.controls.on('opacityChange', ({ opacity }) => {
      this._handleOpacityChange(opacity);
    });
  }

  /**
   * Handle layer toggle from UI
   * @private
   * @param {string} layerName - Name of the layer
   * @param {boolean} enabled - Whether to enable or disable
   */
  _handleLayerToggle(layerName, enabled) {
    const layer = this.layers[layerName];
    if (!layer) {
      console.warn(`[WorldView] Layer '${layerName}' not available`);
      return;
    }

    this.layerStates[layerName] = enabled;

    if (enabled) {
      // Enable layer: fetch data and render
      this._enableLayer(layerName);
      // Start refresh interval
      this._startLayerRefresh(layerName);
      // Register with HUD
      if (this.hud) {
        this.hud.registerLayer(layerName, layer);
      }
    } else {
      // Disable layer: remove from globe
      this._disableLayer(layerName);
      // Stop refresh interval
      this._stopLayerRefresh(layerName);
      // Unregister from HUD
      if (this.hud) {
        this.hud.unregisterLayer(layerName);
      }
    }
  }

  /**
   * Handle visual mode change from UI
   * @private
   * @param {string} mode - Visual mode ('none', 'nvg', 'flir', 'crt')
   */
  _handleModeChange(mode) {
    if (this.shaderManager) {
      try {
        this.shaderManager.applyShader(mode);
        console.log(`[WorldView] Visual mode changed to: ${mode}`);
      } catch (error) {
        console.error('[WorldView] Failed to apply shader:', error.message);
      }
    }
  }

  /**
   * Handle opacity change from UI
   * @private
   * @param {number} opacity - Opacity value (0-100)
   */
  _handleOpacityChange(opacity) {
    // Opacity could be applied to various elements
    // For now, log the change
    console.log(`[WorldView] Opacity changed to: ${opacity}%`);
  }

  /**
   * Handle map mode change from UI
   * @private
   * @param {string} mode - Map mode ('satellite', 'dark', 'hybrid')
   */
  _handleMapModeChange(mode) {
    if (this.globe) {
      try {
        this.globe.setMapMode(mode);
        console.log(`[WorldView] Map mode changed to: ${mode}`);
      } catch (error) {
        console.error('[WorldView] Failed to change map mode:', error.message);
      }
    }
  }

  /**
   * Handle borders toggle from UI
   * @private
   * @param {boolean} visible - Whether borders should be visible
   */
  _handleBordersToggle(visible) {
    if (this.globe) {
      try {
        this.globe.setBordersVisible(visible);
        console.log(`[WorldView] Borders visibility: ${visible}`);
      } catch (error) {
        console.error('[WorldView] Failed to toggle borders:', error.message);
      }
    }
  }

  /**
   * Enable a layer: fetch data and render
   * @private
   * @param {string} layerName - Name of the layer
   */
  async _enableLayer(layerName) {
    const layer = this.layers[layerName];
    if (!layer || !this.globe) {
      return;
    }

    try {
      // Fetch and render based on layer type
      switch (layerName) {
        case 'satellites':
          await layer.fetchAndParse();
          layer.render(this.globe);
          break;
        case 'flights':
          await layer.fetchAndParse();
          layer.render(this.globe);
          break;
        case 'seismic':
          await layer.fetchAndParse();
          layer.render(this.globe);
          break;
        case 'traffic':
          // Traffic needs a bounding box - use a default area
          // In a real app, this would be based on camera position
          await layer.fetchAndParse({
            south: 40.7,
            west: -74.1,
            north: 40.8,
            east: -73.9
          });
          layer.render(this.globe);
          break;
        case 'cctv':
          // CCTV doesn't need to fetch, data is built-in
          layer.render(this.globe);
          break;
        case 'news':
          // Fetch GDELT news events and render
          await layer.fetchAndParse();
          layer.render(this.globe);
          // Update HUD with news count
          if (this.hud) {
            this.hud.setNewsCount(layer.count);
          }
          break;
      }
      console.log(`[WorldView] Layer '${layerName}' enabled and rendered`);
    } catch (error) {
      console.error(`[WorldView] Failed to enable layer '${layerName}':`, error.message);
    }
  }

  /**
   * Disable a layer: remove from globe
   * @private
   * @param {string} layerName - Name of the layer
   */
  _disableLayer(layerName) {
    const layer = this.layers[layerName];
    if (!layer || !this.globe) {
      return;
    }

    try {
      layer.removeAll(this.globe);
      console.log(`[WorldView] Layer '${layerName}' disabled`);
    } catch (error) {
      console.error(`[WorldView] Failed to disable layer '${layerName}':`, error.message);
    }
  }

  /**
   * Enable all initial layers that are marked as enabled
   * Fetches data and renders each layer on startup
   * @private
   */
  async _enableInitialLayers() {
    console.log('[WorldView] Enabling initial layers...');

    // Enable layers in parallel for faster startup
    const enablePromises = [];

    for (const layerName of Object.keys(this.layers)) {
      if (this.layerStates[layerName] && this.layers[layerName]) {
        console.log(`[WorldView] Enabling initial layer: ${layerName}`);
        enablePromises.push(
          this._enableLayer(layerName).catch(error => {
            console.error(`[WorldView] Failed to enable ${layerName}:`, error.message);
          })
        );

        // Register with HUD
        if (this.hud) {
          this.hud.registerLayer(layerName, this.layers[layerName]);
        }
      }
    }

    // Wait for all layers to be enabled
    await Promise.all(enablePromises);
    console.log('[WorldView] All initial layers enabled');
  }

  /**
   * Start refresh intervals for all enabled layers
   * @private
   */
  _startRefreshIntervals() {
    for (const layerName of Object.keys(this.layers)) {
      if (this.layerStates[layerName]) {
        this._startLayerRefresh(layerName);
      }
    }
  }

  /**
   * Start refresh interval for a specific layer
   * Uses config.refreshRates if available
   * @private
   * @param {string} layerName - Name of the layer
   */
  _startLayerRefresh(layerName) {
    // Don't start if layer is disabled
    if (!this.layerStates[layerName]) {
      return;
    }

    // Clear any existing interval
    this._stopLayerRefresh(layerName);

    // Get refresh rate from config (uses REFRESH_RATES uppercase to match config.js)
    const refreshRates = config?.REFRESH_RATES || {};
    let intervalMs;

    switch (layerName) {
      case 'satellites':
        intervalMs = refreshRates.satellites || 60000;
        break;
      case 'flights':
        intervalMs = refreshRates.flights || 15000;
        break;
      case 'seismic':
        intervalMs = refreshRates.seismic || 300000;
        break;
      case 'traffic':
        intervalMs = refreshRates.traffic || 120000;
        break;
      case 'cctv':
        intervalMs = refreshRates.cctv || 60000;
        break;
      case 'news':
        intervalMs = refreshRates.news || 300000; // 5 minutes
        break;
      default:
        intervalMs = 5000;
    }

    // Start interval
    this._refreshIntervals[layerName] = setInterval(() => {
      this._refreshLayer(layerName);
    }, intervalMs);

    console.log(`[WorldView] Started refresh for '${layerName}' every ${intervalMs}ms`);
  }

  /**
   * Stop refresh interval for a specific layer
   * @private
   * @param {string} layerName - Name of the layer
   */
  _stopLayerRefresh(layerName) {
    if (this._refreshIntervals[layerName]) {
      clearInterval(this._refreshIntervals[layerName]);
      this._refreshIntervals[layerName] = null;
    }
  }

  /**
   * Refresh a layer's data
   * @private
   * @param {string} layerName - Name of the layer
   */
  async _refreshLayer(layerName) {
    // Don't refresh if layer is disabled
    if (!this.layerStates[layerName]) {
      return;
    }

    const layer = this.layers[layerName];
    if (!layer || !this.globe) {
      return;
    }

    try {
      switch (layerName) {
        case 'satellites':
          // Update satellite positions (no network fetch needed)
          layer.updatePositions(new Date());
          break;
        case 'flights':
          // SMOOTH UPDATE: Fetch new flight data and update in place
          // Do NOT call removeAll - render() handles smooth updates via setValue()
          await layer.fetchAndParse();
          layer.render(this.globe);
          break;
        case 'seismic':
          // Fetch new earthquake data
          layer.removeAll(this.globe);
          await layer.fetchAndParse();
          layer.render(this.globe);
          break;
        case 'traffic':
          // Traffic particles animate automatically, no refresh needed
          break;
        case 'cctv':
          // CCTV feeds are static, no refresh needed
          break;
        case 'news':
          // Fetch new news events and render
          await layer.fetchAndParse();
          layer.render(this.globe);
          break;
      }

      // Update military count in HUD after flight refresh
      if (layerName === 'flights' && this.hud && this.layers.flights) {
        const militaryCount = this.layers.flights.getMilitaryCount();
        this.hud.setMilitaryCount(militaryCount);
      }

      // Update news count in HUD after news refresh
      if (layerName === 'news' && this.hud && this.layers.news) {
        const newsCount = this.layers.news.count;
        this.hud.setNewsCount(newsCount);
      }
    } catch (error) {
      console.error(`[WorldView] Error refreshing layer '${layerName}':`, error.message);
    }
  }

  /**
   * Set up event listeners for entity click events
   * Uses Cesium ScreenSpaceEventHandler for LEFT_CLICK picking
   * @private
   */
  _setupEntityClickHandlers() {
    if (typeof document === 'undefined') {
      return;
    }

    // Set up Cesium ScreenSpaceEventHandler for entity picking
    this._setupCesiumClickHandler();

    // Listen for satellite clicks (from custom events)
    document.addEventListener('satelliteClick', (event) => {
      if (this.infoPanel) {
        this.infoPanel.show(event.detail);
      }
    });

    // Listen for flight clicks
    document.addEventListener('flightClick', (event) => {
      if (this.infoPanel) {
        this.infoPanel.show(event.detail);
      }
    });

    // Listen for earthquake clicks
    document.addEventListener('earthquakeClick', (event) => {
      if (this.infoPanel) {
        this.infoPanel.show(event.detail);
      }
    });

    // Listen for news clicks
    document.addEventListener('newsClick', (event) => {
      if (this.infoPanel) {
        this.infoPanel.show(event.detail);
      }
    });

    // Per task spec PART D: When region is selected, auto-enable news layer
    document.addEventListener('enableNewsLayer', (event) => {
      // Auto-enable news layer if not already enabled
      if (!this.layerStates.news && this.layers.news) {
        console.log('[WorldView] Auto-enabling News layer for region:', event.detail?.regionName);
        this._handleLayerToggle('news', true);
        // Update checkbox in controls if available
        if (this.controls && this.controls.setLayerState) {
          this.controls.setLayerState('news', true);
        }
      }

      // Update HUD with news event count after a brief delay for fetch
      setTimeout(() => {
        if (this.hud && this.layers.news) {
          const newsCount = this.layers.news.count;
          this.hud.setNewsCount && this.hud.setNewsCount(newsCount);
        }
      }, 2000);
    });
  }

  /**
   * Set up Cesium ScreenSpaceEventHandler for LEFT_CLICK entity picking
   * @private
   */
  _setupCesiumClickHandler() {
    if (!this.globe) {
      return;
    }

    const viewer = this.globe.getViewer();
    if (!viewer || !window.Cesium) {
      return;
    }

    const Cesium = window.Cesium;

    // Create ScreenSpaceEventHandler for click detection
    this._clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

    // Handle LEFT_CLICK events
    this._clickHandler.setInputAction((click) => {
      // Use scene.pick() to get clicked entity
      const pickedObject = viewer.scene.pick(click.position);

      if (Cesium.defined(pickedObject) && pickedObject.id) {
        // Entity was clicked - extract entity data
        const entity = pickedObject.id;
        const entityData = this._extractEntityData(entity);

        if (entityData && this.infoPanel) {
          this.infoPanel.show(entityData);
        }
      } else {
        // Clicked empty space - hide info panel
        if (this.infoPanel) {
          this.infoPanel.hide();
        }
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  /**
   * Extract displayable data from a Cesium entity
   * @private
   * @param {Object} entity - Cesium entity
   * @returns {Object|null} Entity data object for info panel
   */
  _extractEntityData(entity) {
    if (!entity) {
      return null;
    }

    // Check for custom properties stored on the entity
    if (entity.properties) {
      const props = {};
      const propertyNames = entity.properties.propertyNames;

      if (propertyNames && propertyNames.length > 0) {
        for (const name of propertyNames) {
          const value = entity.properties[name];
          // getValue() for Cesium Property objects, or direct value
          props[name] = value && typeof value.getValue === 'function'
            ? value.getValue()
            : value;
        }
        return props;
      }
    }

    // Fallback: build basic entity info from available data
    const data = {};

    // Get entity name
    if (entity.name) {
      data.name = entity.name;
    }

    // Get entity ID
    if (entity.id) {
      data.id = entity.id;

      // Detect entity type from ID prefix
      if (entity.id.startsWith('sat-')) {
        data.type = 'satellite';
      } else if (entity.id.startsWith('flight-')) {
        data.type = 'flight';
      } else if (entity.id.startsWith('quake-')) {
        data.type = 'earthquake';
      } else if (entity.id.startsWith('cctv-')) {
        data.type = 'cctv';
      } else if (entity.id.startsWith('news-')) {
        data.type = 'news';
      }
    }

    // Get position if available
    if (entity.position) {
      try {
        const Cesium = window.Cesium;
        const cartesian = entity.position.getValue
          ? entity.position.getValue(Cesium.JulianDate.now())
          : entity.position;

        if (cartesian) {
          const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
          data.lat = Cesium.Math.toDegrees(cartographic.latitude);
          data.lon = Cesium.Math.toDegrees(cartographic.longitude);
          data.altitude = cartographic.height;
        }
      } catch (e) {
        // Position extraction failed, continue without it
      }
    }

    // Get description if available
    if (entity.description) {
      const desc = entity.description.getValue
        ? entity.description.getValue()
        : entity.description;
      if (desc) {
        data.description = desc;
      }
    }

    return Object.keys(data).length > 0 ? data : null;
  }

  /**
   * Get layer instance by name
   * @param {string} name - Layer name
   * @returns {Object|null} Layer instance or null
   */
  getLayer(name) {
    return this.layers[name] || null;
  }

  /**
   * Get globe instance
   * @returns {Globe|null} Globe instance or null
   */
  getGlobe() {
    return this.globe;
  }

  /**
   * Get shader manager instance
   * @returns {ShaderManager|null} ShaderManager instance or null
   */
  getShaderManager() {
    return this.shaderManager;
  }

  /**
   * Perform a location search and fly to result
   * @param {string} query - Search query
   * @returns {Promise<Object|null>} Search result or null
   */
  async searchLocation(query) {
    if (!this.search) {
      return null;
    }
    return this.search.searchAndFlyTo(query);
  }

  /**
   * Destroy the application and clean up resources
   */
  destroy() {
    // Stop all refresh intervals
    for (const layerName of Object.keys(this._refreshIntervals)) {
      this._stopLayerRefresh(layerName);
    }

    // Remove all layers from globe
    for (const layerName of Object.keys(this.layers)) {
      this._disableLayer(layerName);
    }

    // Destroy click handler
    if (this._clickHandler) {
      this._clickHandler.destroy();
      this._clickHandler = null;
    }

    // Destroy UI components
    if (this.controls) {
      this.controls.destroy();
    }
    if (this.infoPanel) {
      this.infoPanel.destroy();
    }
    if (this.hud) {
      this.hud.destroy();
    }
    if (this.shaderManager) {
      this.shaderManager.destroy();
    }
    if (this.regions) {
      this.regions.destroy();
    }

    // Destroy globe
    if (this.globe) {
      this.globe.destroy();
    }

    this._initialized = false;
    console.log('[WorldView] Application destroyed');
  }
}

// Export for module usage
export default WorldViewApp;

// Initialize the application on page load
// This is the entry point that creates and initializes the WorldViewApp
(async function initApp() {
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve));
  }

  // Create and initialize the application
  try {
    const app = new WorldViewApp({
      container: 'cesiumContainer',
      controlsContainer: 'controlsContainer',
      hudContainer: 'hudContainer'
    });

    // Initialize the app (creates globe, layers, UI)
    await app.init();

    // Expose app globally for debugging if needed
    window.worldViewApp = app;

    console.log('[WorldView] Application ready');
  } catch (error) {
    console.error('[WorldView] Failed to start application:', error);
  }
})();
