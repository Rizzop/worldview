/**
 * UI Controls Panel - Layer Toggles, Visual Modes, and Opacity
 * Provides DOM-based control panel for globe visualization settings.
 * Follows event-driven pattern for integration with other components.
 */

/**
 * Simple EventEmitter for event-driven communication
 * @private
 */
class EventEmitter {
  constructor() {
    this._events = new Map();
  }

  /**
   * Register an event listener
   * @param {string} event - Event name
   * @param {Function} listener - Callback function
   */
  on(event, listener) {
    if (!this._events.has(event)) {
      this._events.set(event, []);
    }
    this._events.get(event).push(listener);
  }

  /**
   * Remove an event listener
   * @param {string} event - Event name
   * @param {Function} listener - Callback function to remove
   */
  off(event, listener) {
    if (!this._events.has(event)) return;
    const listeners = this._events.get(event);
    const index = listeners.indexOf(listener);
    if (index > -1) {
      listeners.splice(index, 1);
    }
  }

  /**
   * Emit an event to all listeners
   * @param {string} event - Event name
   * @param {*} data - Event data
   */
  emit(event, data) {
    if (!this._events.has(event)) return;
    for (const listener of this._events.get(event)) {
      try {
        listener(data);
      } catch (e) {
        // Prevent listener errors from breaking other listeners
      }
    }
  }
}

/**
 * Available layer types for toggle switches
 * News layer added for GDELT conflict events
 */
const LAYER_TYPES = ['satellites', 'flights', 'military', 'seismic', 'traffic', 'cctv', 'news'];

/**
 * Available visual modes for dropdown
 */
const VISUAL_MODES = ['none', 'nvg', 'flir', 'crt'];

/**
 * Controls class - UI control panel for globe visualization
 * Emits events: 'layerToggle', 'modeChange', 'opacityChange'
 */
