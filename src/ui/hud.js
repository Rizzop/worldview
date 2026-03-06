/**
 * HUD Status Overlay - Heads-Up Display
 * Shows FPS counter, data freshness per layer, active layer count, and connection status.
 * Updates efficiently (not on every frame for text updates).
 */

/**
 * Format a duration in milliseconds to human-readable string
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration (e.g., "23s", "5m", "1h")
 */
function formatDuration(ms) {
  if (ms < 0 || !Number.isFinite(ms)) {
    return 'N/A';
  }

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${seconds}s`;
}

/**
 * HUD class - Heads-up display overlay for globe visualization
 * Displays real-time stats: FPS, layer freshness, active layer count, connection status, military count
 */
export class HUD {
  /**
   * Create a new HUD instance
   * @param {Object} options - Configuration options
   * @param {string|HTMLElement} [options.container] - Container element or ID
   * @param {Object} [options.layers] - Map of layer name to layer instance (with lastFetch property)
   * @param {number} [options.updateInterval] - Text update interval in ms (default: 1000)
   */
  constructor(options = {}) {
    this.container = null;
    this.element = null;
    this._domAvailable = this._checkDOMAvailable();

    // Layer references for freshness tracking
    this._layers = options.layers || {};

    // FPS tracking
    this._frameCount = 0;
    this._lastFpsUpdate = 0;
    this._currentFps = 0;
    this._fpsAnimationId = null;

    // Update interval for text updates (default 1 second)
    this._updateInterval = options.updateInterval || 1000;
    this._updateTimerId = null;

    // Connection status
    this._connectionStatus = 'connected';

    // Military aircraft count
    this._militaryCount = 0;

    // DOM element references
    this._fpsElement = null;
    this._layerCountElement = null;
    this._connectionElement = null;
    this._freshnessContainer = null;
    this._militaryCountElement = null;

    // Render immediately if container provided
    if (options.container && this._domAvailable) {
      this.render(options.container);
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
   * Register a layer for freshness tracking
   * @param {string} name - Display name for the layer
   * @param {Object} layer - Layer instance with lastFetch property
   */
  registerLayer(name, layer) {
    this._layers[name] = layer;
    this._updateFreshness();
  }

  /**
   * Unregister a layer from freshness tracking
   * @param {string} name - Layer name to remove
   */
  unregisterLayer(name) {
    delete this._layers[name];
    this._updateFreshness();
  }

  /**
   * Set the connection status
   * @param {string} status - Connection status ('connected', 'disconnected', 'reconnecting')
   */
  setConnectionStatus(status) {
    this._connectionStatus = status;
    this._updateConnectionDisplay();
  }

  /**
   * Get current FPS value
   * @returns {number}
   */
  getFPS() {
    return this._currentFps;
  }

  /**
   * Get active layer count
   * @returns {number}
   */
  getActiveLayerCount() {
    return Object.keys(this._layers).length;
  }

  /**
   * Get connection status
   * @returns {string}
   */
  getConnectionStatus() {
    return this._connectionStatus;
  }

  /**
   * Set military aircraft count
   * @param {number} count - Number of military aircraft
   */
  setMilitaryCount(count) {
    this._militaryCount = count;
    this._updateMilitaryDisplay();
  }

  /**
   * Get military aircraft count
   * @returns {number}
   */
  getMilitaryCount() {
    return this._militaryCount;
  }

  /**
   * Render the HUD to the DOM
   * @param {string|HTMLElement} container - Container element or ID
   * @returns {HTMLElement|null} The created HUD element, or null if DOM unavailable
   */
  render(container) {
    if (!this._domAvailable) {
      return null;
    }

    // Resolve container element
    if (typeof container === 'string') {
      this.container = document.getElementById(container);
    } else {
      this.container = container;
    }

    if (!this.container) {
      return null;
    }

    // Create HUD element
    this.element = document.createElement('div');
    this.element.className = 'hud-overlay';
    this.element.setAttribute('role', 'status');
    this.element.setAttribute('aria-label', 'System Status');
    this.element.setAttribute('aria-live', 'polite');

    // Build HUD HTML
    this.element.innerHTML = this._buildHUDHTML();

    // Append to container
    this.container.appendChild(this.element);

    // Cache element references
    this._fpsElement = this.element.querySelector('.hud-fps-value');
    this._layerCountElement = this.element.querySelector('.hud-layer-count-value');
    this._connectionElement = this.element.querySelector('.hud-connection-value');
    this._freshnessContainer = this.element.querySelector('.hud-freshness-list');
    this._militaryCountElement = this.element.querySelector('.hud-military-value');

    // Start FPS tracking
    this._startFPSTracking();

    // Start periodic updates
    this._startPeriodicUpdates();

    return this.element;
  }

  /**
   * Build the HUD HTML structure
   * @private
   * @returns {string} HTML string
   */
  _buildHUDHTML() {
    return `
      <div class="hud-section hud-fps">
        <span class="hud-label">FPS:</span>
        <span class="hud-fps-value">0</span>
      </div>
      <div class="hud-section hud-layers">
        <span class="hud-label">Layers:</span>
        <span class="hud-layer-count-value">0</span>
      </div>
      <div class="hud-section hud-military">
        <span class="hud-label">MIL:</span>
        <span class="hud-military-value">0</span>
        <span class="hud-military-suffix">active</span>
      </div>
      <div class="hud-section hud-connection">
        <span class="hud-label">Status:</span>
        <span class="hud-connection-value" data-status="connected">Connected</span>
      </div>
      <div class="hud-section hud-freshness">
        <div class="hud-freshness-list"></div>
      </div>
    `;
  }

  /**
   * Start FPS tracking using requestAnimationFrame
   * @private
   */
  _startFPSTracking() {
    if (!this._domAvailable || typeof requestAnimationFrame === 'undefined') {
      return;
    }

    this._lastFpsUpdate = performance.now();
    this._frameCount = 0;

    const trackFrame = (timestamp) => {
      this._frameCount++;

      // Update FPS every second
      const elapsed = timestamp - this._lastFpsUpdate;
      if (elapsed >= 1000) {
        this._currentFps = Math.round((this._frameCount * 1000) / elapsed);
        this._frameCount = 0;
        this._lastFpsUpdate = timestamp;

        // Update display
        if (this._fpsElement) {
          this._fpsElement.textContent = this._currentFps;
        }
      }

      this._fpsAnimationId = requestAnimationFrame(trackFrame);
    };

    this._fpsAnimationId = requestAnimationFrame(trackFrame);
  }

  /**
   * Stop FPS tracking
   * @private
   */
  _stopFPSTracking() {
    if (this._fpsAnimationId && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this._fpsAnimationId);
      this._fpsAnimationId = null;
    }
  }

  /**
   * Start periodic updates for non-FPS elements
   * @private
   */
  _startPeriodicUpdates() {
    if (!this._domAvailable || typeof setInterval === 'undefined') {
      return;
    }

    // Update every interval
    this._updateTimerId = setInterval(() => {
      this.update();
    }, this._updateInterval);

    // Initial update
    this.update();
  }

  /**
   * Stop periodic updates
   * @private
   */
  _stopPeriodicUpdates() {
    if (this._updateTimerId && typeof clearInterval !== 'undefined') {
      clearInterval(this._updateTimerId);
      this._updateTimerId = null;
    }
  }

  /**
   * Update all HUD displays (called periodically)
   */
  update() {
    this._updateLayerCount();
    this._updateFreshness();
    this._updateConnectionDisplay();
    this._updateMilitaryDisplay();
  }

  /**
   * Update military aircraft count display
   * @private
   */
  _updateMilitaryDisplay() {
    if (this._militaryCountElement) {
      this._militaryCountElement.textContent = this._militaryCount;
    }
  }

  /**
   * Update layer count display
   * @private
   */
  _updateLayerCount() {
    if (this._layerCountElement) {
      this._layerCountElement.textContent = this.getActiveLayerCount();
    }
  }

  /**
   * Update data freshness display for all layers
   * @private
   */
  _updateFreshness() {
    if (!this._freshnessContainer) {
      return;
    }

    const layerNames = Object.keys(this._layers);

    if (layerNames.length === 0) {
      this._freshnessContainer.innerHTML = '<div class="hud-freshness-item">No layers</div>';
      return;
    }

    const now = Date.now();
    const freshnessItems = layerNames.map(name => {
      const layer = this._layers[name];
      let freshnessText = 'N/A';

      if (layer && layer.lastFetch) {
        const lastFetchTime = layer.lastFetch instanceof Date
          ? layer.lastFetch.getTime()
          : layer.lastFetch;
        const elapsed = now - lastFetchTime;
        freshnessText = `${formatDuration(elapsed)} ago`;
      }

      return `<div class="hud-freshness-item">${name}: ${freshnessText}</div>`;
    });

    this._freshnessContainer.innerHTML = freshnessItems.join('');
  }

  /**
   * Update connection status display
   * @private
   */
  _updateConnectionDisplay() {
    if (!this._connectionElement) {
      return;
    }

    const statusLabels = {
      connected: 'Connected',
      disconnected: 'Disconnected',
      reconnecting: 'Reconnecting...'
    };

    this._connectionElement.textContent = statusLabels[this._connectionStatus] || this._connectionStatus;
    this._connectionElement.setAttribute('data-status', this._connectionStatus);
  }

  /**
   * Remove the HUD from the DOM and clean up
   */
  destroy() {
    // Stop tracking
    this._stopFPSTracking();
    this._stopPeriodicUpdates();

    // Remove from DOM
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }

    // Clear references
    this.element = null;
    this.container = null;
    this._fpsElement = null;
    this._layerCountElement = null;
    this._connectionElement = null;
    this._freshnessContainer = null;
    this._militaryCountElement = null;
    this._layers = {};
  }
}

// Export formatDuration for external use
export { formatDuration };

export default HUD;
