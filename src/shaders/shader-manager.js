// Shader Manager - Post-Processing Pipeline for Cesium
// Manages visual mode effects: Night Vision (NVG), FLIR Thermal, CRT Monitor

// Get Cesium from global scope
const Cesium = (typeof window !== 'undefined' && window.Cesium) ||
               (typeof globalThis !== 'undefined' && globalThis.Cesium) ||
               null;

/**
 * Night Vision (NVG) shader - Green phosphor with noise grain
 * Uses Cesium's built-in v_textureCoordinates and czm_textureCube
 */
const NVG_SHADER = `
  uniform sampler2D colorTexture;
  uniform float u_time;
  uniform float u_intensity;

  in vec2 v_textureCoordinates;

  // Pseudo-random noise function
  float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
  }

  void main() {
    vec4 sceneColor = texture(colorTexture, v_textureCoordinates);

    // Calculate luminance
    float luminance = dot(sceneColor.rgb, vec3(0.299, 0.587, 0.114));

    // Night vision green tint
    vec3 nvgGreen = vec3(0.1, 1.0, 0.2);
    vec3 nvgColor = nvgGreen * luminance;

    // Add grain noise
    float noise = random(v_textureCoordinates + vec2(u_time * 10.0, u_time * 5.0));
    nvgColor += (noise - 0.5) * 0.1 * u_intensity;

    // Scanline effect
    float scanline = sin(v_textureCoordinates.y * 800.0 + u_time * 10.0) * 0.5 + 0.5;
    nvgColor *= mix(1.0, scanline * 0.15 + 0.85, u_intensity * 0.5);

    // Vignette
    vec2 center = v_textureCoordinates - 0.5;
    float dist = length(center);
    float vig = 1.0 - smoothstep(0.3, 0.9, dist);
    nvgColor *= mix(1.0, vig, u_intensity);

    // Brightness boost
    nvgColor *= 1.0 + 0.3 * u_intensity;

    // Mix with original based on intensity
    vec3 finalColor = mix(sceneColor.rgb, nvgColor, u_intensity);
    finalColor = clamp(finalColor, 0.0, 1.0);

    out_FragColor = vec4(finalColor, sceneColor.a);
  }
`;

/**
 * FLIR Thermal shader - Ironbow colormap
 */
const FLIR_SHADER = `
  uniform sampler2D colorTexture;
  uniform float u_time;
  uniform float u_intensity;

  in vec2 v_textureCoordinates;

  // Ironbow colormap
  vec3 ironbow(float t) {
    t = clamp(t, 0.0, 1.0);
    vec3 color;

    if (t < 0.2) {
      float s = t / 0.2;
      color = mix(vec3(0.0, 0.0, 0.3), vec3(0.5, 0.0, 0.5), s);
    } else if (t < 0.4) {
      float s = (t - 0.2) / 0.2;
      color = mix(vec3(0.5, 0.0, 0.5), vec3(0.8, 0.0, 0.0), s);
    } else if (t < 0.6) {
      float s = (t - 0.4) / 0.2;
      color = mix(vec3(0.8, 0.0, 0.0), vec3(1.0, 0.5, 0.0), s);
    } else if (t < 0.8) {
      float s = (t - 0.6) / 0.2;
      color = mix(vec3(1.0, 0.5, 0.0), vec3(1.0, 1.0, 0.0), s);
    } else {
      float s = (t - 0.8) / 0.2;
      color = mix(vec3(1.0, 1.0, 0.0), vec3(1.0, 1.0, 1.0), s);
    }
    return color;
  }

  void main() {
    vec4 sceneColor = texture(colorTexture, v_textureCoordinates);

    // Calculate luminance as temperature
    float luminance = dot(sceneColor.rgb, vec3(0.299, 0.587, 0.114));
    float temperature = pow(luminance, 1.0 / (0.5 + u_intensity * 0.5));
    temperature = clamp(temperature, 0.0, 1.0);

    // Apply ironbow colormap
    vec3 thermalColor = ironbow(temperature);

    // Add subtle noise for sensor effect
    float noise = fract(sin(dot(v_textureCoordinates + u_time * 0.01, vec2(12.9898, 78.233))) * 43758.5453);
    thermalColor += (noise - 0.5) * 0.02;

    // Mix with original based on intensity
    vec3 finalColor = mix(sceneColor.rgb, thermalColor, u_intensity);
    finalColor = clamp(finalColor, 0.0, 1.0);

    out_FragColor = vec4(finalColor, sceneColor.a);
  }
`;

/**
 * CRT Monitor shader - Scanlines, vignette, chromatic aberration
 */
