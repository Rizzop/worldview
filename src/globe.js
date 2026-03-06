// Globe Module - CesiumJS Viewer Wrapper
// Provides globe rendering foundation for satellite visualization

import * as Cesium from 'cesium';

// Import config, falling back to example if config.js doesn't exist
let config;
try {
  config = (await import('../config.js')).default;
} catch (e) {
  config = (await import('../config.example.js')).default;
}

/**
 * Globe class - Wraps CesiumJS Viewer for satellite tracking visualization
 */
export class Globe {
  /**
   * Create a new Globe instance
   * @param {string|HTMLElement} container - DOM element or ID for the viewer
   * @param {Object} options - Optional configuration overrides
   */
  constructor(container, options = {}) {
    // Set Cesium Ion access token for authentication
    // Uses config.CESIUM_ION_TOKEN as specified in task requirements
    Cesium.Ion.defaultAccessToken = config.CESIUM_ION_TOKEN;

    // Default viewer options
    const defaultOptions = {
      animation: false,
      baseLayerPicker: false,
      fullscreenButton: false,
      vrButton: false,
      geocoder: false,
      homeButton: true,
      infoBox: true,
      sceneModePicker: true,
      selectionIndicator: true,
      timeline: false,
      navigationHelpButton: false,
      scene3DOnly: false,
      shouldAnimate: true
    };

    // Merge user options with defaults
    const viewerOptions = { ...defaultOptions, ...options };

    // Initialize Cesium.Viewer
    this.viewer = new Cesium.Viewer(container, viewerOptions);

    // Configure default camera position from config
    this._setupCamera();

    // Store entity references for management
    this._entities = new Map();
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
