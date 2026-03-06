/**
 * Night Vision Goggles (NVG) Post-Processing Fragment Shader
 *
 * Applies night vision effect to the entire scene:
 * - Green channel boost with reduced red/blue
 * - Radial vignette darkening
 * - Scanline noise effect
 * - Phosphor persistence (bloom glow)
 * - Animated grain noise
 */

precision mediump float;

// Uniforms
uniform sampler2D u_texture;      // Input scene texture
uniform float u_time;             // Time for animation (seconds)
uniform float u_intensity;        // Effect strength (0.0 - 1.0)
uniform vec2 u_resolution;        // Screen resolution

// Varyings
varying vec2 v_texCoord;

// Pseudo-random noise function
float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

// Generate grain noise
float grain(vec2 uv, float time) {
    vec2 noiseUV = uv * vec2(1024.0, 1024.0);
    float noise = random(noiseUV + vec2(time * 100.0, time * 50.0));
    return noise;
}

// Scanline effect
float scanlines(vec2 uv, float time) {
    float scanline = sin(uv.y * u_resolution.y * 1.5 + time * 10.0) * 0.5 + 0.5;
    scanline = pow(scanline, 0.8);
    return mix(0.85, 1.0, scanline);
}

// Radial vignette
float vignette(vec2 uv) {
    vec2 center = uv - 0.5;
    float dist = length(center);
    float vig = 1.0 - smoothstep(0.3, 0.9, dist);
    return vig;
}

// Phosphor bloom/glow effect
vec3 bloom(sampler2D tex, vec2 uv, float intensity) {
    vec3 color = vec3(0.0);
    float total = 0.0;

    // Simple box blur for bloom effect
    float blurSize = 0.003 * intensity;

    for (float x = -2.0; x <= 2.0; x += 1.0) {
        for (float y = -2.0; y <= 2.0; y += 1.0) {
            vec2 offset = vec2(x, y) * blurSize;
            color += texture2D(tex, uv + offset).rgb;
            total += 1.0;
        }
    }

    return color / total;
}

void main() {
    vec2 uv = v_texCoord;

    // Sample original scene
    vec4 sceneColor = texture2D(u_texture, uv);

    // Calculate luminance from original scene
    float luminance = dot(sceneColor.rgb, vec3(0.299, 0.587, 0.114));

    // Apply phosphor bloom glow
    vec3 bloomColor = bloom(u_texture, uv, u_intensity);
    float bloomLum = dot(bloomColor, vec3(0.299, 0.587, 0.114));

    // Mix bloom with original
    float mixedLum = mix(luminance, bloomLum, 0.3 * u_intensity);

    // Night vision green color tint
    // Boost green channel, reduce red and blue
    vec3 nvgGreen = vec3(0.1, 1.0, 0.2);
    vec3 nvgColor = nvgGreen * mixedLum;

    // Add slight color variation based on original colors for depth
    nvgColor.g += sceneColor.g * 0.1 * u_intensity;

    // Apply grain noise
    float noiseVal = grain(uv, u_time);
    float grainStrength = 0.08 * u_intensity;
    nvgColor += (noiseVal - 0.5) * grainStrength;

    // Apply scanline effect
    float scanlineVal = scanlines(uv, u_time);
    nvgColor *= mix(1.0, scanlineVal, u_intensity * 0.5);

    // Apply radial vignette
    float vig = vignette(uv);
    nvgColor *= mix(1.0, vig, u_intensity);

    // Boost overall brightness slightly (NVG amplification)
    nvgColor *= 1.0 + (0.3 * u_intensity);

    // Mix between original and NVG based on intensity
    vec3 finalColor = mix(sceneColor.rgb, nvgColor, u_intensity);

    // Ensure we don't exceed valid color range
    finalColor = clamp(finalColor, 0.0, 1.0);

    gl_FragColor = vec4(finalColor, sceneColor.a);
}