export class Controls extends EventEmitter {
  /**
   * Create a new Controls instance
   * @param {Object} options - Configuration options
   * @param {string|HTMLElement} [options.container] - Container element or ID for the panel
   * @param {Object} [options.layers] - Initial layer visibility states
   * @param {string} [options.mode] - Initial visual mode ('none', 'nvg', 'flir', 'crt')
   * @param {number} [options.opacity] - Initial opacity (0-100)
   */
  constructor(options = {}) {
    super();

    this.container = null;
    this.panel = null;
    this._domAvailable = this._checkDOMAvailable();

    // Initialize state
    this._layerStates = {};
    for (const layer of LAYER_TYPES) {
      this._layerStates[layer] = options.layers?.[layer] ?? true;
    }

    this._visualMode = options.mode || 'none';
    this._opacity = options.opacity ?? 100;

    // Store DOM element references
    this._toggleElements = {};
    this._modeDropdown = null;
    this._opacitySlider = null;

    // If container provided and DOM available, render immediately
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
   * Get current layer states
   * @returns {Object} Map of layer name to enabled state
   */
  getLayerStates() {
    return { ...this._layerStates };
  }

  /**
   * Get a specific layer's enabled state
   * @param {string} layer - Layer name
   * @returns {boolean}
   */
  isLayerEnabled(layer) {
    return this._layerStates[layer] ?? false;
  }

  /**
   * Set a layer's enabled state
   * @param {string} layer - Layer name
   * @param {boolean} enabled - Whether to enable the layer
   */
  setLayerEnabled(layer, enabled) {
    if (!LAYER_TYPES.includes(layer)) {
      return;
    }

    const wasEnabled = this._layerStates[layer];
    this._layerStates[layer] = enabled;

    // Update DOM if available
    if (this._toggleElements[layer]) {
      this._toggleElements[layer].checked = enabled;
    }

    // Only emit if state actually changed
    if (wasEnabled !== enabled) {
      this.emit('layerToggle', { layer, enabled });
    }
  }

  /**
   * Toggle a layer's enabled state
   * @param {string} layer - Layer name
   * @returns {boolean} New enabled state
   */
  toggleLayer(layer) {
    const newState = !this._layerStates[layer];
    this.setLayerEnabled(layer, newState);
    return newState;
  }

  /**
   * Get current visual mode
   * @returns {string} Current mode ('none', 'nvg', 'flir', 'crt')
   */
  getVisualMode() {
    return this._visualMode;
  }

  /**
   * Set visual mode
   * @param {string} mode - Visual mode ('none', 'nvg', 'flir', 'crt')
   */
  setVisualMode(mode) {
    if (!VISUAL_MODES.includes(mode)) {
      return;
    }

    const previousMode = this._visualMode;
    this._visualMode = mode;

    // Update DOM if available
    if (this._modeDropdown) {
      this._modeDropdown.value = mode;
    }

    // Only emit if mode actually changed
    if (previousMode !== mode) {
      this.emit('modeChange', { mode, previousMode });
    }
  }

  /**
   * Get current opacity value
   * @returns {number} Opacity (0-100)
   */
  getOpacity() {
    return this._opacity;
  }

  /**
   * Set opacity value
   * @param {number} opacity - Opacity value (0-100)
   */
  setOpacity(opacity) {
    // Clamp to valid range
    const clampedOpacity = Math.max(0, Math.min(100, opacity));
    const previousOpacity = this._opacity;
    this._opacity = clampedOpacity;

    // Update DOM if available
    if (this._opacitySlider) {
      this._opacitySlider.value = clampedOpacity;
    }

    // Update label if available
    const label = this.panel?.querySelector('.opacity-value');
    if (label) {
      label.textContent = `${clampedOpacity}%`;
    }

    // Only emit if opacity actually changed
    if (previousOpacity !== clampedOpacity) {
      this.emit('opacityChange', { opacity: clampedOpacity, previousOpacity });
    }
  }

  /**
   * Render the control panel to the DOM
   * @param {string|HTMLElement} container - Container element or ID
   * @returns {HTMLElement|null} The created panel element, or null if DOM unavailable
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
      // Create container if it doesn't exist
      this.container = document.createElement('div');
      this.container.id = 'controlsContainer';
      this.container.className = 'controlsContainer';
      document.body.appendChild(this.container);
    }

    // Ensure container has proper class for styling
    this.container.classList.add('controlsContainer');

    // Create panel element
    this.panel = document.createElement('div');
    this.panel.className = 'controls-panel';
    this.panel.setAttribute('role', 'region');
    this.panel.setAttribute('aria-label', 'Globe Controls');

    // Build panel HTML
    this.panel.innerHTML = this._buildPanelHTML();

    // Append to container
    this.container.appendChild(this.panel);

    // Bind event handlers
    this._bindEventHandlers();

    return this.panel;
  }

  /**
   * Build the panel HTML structure
   * @private
   * @returns {string} HTML string
   */
  _buildPanelHTML() {
    const layerTogglesHTML = LAYER_TYPES.map(layer => `
      <div class="control-row">
        <label class="toggle-label" for="toggle-${layer}">
          <input type="checkbox"
                 id="toggle-${layer}"
                 class="layer-toggle"
                 data-layer="${layer}"
                 ${this._layerStates[layer] ? 'checked' : ''}>
          <span class="toggle-text">${this._formatLayerName(layer)}</span>
        </label>
      </div>
    `).join('');

    const modeOptionsHTML = VISUAL_MODES.map(mode => `
      <option value="${mode}" ${this._visualMode === mode ? 'selected' : ''}>
        ${this._formatModeName(mode)}
      </option>
    `).join('');

    return `
      <div class="controls-section">
        <h3 class="section-title">Layers</h3>
        ${layerTogglesHTML}
      </div>
      <div class="controls-section">
        <h3 class="section-title">Visual Mode</h3>
        <div class="control-row">
          <select id="visual-mode-select" class="mode-dropdown">
            ${modeOptionsHTML}
          </select>
        </div>
      </div>
      <div class="controls-section">
        <h3 class="section-title">Opacity</h3>
        <div class="control-row opacity-row">
          <input type="range"
                 id="opacity-slider"
                 class="opacity-slider"
                 min="0"
                 max="100"
                 value="${this._opacity}">
          <span class="opacity-value">${this._opacity}%</span>
        </div>
      </div>
    `;
  }

  /**
   * Format layer name for display
   * @private
   * @param {string} layer - Layer name
   * @returns {string} Formatted name
   */
  _formatLayerName(layer) {
    return layer.charAt(0).toUpperCase() + layer.slice(1);
  }

  /**
   * Format mode name for display
   * @private
   * @param {string} mode - Mode name
   * @returns {string} Formatted name
   */
  _formatModeName(mode) {
    const modeNames = {
      none: 'None',
      nvg: 'Night Vision (NVG)',
      flir: 'Thermal (FLIR)',
      crt: 'CRT Monitor'
    };
    return modeNames[mode] || mode;
  }

  /**
   * Bind event handlers to DOM elements
   * @private
   */
  _bindEventHandlers() {
    if (!this.panel) return;

    // Layer toggle handlers
    const toggles = this.panel.querySelectorAll('.layer-toggle');
    for (const toggle of toggles) {
      const layer = toggle.dataset.layer;
      this._toggleElements[layer] = toggle;

      toggle.addEventListener('change', (e) => {
        this._layerStates[layer] = e.target.checked;
        this.emit('layerToggle', { layer, enabled: e.target.checked });
      });
    }

    // Mode dropdown handler
    this._modeDropdown = this.panel.querySelector('#visual-mode-select');
    if (this._modeDropdown) {
      this._modeDropdown.addEventListener('change', (e) => {
        const previousMode = this._visualMode;
        this._visualMode = e.target.value;
        this.emit('modeChange', { mode: e.target.value, previousMode });
      });
    }

    // Opacity slider handler
    this._opacitySlider = this.panel.querySelector('#opacity-slider');
    const opacityLabel = this.panel.querySelector('.opacity-value');

    if (this._opacitySlider) {
      this._opacitySlider.addEventListener('input', (e) => {
        const previousOpacity = this._opacity;
        this._opacity = parseInt(e.target.value, 10);
        if (opacityLabel) {
          opacityLabel.textContent = `${this._opacity}%`;
        }
        this.emit('opacityChange', { opacity: this._opacity, previousOpacity });
      });
    }
  }

  /**
   * Remove the control panel from the DOM
   */
  destroy() {
    if (this.panel && this.panel.parentNode) {
      this.panel.parentNode.removeChild(this.panel);
    }
    this.panel = null;
    this.container = null;
    this._toggleElements = {};
    this._modeDropdown = null;
    this._opacitySlider = null;
    this._events.clear();
  }
}

// Export constants for external use
export { LAYER_TYPES, VISUAL_MODES };

export default Controls;
