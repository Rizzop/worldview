/**
 * CRT Monitor Post-Processing Fragment Shader
 *
 * Applies classic CRT monitor effects to the scene:
 * - Horizontal scanlines with configurable intensity
 * - Radial vignette darkening at edges
 * - Chromatic aberration (RGB channel offset)
 * - Barrel distortion (pincushion effect)
 * - Subtle flicker animation
 */

precision mediump float;

// Uniforms
uniform sampler2D u_texture;          // Input scene texture
uniform float u_time;                 // Time for flicker animation (seconds)
uniform float u_scanlineIntensity;    // Scanline strength (0.0 - 1.0)
uniform vec2 u_resolution;            // Screen resolution

// Varyings
varying vec2 v_texCoord;

/**
 * Barrel distortion function
 * Applies pincushion/barrel distortion to UV coordinates
 * Simulates CRT screen curvature
 */
vec2 barrelDistortion(vec2 uv) {
    // Center UV coordinates around origin
    vec2 centered = uv - 0.5;

    // Calculate distance from center
    float dist = length(centered);

    // Barrel distortion coefficient (subtle effect)
    float distortionStrength = 0.1;

    // Apply barrel distortion formula
    float factor = 1.0 + dist * dist * distortionStrength;
    vec2 distorted = centered * factor;

    // Return to 0-1 UV space
    return distorted + 0.5;
}

/**
 * Chromatic aberration function
 * Offsets RGB channels to simulate color fringing
 */
vec3 chromaticAberration(sampler2D tex, vec2 uv) {
    // Calculate offset based on distance from center
    vec2 center = uv - 0.5;
    float dist = length(center);

    // Aberration strength increases toward edges
    float aberrationAmount = 0.003 * dist;

    // Direction of aberration (radial outward)
    vec2 direction = normalize(center + 0.0001); // Avoid divide by zero

    // Offset each color channel differently
    vec2 redOffset = uv + direction * aberrationAmount;
    vec2 greenOffset = uv;
    vec2 blueOffset = uv - direction * aberrationAmount;

    // Sample each channel with its offset
    float r = texture2D(tex, redOffset).r;
    float g = texture2D(tex, greenOffset).g;
    float b = texture2D(tex, blueOffset).b;

    return vec3(r, g, b);
}

/**
 * Horizontal scanline effect
 * Creates alternating dark lines simulating CRT phosphor rows
 */
float scanlines(vec2 uv, float time) {
    // Calculate scanline based on vertical position
    float scanlineFreq = u_resolution.y * 0.5;
    float scanline = sin(uv.y * scanlineFreq * 3.14159) * 0.5 + 0.5;

    // Apply power curve for sharper lines
    scanline = pow(scanline, 1.5);

    // Add subtle flicker variation over time
    float flicker = 1.0 + sin(time * 8.0) * 0.01;

    // Return scanline multiplier (1.0 = full brightness, lower = darker)
    return mix(1.0, scanline, u_scanlineIntensity * 0.3) * flicker;
}

/**
 * Radial vignette effect
 * Darkens the edges of the screen
 */
float vignette(vec2 uv) {
    // Calculate distance from center
    vec2 center = uv - 0.5;
    float dist = length(center);

    // Create smooth falloff from center to edges
    float vig = 1.0 - smoothstep(0.4, 0.9, dist);

    // Apply power curve for more natural falloff
    vig = pow(vig, 0.8);

    return vig;
}

/**
 * CRT flicker effect
 * Subtle brightness variation over time
 */
float flickerEffect(float time) {
    // Combine multiple frequencies for natural flicker
    float flicker = 1.0;
    flicker += sin(time * 60.0) * 0.005;  // High frequency flicker
    flicker += sin(time * 10.0) * 0.01;   // Low frequency variation
    return flicker;
}

void main() {
    vec2 uv = v_texCoord;

    // Apply barrel distortion to UV coordinates
    vec2 distortedUV = barrelDistortion(uv);

    // Check if we're outside the valid texture range after distortion
    if (distortedUV.x < 0.0 || distortedUV.x > 1.0 ||
        distortedUV.y < 0.0 || distortedUV.y > 1.0) {
        // Outside screen bounds - render black
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }

    // Apply chromatic aberration
    vec3 color = chromaticAberration(u_texture, distortedUV);

    // Apply scanline effect
    float scanlineVal = scanlines(distortedUV, u_time);
    color *= scanlineVal;

    // Apply vignette darkening
    float vig = vignette(distortedUV);
    color *= vig;

    // Apply subtle flicker
    float flicker = flickerEffect(u_time);
    color *= flicker;

    // Slightly boost contrast for CRT look
    color = (color - 0.5) * 1.1 + 0.5;

    // Clamp to valid color range
    color = clamp(color, 0.0, 1.0);

    // Get alpha from original texture
    float alpha = texture2D(u_texture, distortedUV).a;

    gl_FragColor = vec4(color, alpha);
}
