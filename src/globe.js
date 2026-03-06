// Globe Module - CesiumJS Viewer Wrapper
// Provides globe rendering foundation for satellite visualization
// Creates new Cesium.Viewer('cesiumContainer') on page load

// Use Cesium from global scope (loaded via CDN in index.html)
// Must use window.Cesium not import from 'cesium' per task requirements
const Cesium = window.Cesium;

// Config will be set by initGlobe or Globe constructor
let config = null;

// Country borders GeoJSON URL - using smaller simplified version (under 500KB)
// The full countries.geojson causes RangeError: Invalid array length
const COUNTRIES_GEOJSON_URL = 'https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json';

/**
 * Globe class - Wraps CesiumJS Viewer for satellite tracking visualization
 */
export class Globe {
  /**
   * Create a new Globe instance
   * @param {string|HTMLElement} container - DOM element or ID for the viewer
   * @param {Object} options - Optional configuration overrides
   * @param {Object} configObj - Configuration object with CESIUM_ION_TOKEN
   */
  constructor(container, options = {}, configObj = null) {
    // Use provided config or try to get from module-level config
    const cfg = configObj || config || {};

    // Set Cesium Ion access token for authentication
    // Uses CESIUM_ION_TOKEN from config.js as specified in task requirements
    if (cfg.CESIUM_ION_TOKEN) {
      Cesium.Ion.defaultAccessToken = cfg.CESIUM_ION_TOKEN;
    }

    // Store config reference for camera setup
    config = cfg;

    // Default viewer options - cinematic minimal UI
    // Hide all default Cesium UI for spy-thriller aesthetic
    // NOTE: Do NOT pass skyAtmosphere as option - it must be configured AFTER viewer creation
    const defaultOptions = {
      animation: false,
      baseLayerPicker: false,
      fullscreenButton: false,
      vrButton: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      sceneModePicker: false,
      selectionIndicator: false,
      timeline: false,
      navigationHelpButton: false,
      scene3DOnly: true,
      shouldAnimate: true,
      // Dark minimal background
      skyBox: false,
      contextOptions: {
        webgl: {
          alpha: false
        }
      }
    };

    // Merge user options with defaults
    const viewerOptions = { ...defaultOptions, ...options };

    // Initialize Cesium.Viewer
    this.viewer = new Cesium.Viewer(container, viewerOptions);

    // Cinematic scene configuration
    this._setupCinematicScene();

    // Configure default camera position from config
    this._setupCamera();

    // Store entity references for management
    this._entities = new Map();

    // Country borders data source
    this._bordersDataSource = null;
    this._bordersVisible = true;

    // Load country borders on init
    this._loadCountryBorders();
  }

  /**
   * Configure cinematic scene settings for spy-thriller aesthetic
   * Enables day/night lighting, atmosphere glow, and hides remaining UI elements
   * All operations wrapped in try/catch to gracefully handle version differences
   * @private
   */
  _setupCinematicScene() {
    const scene = this.viewer.scene;
    const globe = scene.globe;

    // Enable day/night lighting on the globe
    try {
      globe.enableLighting = true;
    } catch (e) {
      console.warn('Globe: Could not enable lighting:', e.message);
    }

    // Enable atmosphere glow - must check that skyAtmosphere is an object, not a boolean
    try {
      if (scene.skyAtmosphere && typeof scene.skyAtmosphere === 'object') {
        scene.skyAtmosphere.show = true;
        if ('brightnessShift' in scene.skyAtmosphere) {
          scene.skyAtmosphere.brightnessShift = 0.3;
        }
      }
    } catch (e) {
      console.warn('Globe: Could not configure sky atmosphere:', e.message);
    }

    // Dark blue/black background color
    try {
      scene.backgroundColor = Cesium.Color.fromCssColorString('#0a0a14');
    } catch (e) {
      console.warn('Globe: Could not set background color:', e.message);
    }

    // Fog for depth effect
    try {
      if (scene.fog) {
        scene.fog.enabled = true;
        scene.fog.density = 0.0001;
      }
    } catch (e) {
      console.warn('Globe: Could not configure fog:', e.message);
    }

    // High dynamic range for better visual quality
    try {
      scene.highDynamicRange = false;
    } catch (e) {
      console.warn('Globe: Could not set HDR mode:', e.message);
    }

    // Hide any remaining UI elements that might appear
    try {
      // Hide timeline if it exists
      if (this.viewer.timeline) {
        this.viewer.timeline.container.style.display = 'none';
      }
    } catch (e) {
      console.warn('Globe: Could not hide timeline:', e.message);
    }

    try {
      // Hide animation controller if it exists
      if (this.viewer.animation) {
        this.viewer.animation.container.style.display = 'none';
      }
    } catch (e) {
      console.warn('Globe: Could not hide animation:', e.message);
    }

    try {
      // Hide credit container
      if (this.viewer._cesiumWidget && this.viewer._cesiumWidget._creditContainer) {
        this.viewer._cesiumWidget._creditContainer.style.display = 'none';
      }
      // Alternative credit container hiding
      const creditContainer = this.viewer.cesiumWidget?.creditContainer;
      if (creditContainer) {
        creditContainer.style.display = 'none';
      }
    } catch (e) {
      console.warn('Globe: Could not hide credit container:', e.message);
    }
  }

