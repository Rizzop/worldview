// Shader Manager - Post-Processing Pipeline
// Manages GLSL shaders and Cesium post-processing stages

/**
 * ShaderManager class - Manages post-processing shader effects
 * Loads GLSL shader files and creates Cesium PostProcessStage instances
 */
export class ShaderManager {
  /**
   * Create a new ShaderManager instance
   * @param {Cesium.Viewer} viewer - Cesium viewer instance
   */
  constructor(viewer) {
    if (!viewer) {
      throw new Error('ShaderManager requires a Cesium Viewer instance');
    }

    this.viewer = viewer;
    this.postProcessStages = new Map();
    this.shaderSources = new Map();
    this.activeMode = 'none';
    this._startTime = Date.now();
  }

  /**
   * Load GLSL shader source from file
   * @param {string} name - Shader name (e.g., 'nvg', 'flir', 'crt')
   * @param {string} url - URL to the GLSL file
   * @returns {Promise<string>} Shader source code
   */
  async loadShader(name, url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load shader ${name}: ${response.statusText}`);
    }
    const source = await response.text();
    this.shaderSources.set(name, source);
    return source;
  }

  /**
   * Load all standard shaders from src/shaders/
   * @param {string} [basePath='src/shaders/'] - Base path to shader files
   * @returns {Promise<void>}
   */
  async loadAllShaders(basePath = 'src/shaders/') {
    const shaderFiles = {
      nvg: `${basePath}nvg.glsl`,
      flir: `${basePath}flir.glsl`,
      crt: `${basePath}crt.glsl`
    };

    const loadPromises = Object.entries(shaderFiles).map(([name, url]) =>
      this.loadShader(name, url)
    );

    await Promise.all(loadPromises);
  }

  /**
   * Create a Cesium PostProcessStage from loaded shader
   * @param {string} name - Shader name
   * @param {Object} [uniforms={}] - Additional uniform values
   * @returns {Cesium.PostProcessStage}
   */
  createStage(name, uniforms = {}) {
    const shaderSource = this.shaderSources.get(name);
    if (!shaderSource) {
      throw new Error(`Shader '${name}' not loaded. Call loadShader first.`);
    }

    // Get Cesium from the viewer's scene
    const Cesium = this.viewer.scene.constructor.prototype.constructor.__proto__;

    // Default uniforms based on shader type
    const defaultUniforms = this._getDefaultUniforms(name);
    const mergedUniforms = { ...defaultUniforms, ...uniforms };

    // Create PostProcessStage
    const stage = new this.viewer.scene.postProcessStages.constructor.prototype.constructor(
      // Use the scene's PostProcessStage constructor
    );

    // Access Cesium PostProcessStage through the viewer
    const PostProcessStage = this._getPostProcessStageConstructor();

    const postProcessStage = new PostProcessStage({
      fragmentShader: shaderSource,
      uniforms: mergedUniforms
    });

    this.postProcessStages.set(name, postProcessStage);
    return postProcessStage;
  }

  /**
   * Get the PostProcessStage constructor from Cesium
   * @private
   * @returns {Function} PostProcessStage constructor
   */
  _getPostProcessStageConstructor() {
    // In browser environment, Cesium is available globally or through import
    if (typeof Cesium !== 'undefined' && Cesium.PostProcessStage) {
      return Cesium.PostProcessStage;
    }
    // Fallback: try to get it from the viewer's scene
    const scene = this.viewer.scene;
    if (scene.postProcessStages && scene.postProcessStages.add) {
      // Return a proxy constructor that works with the scene
      return class PostProcessStageProxy {
        constructor(options) {
          this.fragmentShader = options.fragmentShader;
          this.uniforms = options.uniforms || {};
          this.enabled = true;
        }
      };
    }
    throw new Error('Could not find Cesium.PostProcessStage');
  }

  /**
   * Get default uniforms for a shader type
   * @private
   * @param {string} name - Shader name
   * @returns {Object} Default uniform values
   */
  _getDefaultUniforms(name) {
    const baseUniforms = {
      u_time: () => (Date.now() - this._startTime) / 1000.0,
      u_resolution: () => {
        const canvas = this.viewer.scene.canvas;
        return { x: canvas.width, y: canvas.height };
      }
    };

    switch (name) {
      case 'nvg':
        return {
          ...baseUniforms,
          u_intensity: 1.0
        };
      case 'flir':
        return {
          ...baseUniforms,
          u_intensity: 1.0
        };
      case 'crt':
        return {
          ...baseUniforms,
          u_scanlineIntensity: 0.7
        };
      default:
        return baseUniforms;
    }
  }

  /**
   * Apply a shader mode to the scene
   * Switches active post-processing stage
   * @param {string} mode - Shader mode: 'none', 'nvg', 'flir', 'crt'
   */
  applyShader(mode) {
    const validModes = ['none', 'nvg', 'flir', 'crt'];
    if (!validModes.includes(mode)) {
      throw new Error(`Invalid shader mode: ${mode}. Valid modes: ${validModes.join(', ')}`);
    }

    // Disable all current post-process stages first
    this._disableAllStages();

    // If mode is 'none', just leave all stages disabled
    if (mode === 'none') {
      this.activeMode = 'none';
      return;
    }

    // Enable the requested shader stage
    let stage = this.postProcessStages.get(mode);

    // If stage doesn't exist yet, create it
    if (!stage && this.shaderSources.has(mode)) {
      stage = this._createAndAddStage(mode);
    }

    if (stage) {
      stage.enabled = true;
      this.activeMode = mode;
    } else {
      throw new Error(`Shader '${mode}' not available. Load shaders first.`);
    }
  }

  /**
   * Create a stage and add it to the scene's post-process stages
   * @private
   * @param {string} name - Shader name
   * @returns {Cesium.PostProcessStage}
   */
  _createAndAddStage(name) {
    const shaderSource = this.shaderSources.get(name);
    if (!shaderSource) {
      return null;
    }

    const uniforms = this._getDefaultUniforms(name);

    // Create the stage using Cesium's PostProcessStage
    // In browser, Cesium will be available globally
    const stage = this.viewer.scene.postProcessStages.add(
      new (this._getPostProcessStageClass())({
        fragmentShader: shaderSource,
        uniforms: uniforms
      })
    );

    this.postProcessStages.set(name, stage);
    return stage;
  }

  /**
   * Get the PostProcessStage class
   * @private
   * @returns {Function} PostProcessStage class
   */
  _getPostProcessStageClass() {
    // Try global Cesium first (browser environment)
    if (typeof Cesium !== 'undefined' && Cesium.PostProcessStage) {
      return Cesium.PostProcessStage;
    }
    // For module environments, it should be imported
    throw new Error('Cesium.PostProcessStage not available');
  }

  /**
   * Disable all post-processing stages
   * @private
   */
  _disableAllStages() {
    for (const [name, stage] of this.postProcessStages) {
      if (stage && typeof stage.enabled !== 'undefined') {
        stage.enabled = false;
      }
    }
  }

  /**
   * Get the currently active shader mode
   * @returns {string} Current mode: 'none', 'nvg', 'flir', 'crt'
   */
  getActiveMode() {
    return this.activeMode;
  }

  /**
   * Check if a shader is loaded
   * @param {string} name - Shader name
   * @returns {boolean}
   */
  hasShader(name) {
    return this.shaderSources.has(name);
  }

  /**
   * Get list of loaded shader names
   * @returns {string[]}
   */
  getLoadedShaders() {
    return Array.from(this.shaderSources.keys());
  }

  /**
   * Set a uniform value for a specific shader
   * @param {string} shaderName - Shader name
   * @param {string} uniformName - Uniform name
   * @param {*} value - Uniform value
   */
  setUniform(shaderName, uniformName, value) {
    const stage = this.postProcessStages.get(shaderName);
    if (stage && stage.uniforms) {
      stage.uniforms[uniformName] = value;
    }
  }

  /**
   * Destroy all stages and clean up resources
   */
  destroy() {
    // Remove all stages from the scene
    for (const [name, stage] of this.postProcessStages) {
      try {
        this.viewer.scene.postProcessStages.remove(stage);
      } catch (e) {
        // Stage may not have been added to scene
      }
    }

    this.postProcessStages.clear();
    this.shaderSources.clear();
    this.activeMode = 'none';
  }
}

export default ShaderManager;