const CRT_SHADER = `
  uniform sampler2D colorTexture;
  uniform float u_time;
  uniform float u_scanlineIntensity;

  in vec2 v_textureCoordinates;

  void main() {
    vec2 uv = v_textureCoordinates;

    // Barrel distortion
    vec2 centered = uv - 0.5;
    float dist = length(centered);
    float factor = 1.0 + dist * dist * 0.1;
    vec2 distortedUV = centered * factor + 0.5;

    // Check bounds
    if (distortedUV.x < 0.0 || distortedUV.x > 1.0 || distortedUV.y < 0.0 || distortedUV.y > 1.0) {
      out_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }

    // Chromatic aberration
    vec2 direction = normalize(centered + 0.0001);
    float aberration = 0.003 * dist;
    float r = texture(colorTexture, distortedUV + direction * aberration).r;
    float g = texture(colorTexture, distortedUV).g;
    float b = texture(colorTexture, distortedUV - direction * aberration).b;
    vec3 color = vec3(r, g, b);

    // Scanlines
    float scanline = sin(distortedUV.y * 800.0 * 3.14159) * 0.5 + 0.5;
    scanline = pow(scanline, 1.5);
    float flicker = 1.0 + sin(u_time * 8.0) * 0.01;
    color *= mix(1.0, scanline, u_scanlineIntensity * 0.3) * flicker;

    // Vignette
    float vig = 1.0 - smoothstep(0.4, 0.9, dist);
    vig = pow(vig, 0.8);
    color *= vig;

    // Boost contrast
    color = (color - 0.5) * 1.1 + 0.5;
    color = clamp(color, 0.0, 1.0);

    out_FragColor = vec4(color, 1.0);
  }
`;

/**
 * ShaderManager class - Manages post-processing shader effects
 * Creates Cesium PostProcessStage instances for visual modes
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
    this.activeMode = 'none';
    this._startTime = Date.now();

    // Pre-create all shader stages
    this._initializeStages();
  }

  /**
   * Initialize all post-processing stages
   * @private
   */
  _initializeStages() {
    if (!Cesium || !Cesium.PostProcessStage) {
      console.warn('[ShaderManager] Cesium.PostProcessStage not available');
      return;
    }

    try {
      // Create NVG stage
      const nvgStage = new Cesium.PostProcessStage({
        fragmentShader: NVG_SHADER,
        uniforms: {
          u_time: () => (Date.now() - this._startTime) / 1000.0,
          u_intensity: 1.0
        }
      });
      nvgStage.enabled = false;
      this.viewer.scene.postProcessStages.add(nvgStage);
      this.postProcessStages.set('nvg', nvgStage);
      console.log('[ShaderManager] NVG stage created');

      // Create FLIR stage
      const flirStage = new Cesium.PostProcessStage({
        fragmentShader: FLIR_SHADER,
        uniforms: {
          u_time: () => (Date.now() - this._startTime) / 1000.0,
          u_intensity: 1.0
        }
      });
      flirStage.enabled = false;
      this.viewer.scene.postProcessStages.add(flirStage);
      this.postProcessStages.set('flir', flirStage);
      console.log('[ShaderManager] FLIR stage created');

      // Create CRT stage
      const crtStage = new Cesium.PostProcessStage({
        fragmentShader: CRT_SHADER,
        uniforms: {
          u_time: () => (Date.now() - this._startTime) / 1000.0,
          u_scanlineIntensity: 0.7
        }
      });
      crtStage.enabled = false;
      this.viewer.scene.postProcessStages.add(crtStage);
      this.postProcessStages.set('crt', crtStage);
      console.log('[ShaderManager] CRT stage created');

    } catch (error) {
      console.error('[ShaderManager] Failed to create stages:', error);
    }
  }

  /**
   * Apply a shader mode to the scene
   * @param {string} mode - Shader mode: 'none', 'nvg', 'flir', 'crt'
   */
  applyShader(mode) {
    const validModes = ['none', 'nvg', 'flir', 'crt'];
    if (!validModes.includes(mode)) {
      console.error(`[ShaderManager] Invalid shader mode: ${mode}`);
      return;
    }

    // Disable all stages
    for (const [name, stage] of this.postProcessStages) {
      if (stage) {
        stage.enabled = false;
      }
    }

    // Enable the requested stage
    if (mode !== 'none') {
      const stage = this.postProcessStages.get(mode);
      if (stage) {
        stage.enabled = true;
        console.log(`[ShaderManager] Enabled ${mode} mode`);
      } else {
        console.warn(`[ShaderManager] Stage '${mode}' not found`);
      }
    }

    this.activeMode = mode;
  }

  /**
   * Get the currently active shader mode
   * @returns {string} Current mode
   */
  getActiveMode() {
    return this.activeMode;
  }

  /**
   * Check if a shader mode is available
   * @param {string} name - Shader name
   * @returns {boolean}
   */
  hasShader(name) {
    return this.postProcessStages.has(name);
  }

  /**
   * Get list of available shader names
   * @returns {string[]}
   */
  getLoadedShaders() {
    return Array.from(this.postProcessStages.keys());
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
   * Destroy all stages and clean up
   */
  destroy() {
    for (const [name, stage] of this.postProcessStages) {
      try {
        this.viewer.scene.postProcessStages.remove(stage);
      } catch (e) {
        // Stage may not have been added
      }
    }
    this.postProcessStages.clear();
    this.activeMode = 'none';
  }
}

export default ShaderManager;