  /**
   * Set up camera with default position from config
   * @private
   */
  _setupCamera() {
    const viewConfig = config.view || {};
    const latitude = viewConfig.defaultLatitude || 0;
    const longitude = viewConfig.defaultLongitude || 0;
    const height = viewConfig.defaultHeight || 20000000;

    this.viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(longitude, latitude, height),
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-90),
        roll: 0
      }
    });
  }

  /**
   * Add an entity to the globe
   * @param {string} id - Unique identifier for the entity
   * @param {Object} entityOptions - Cesium entity options
   * @returns {Cesium.Entity} The created entity
   */
  addEntity(id, entityOptions) {
    // Remove existing entity with same ID if present
    if (this._entities.has(id)) {
      this.removeEntity(id);
    }

    // Add entity to viewer
    const entity = this.viewer.entities.add({
      id: id,
      ...entityOptions
    });

    // Store reference
    this._entities.set(id, entity);

    return entity;
  }

  /**
   * Remove an entity from the globe
   * @param {string} id - Identifier of entity to remove
   * @returns {boolean} True if entity was removed, false if not found
   */
  removeEntity(id) {
    const entity = this._entities.get(id);
    if (entity) {
      this.viewer.entities.remove(entity);
      this._entities.delete(id);
      return true;
    }
    return false;
  }

  /**
   * Fly camera to a specific location
   * @param {Object} destination - Destination options
   * @param {number} destination.longitude - Longitude in degrees
   * @param {number} destination.latitude - Latitude in degrees
   * @param {number} [destination.height] - Height in meters (default: 10000000)
   * @param {number} [duration] - Flight duration in seconds (default: 3)
   * @returns {Promise} Resolves when flight completes
   */
  flyTo(destination, duration = 3) {
    const { longitude, latitude, height = 10000000 } = destination;

    return this.viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(longitude, latitude, height),
      duration: duration,
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-90),
        roll: 0
      }
    });
  }

  /**
   * Get the underlying Cesium Viewer instance
   * @returns {Cesium.Viewer}
   */
  getViewer() {
    return this.viewer;
  }

  /**
   * Get an entity by ID
   * @param {string} id - Entity identifier
   * @returns {Cesium.Entity|undefined}
   */
  getEntity(id) {
    return this._entities.get(id);
  }

  /**
   * Get all entity IDs
   * @returns {string[]}
   */
  getEntityIds() {
    return Array.from(this._entities.keys());
  }

  /**
   * Load country borders from GeoJSON
   * Styles borders with cyan stroke at 0.3 opacity, transparent fill
   * Uses simplified GeoJSON to avoid RangeError with large datasets
   * @private
   */
  async _loadCountryBorders() {
    try {
      console.log('[Globe] Loading country borders from simplified GeoJSON...');

      // Use clampToGround: false to avoid complex terrain processing
      // that can cause RangeError with large polygon arrays
      this._bordersDataSource = await Cesium.GeoJsonDataSource.load(COUNTRIES_GEOJSON_URL, {
        stroke: Cesium.Color.CYAN.withAlpha(0.3),
        fill: Cesium.Color.TRANSPARENT,
        strokeWidth: 1,
        clampToGround: false
      });

      this._bordersDataSource.name = 'countryBorders';
      this.viewer.dataSources.add(this._bordersDataSource);
      this._bordersDataSource.show = this._bordersVisible;

      console.log('[Globe] Country borders loaded successfully');
    } catch (error) {
      // Gracefully handle border loading failures - never kill the globe
      console.warn('[Globe] Failed to load country borders (non-fatal):', error.message);
      this._bordersDataSource = null;
      this._bordersVisible = false;
    }
  }

  /**
   * Toggle country borders visibility
   * @param {boolean} visible - Whether to show borders
   */
  setBordersVisible(visible) {
    try {
      this._bordersVisible = visible;
      if (this._bordersDataSource) {
        this._bordersDataSource.show = visible;
      }
    } catch (error) {
      // Never let border toggle crash the globe
      console.warn('[Globe] Failed to toggle borders visibility:', error.message);
    }
  }

  /**
   * Get current borders visibility state
   * @returns {boolean}
   */
  getBordersVisible() {
    return this._bordersVisible;
  }

  /**
   * Set map mode (imagery layer)
   * @param {string} mode - 'satellite', 'dark', or 'hybrid'
   */
  setMapMode(mode) {
    const scene = this.viewer.scene;
    const globe = scene.globe;
    const imageryLayers = this.viewer.imageryLayers;

    // Remove any CSS filter first
    const container = this.viewer.container;
    if (container) {
      container.style.filter = '';
    }

    switch (mode) {
      case 'dark':
        // Apply dark filter via CSS for dark mode effect
        if (container) {
          container.style.filter = 'brightness(0.4) saturate(0.3) hue-rotate(180deg) invert(1)';
        }
        break;
      case 'hybrid':
        // Hybrid: increase saturation slightly for enhanced colors
        if (container) {
          container.style.filter = 'saturate(1.2) contrast(1.1)';
        }
        break;
      case 'satellite':
      default:
        // Satellite: default imagery, no filter
        break;
    }

    console.log(`[Globe] Map mode set to: ${mode}`);
  }

  /**
   * Destroy the globe and clean up resources
   */
  destroy() {
    if (this.viewer && !this.viewer.isDestroyed()) {
      this.viewer.destroy();
    }
    this._entities.clear();
    this._bordersDataSource = null;
  }
}

export default Globe;
