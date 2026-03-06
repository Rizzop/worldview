// Globe Module - CesiumJS Viewer Wrapper
// Provides globe rendering foundation for satellite visualization
// Creates new Cesium.Viewer('cesiumContainer') on page load

// Use Cesium from global scope (loaded via CDN in index.html)
// Must use window.Cesium not import from 'cesium' per task requirements
const Cesium = window.Cesium;

// Config will be set by initGlobe or Globe constructor
let config = null;

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
      skyAtmosphere: true,
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
  }

  /**
   * Configure cinematic scene settings for spy-thriller aesthetic
   * Enables day/night lighting, atmosphere glow, and hides remaining UI elements
   * @private
   */
  _setupCinematicScene() {
    const scene = this.viewer.scene;
    const globe = scene.globe;

    // Enable day/night lighting on the globe
    globe.enableLighting = true;

    // Enable atmosphere glow
    scene.skyAtmosphere.show = true;
    scene.skyAtmosphere.brightnessShift = 0.3;

    // Dark blue/black background color
    scene.backgroundColor = Cesium.Color.fromCssColorString('#0a0a14');

    // Fog for depth effect
    scene.fog.enabled = true;
    scene.fog.density = 0.0001;

    // High dynamic range for better visual quality
    scene.highDynamicRange = false;

    // Hide any remaining UI elements that might appear
    // Hide timeline if it exists
    if (this.viewer.timeline) {
      this.viewer.timeline.container.style.display = 'none';
    }
    // Hide animation controller if it exists
    if (this.viewer.animation) {
      this.viewer.animation.container.style.display = 'none';
    }
    // Hide credit container
    if (this.viewer._cesiumWidget && this.viewer._cesiumWidget._creditContainer) {
      this.viewer._cesiumWidget._creditContainer.style.display = 'none';
    }
    // Alternative credit container hiding
    const creditContainer = this.viewer.cesiumWidget?.creditContainer;
    if (creditContainer) {
      creditContainer.style.display = 'none';
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
   * Destroy the globe and clean up resources
   */
  destroy() {
    if (this.viewer && !this.viewer.isDestroyed()) {
      this.viewer.destroy();
    }
    this._entities.clear();
  }
}

export default Globe;
