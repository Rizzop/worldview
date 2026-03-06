/**
 * FLIR Thermal Imaging Post-Processing Fragment Shader
 *
 * Applies thermal imaging effect to the entire scene:
 * - Luminance to temperature mapping
 * - Ironbow colormap (blue->purple->red->yellow->white)
 * - Sobel edge detection for thermal gradient highlighting
 * - Heat signature highlighting
 */

precision mediump float;

// Uniforms
uniform sampler2D u_texture;      // Input scene texture
uniform float u_time;             // Time for animation (seconds)
uniform float u_intensity;        // Colormap range/effect strength (0.0 - 1.0)
uniform vec2 u_resolution;        // Screen resolution

// Varyings
varying vec2 v_texCoord;

/**
 * Ironbow colormap function
 * Maps temperature value (0.0-1.0) to ironbow gradient
 * cold (blue) -> purple -> red -> orange -> yellow -> white (hot)
 */
vec3 ironbow(float t) {
    // Clamp input to valid range
    t = clamp(t, 0.0, 1.0);

    // Ironbow gradient color stops:
    // 0.0 = dark blue (cold)
    // 0.2 = purple
    // 0.4 = red
    // 0.6 = orange
    // 0.8 = yellow
    // 1.0 = white (hot)

    vec3 color;

    if (t < 0.2) {
        // Dark blue to purple
        float s = t / 0.2;
        vec3 darkBlue = vec3(0.0, 0.0, 0.3);
        vec3 purple = vec3(0.5, 0.0, 0.5);
        color = mix(darkBlue, purple, s);
    } else if (t < 0.4) {
        // Purple to red
        float s = (t - 0.2) / 0.2;
        vec3 purple = vec3(0.5, 0.0, 0.5);
        vec3 red = vec3(0.8, 0.0, 0.0);
        color = mix(purple, red, s);
    } else if (t < 0.6) {
        // Red to orange
        float s = (t - 0.4) / 0.2;
        vec3 red = vec3(0.8, 0.0, 0.0);
        vec3 orange = vec3(1.0, 0.5, 0.0);
        color = mix(red, orange, s);
    } else if (t < 0.8) {
        // Orange to yellow
        float s = (t - 0.6) / 0.2;
        vec3 orange = vec3(1.0, 0.5, 0.0);
        vec3 yellow = vec3(1.0, 1.0, 0.0);
        color = mix(orange, yellow, s);
    } else {
        // Yellow to white (hot spots)
        float s = (t - 0.8) / 0.2;
        vec3 yellow = vec3(1.0, 1.0, 0.0);
        vec3 white = vec3(1.0, 1.0, 1.0);
        color = mix(yellow, white, s);
    }

    return color;
}

/**
 * Sample luminance at offset position
 */
float sampleLuminance(vec2 uv) {
    vec3 color = texture2D(u_texture, uv).rgb;
    return dot(color, vec3(0.299, 0.587, 0.114));
}

/**
 * Sobel edge detection filter
 * Returns edge magnitude for thermal gradient highlighting
 */
float sobelEdge(vec2 uv) {
    vec2 texelSize = 1.0 / u_resolution;

    // Sample 3x3 neighborhood luminance values
    float tl = sampleLuminance(uv + vec2(-texelSize.x, -texelSize.y));
    float tm = sampleLuminance(uv + vec2(0.0, -texelSize.y));
    float tr = sampleLuminance(uv + vec2(texelSize.x, -texelSize.y));

    float ml = sampleLuminance(uv + vec2(-texelSize.x, 0.0));
    float mr = sampleLuminance(uv + vec2(texelSize.x, 0.0));

    float bl = sampleLuminance(uv + vec2(-texelSize.x, texelSize.y));
    float bm = sampleLuminance(uv + vec2(0.0, texelSize.y));
    float br = sampleLuminance(uv + vec2(texelSize.x, texelSize.y));

    // Sobel kernels for horizontal and vertical gradients
    // Gx = [-1  0  1]    Gy = [-1 -2 -1]
    //      [-2  0  2]         [ 0  0  0]
    //      [-1  0  1]         [ 1  2  1]

    float gx = -tl - 2.0 * ml - bl + tr + 2.0 * mr + br;
    float gy = -tl - 2.0 * tm - tr + bl + 2.0 * bm + br;

    // Edge magnitude
    float edge = sqrt(gx * gx + gy * gy);

    return edge;
}

/**
 * Heat signature highlighting
 * Enhances high temperature areas with subtle glow
 */
float heatSignature(float temperature) {
    // Boost high temperature values for heat signature effect
    float threshold = 0.7;
    if (temperature > threshold) {
        float excess = (temperature - threshold) / (1.0 - threshold);
        return temperature + excess * 0.2;
    }
    return temperature;
}

void main() {
    vec2 uv = v_texCoord;

    // Sample original scene
    vec4 sceneColor = texture2D(u_texture, uv);

    // Calculate luminance as base temperature value
    float luminance = dot(sceneColor.rgb, vec3(0.299, 0.587, 0.114));

    // Apply intensity as colormap range adjustment
    // Lower intensity compresses the range, higher expands/shifts it
    float temperature = luminance;
    temperature = pow(temperature, 1.0 / (0.5 + u_intensity * 0.5));

    // Apply heat signature highlighting
    temperature = heatSignature(temperature);

    // Clamp temperature to valid range
    temperature = clamp(temperature, 0.0, 1.0);

    // Map temperature to ironbow colormap
    vec3 thermalColor = ironbow(temperature);

    // Calculate Sobel edge detection for thermal gradient highlighting
    float edge = sobelEdge(uv);

    // Scale edge intensity based on u_intensity
    float edgeStrength = edge * 2.0 * u_intensity;
    edgeStrength = clamp(edgeStrength, 0.0, 1.0);

    // Blend edge highlights (brighter edges for thermal gradients)
    vec3 edgeColor = vec3(1.0, 1.0, 1.0);
    thermalColor = mix(thermalColor, edgeColor, edgeStrength * 0.3);

    // Add subtle temporal variation for realistic sensor noise
    float noise = fract(sin(dot(uv + u_time * 0.01, vec2(12.9898, 78.233))) * 43758.5453);
    thermalColor += (noise - 0.5) * 0.02;

    // Mix between original and thermal based on intensity
    vec3 finalColor = mix(sceneColor.rgb, thermalColor, u_intensity);

    // Ensure we don't exceed valid color range
    finalColor = clamp(finalColor, 0.0, 1.0);

    gl_FragColor = vec4(finalColor, sceneColor.a);
}
