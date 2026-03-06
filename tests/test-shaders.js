/**
 * Tests for GLSL Shaders
 * Validates shader files exist and contain required declarations.
 * Exports run() function and supports direct execution.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test configuration
const SHADER_DIR = path.join(__dirname, '..', 'src', 'shaders');
const NVG_SHADER_PATH = path.join(SHADER_DIR, 'nvg.glsl');
const FLIR_SHADER_PATH = path.join(SHADER_DIR, 'flir.glsl');
const CRT_SHADER_PATH = path.join(SHADER_DIR, 'crt.glsl');

/**
 * Simple assertion helpers
 */
function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function assertContains(str, substr, message) {
    if (!str.includes(substr)) {
        throw new Error(message || `Expected string to contain "${substr}"`);
    }
}

function assertMatch(str, regex, message) {
    if (!regex.test(str)) {
        throw new Error(message || `Expected string to match ${regex}`);
    }
}

/**
 * Test runner
 */
class TestRunner {
    constructor() {
        this.passed = 0;
        this.failed = 0;
        this.results = [];
    }

    test(name, fn) {
        try {
            fn();
            this.passed++;
            this.results.push({ name, status: 'PASS' });
            console.log(`✓ ${name}`);
        } catch (error) {
            this.failed++;
            this.results.push({ name, status: 'FAIL', error: error.message });
            console.log(`✗ ${name}`);
            console.log(`  Error: ${error.message}`);
        }
    }

    summary() {
        console.log('\n=== Test Summary ===\n');
        console.log(`Passed: ${this.passed}`);
        console.log(`Failed: ${this.failed}`);
        console.log(`Total:  ${this.passed + this.failed}`);

        if (this.failed > 0) {
            console.log('\nFailed tests:');
            this.results.filter(r => r.status === 'FAIL').forEach(r => {
                console.log(`  - ${r.name}: ${r.error}`);
            });
        } else {
            console.log('\nAll tests passed!');
        }

        return this.failed === 0;
    }
}

/**
 * Run all shader tests
 */
export function run() {
    const runner = new TestRunner();
    let shaderContent = '';

    // ========================================================================
    // NVG Shader File Tests
    // ========================================================================

    console.log('\n=== NVG Shader Tests ===\n');

    runner.test('nvg.glsl file exists', () => {
        assert(fs.existsSync(NVG_SHADER_PATH), `Shader file not found at ${NVG_SHADER_PATH}`);
    });

    runner.test('nvg.glsl is readable', () => {
        shaderContent = fs.readFileSync(NVG_SHADER_PATH, 'utf-8');
        assert(shaderContent.length > 0, 'Shader file is empty');
    });

    // ========================================================================
    // Uniform Declaration Tests
    // ========================================================================

    console.log('\n=== Uniform Declarations ===\n');

    runner.test('shader has u_time uniform declaration', () => {
        assertMatch(shaderContent, /uniform\s+float\s+u_time\s*;/,
            'Missing uniform float u_time declaration');
    });

    runner.test('shader has u_intensity uniform declaration', () => {
        assertMatch(shaderContent, /uniform\s+float\s+u_intensity\s*;/,
            'Missing uniform float u_intensity declaration');
    });

    runner.test('shader has u_texture uniform declaration', () => {
        assertMatch(shaderContent, /uniform\s+sampler2D\s+u_texture\s*;/,
            'Missing uniform sampler2D u_texture declaration');
    });

    runner.test('shader has u_resolution uniform declaration', () => {
        assertMatch(shaderContent, /uniform\s+vec2\s+u_resolution\s*;/,
            'Missing uniform vec2 u_resolution declaration');
    });

    // ========================================================================
    // Shader Structure Tests
    // ========================================================================

    console.log('\n=== Shader Structure ===\n');

    runner.test('shader has main function', () => {
        assertMatch(shaderContent, /void\s+main\s*\(\s*\)\s*\{/,
            'Missing main() function');
    });

    runner.test('shader sets gl_FragColor', () => {
        assertContains(shaderContent, 'gl_FragColor',
            'Shader must set gl_FragColor for output');
    });

    runner.test('shader has precision declaration', () => {
        assertMatch(shaderContent, /precision\s+(lowp|mediump|highp)\s+float\s*;/,
            'Missing precision declaration for float');
    });

    runner.test('shader has varying for texture coordinates', () => {
        assertMatch(shaderContent, /varying\s+vec2\s+v_texCoord\s*;/,
            'Missing varying vec2 v_texCoord declaration');
    });

    runner.test('shader uses texture2D for sampling', () => {
        assertContains(shaderContent, 'texture2D',
            'Shader should use texture2D for sampling the input texture');
    });

    // ========================================================================
    // NVG Effect Implementation Tests
    // ========================================================================

    console.log('\n=== NVG Effect Implementation ===\n');

    runner.test('shader implements green channel boost', () => {
        const hasGreenTint = shaderContent.includes('nvgGreen') ||
                             /vec3\s*\(\s*[\d.]+\s*,\s*1\.0\s*,\s*[\d.]+\s*\)/.test(shaderContent);
        assert(hasGreenTint, 'Shader should implement green channel boost for NVG effect');
    });

    runner.test('shader implements vignette effect', () => {
        assertContains(shaderContent, 'vignette',
            'Shader should implement radial vignette effect');
    });

    runner.test('shader implements scanline effect', () => {
        assertContains(shaderContent, 'scanline',
            'Shader should implement scanline noise effect');
    });

    runner.test('shader implements noise/grain effect', () => {
        const hasNoise = shaderContent.includes('noise') ||
                         shaderContent.includes('grain') ||
                         shaderContent.includes('random');
        assert(hasNoise, 'Shader should implement noise/grain effect');
    });

    runner.test('shader implements bloom/glow effect', () => {
        const hasBloom = shaderContent.includes('bloom') ||
                         shaderContent.includes('glow') ||
                         shaderContent.includes('phosphor');
        assert(hasBloom, 'Shader should implement phosphor bloom/glow effect');
    });

    // ========================================================================
    // GLSL Syntax Validation
    // ========================================================================

    console.log('\n=== GLSL Syntax Validation ===\n');

    runner.test('shader has balanced braces', () => {
        const openBraces = (shaderContent.match(/\{/g) || []).length;
        const closeBraces = (shaderContent.match(/\}/g) || []).length;
        assert(openBraces === closeBraces,
            `Unbalanced braces: ${openBraces} open, ${closeBraces} close`);
    });

    runner.test('shader has balanced parentheses', () => {
        const openParens = (shaderContent.match(/\(/g) || []).length;
        const closeParens = (shaderContent.match(/\)/g) || []).length;
        assert(openParens === closeParens,
            `Unbalanced parentheses: ${openParens} open, ${closeParens} close`);
    });

    runner.test('shader has no obvious syntax errors', () => {
        const issues = [];

        // Double semicolons
        if (/;;/.test(shaderContent)) {
            issues.push('Double semicolons found');
        }

        // Unclosed comments
        const multilineCommentOpen = (shaderContent.match(/\/\*/g) || []).length;
        const multilineCommentClose = (shaderContent.match(/\*\//g) || []).length;
        if (multilineCommentOpen !== multilineCommentClose) {
            issues.push('Unclosed multiline comment');
        }

        assert(issues.length === 0, issues.join(', '));
    });

    runner.test('shader uses valid GLSL float literals', () => {
        // Check that we're using proper float literals (e.g., 1.0 not 1)
        const hasFloatLiterals = /\d+\.\d+/.test(shaderContent);
        assert(hasFloatLiterals, 'Shader should use proper float literals (e.g., 1.0)');
    });

    // ========================================================================
    // FLIR Shader File Tests
    // ========================================================================

    console.log('\n=== FLIR Shader Tests ===\n');

    let flirContent = '';

    runner.test('flir.glsl file exists', () => {
        assert(fs.existsSync(FLIR_SHADER_PATH), `Shader file not found at ${FLIR_SHADER_PATH}`);
    });

    runner.test('flir.glsl is readable', () => {
        flirContent = fs.readFileSync(FLIR_SHADER_PATH, 'utf-8');
        assert(flirContent.length > 0, 'Shader file is empty');
    });

    // ========================================================================
    // FLIR Uniform Declaration Tests
    // ========================================================================

    console.log('\n=== FLIR Uniform Declarations ===\n');

    runner.test('FLIR shader has u_intensity uniform declaration', () => {
        assertMatch(flirContent, /uniform\s+float\s+u_intensity\s*;/,
            'Missing uniform float u_intensity declaration');
    });

    runner.test('FLIR shader has u_texture uniform declaration', () => {
        assertMatch(flirContent, /uniform\s+sampler2D\s+u_texture\s*;/,
            'Missing uniform sampler2D u_texture declaration');
    });

    runner.test('FLIR shader has u_resolution uniform declaration', () => {
        assertMatch(flirContent, /uniform\s+vec2\s+u_resolution\s*;/,
            'Missing uniform vec2 u_resolution declaration');
    });

    // ========================================================================
    // FLIR Shader Structure Tests
    // ========================================================================

    console.log('\n=== FLIR Shader Structure ===\n');

    runner.test('FLIR shader has main function', () => {
        assertMatch(flirContent, /void\s+main\s*\(\s*\)\s*\{/,
            'Missing main() function');
    });

    runner.test('FLIR shader sets gl_FragColor', () => {
        assertContains(flirContent, 'gl_FragColor',
            'Shader must set gl_FragColor for output');
    });

    runner.test('FLIR shader has precision declaration', () => {
        assertMatch(flirContent, /precision\s+(lowp|mediump|highp)\s+float\s*;/,
            'Missing precision declaration for float');
    });

    runner.test('FLIR shader has varying for texture coordinates', () => {
        assertMatch(flirContent, /varying\s+vec2\s+v_texCoord\s*;/,
            'Missing varying vec2 v_texCoord declaration');
    });

    runner.test('FLIR shader uses texture2D for sampling', () => {
        assertContains(flirContent, 'texture2D',
            'Shader should use texture2D for sampling the input texture');
    });

    // ========================================================================
    // FLIR Effect Implementation Tests
    // ========================================================================

    console.log('\n=== FLIR Effect Implementation ===\n');

    runner.test('FLIR shader implements ironbow colormap', () => {
        assertContains(flirContent, 'ironbow',
            'Shader should implement ironbow colormap function');
    });

    runner.test('FLIR shader implements Sobel edge detection', () => {
        const hasSobel = flirContent.includes('sobel') ||
                         flirContent.includes('Sobel') ||
                         flirContent.includes('sobelEdge');
        assert(hasSobel, 'Shader should implement Sobel edge detection');
    });

    runner.test('FLIR shader implements luminance to temperature mapping', () => {
        const hasLuminance = flirContent.includes('luminance') ||
                             flirContent.includes('Luminance');
        const hasTemperature = flirContent.includes('temperature') ||
                               flirContent.includes('Temperature');
        assert(hasLuminance && hasTemperature,
            'Shader should implement luminance to temperature mapping');
    });

    runner.test('FLIR shader implements heat signature highlighting', () => {
        const hasHeatSignature = flirContent.includes('heat') ||
                                 flirContent.includes('Heat') ||
                                 flirContent.includes('heatSignature');
        assert(hasHeatSignature, 'Shader should implement heat signature highlighting');
    });

    // ========================================================================
    // FLIR GLSL Syntax Validation
    // ========================================================================

    console.log('\n=== FLIR GLSL Syntax Validation ===\n');

    runner.test('FLIR shader has balanced braces', () => {
        const openBraces = (flirContent.match(/\{/g) || []).length;
        const closeBraces = (flirContent.match(/\}/g) || []).length;
        assert(openBraces === closeBraces,
            `Unbalanced braces: ${openBraces} open, ${closeBraces} close`);
    });

    runner.test('FLIR shader has balanced parentheses', () => {
        const openParens = (flirContent.match(/\(/g) || []).length;
        const closeParens = (flirContent.match(/\)/g) || []).length;
        assert(openParens === closeParens,
            `Unbalanced parentheses: ${openParens} open, ${closeParens} close`);
    });

    runner.test('FLIR shader has no obvious syntax errors', () => {
        const issues = [];

        // Double semicolons
        if (/;;/.test(flirContent)) {
            issues.push('Double semicolons found');
        }

        // Unclosed comments
        const multilineCommentOpen = (flirContent.match(/\/\*/g) || []).length;
        const multilineCommentClose = (flirContent.match(/\*\//g) || []).length;
        if (multilineCommentOpen !== multilineCommentClose) {
            issues.push('Unclosed multiline comment');
        }

        assert(issues.length === 0, issues.join(', '));
    });

    runner.test('FLIR shader uses valid GLSL float literals', () => {
        // Check that we're using proper float literals (e.g., 1.0 not 1)
        const hasFloatLiterals = /\d+\.\d+/.test(flirContent);
        assert(hasFloatLiterals, 'Shader should use proper float literals (e.g., 1.0)');
    });

    // ========================================================================
    // CRT Shader File Tests
    // ========================================================================

    console.log('\n=== CRT Shader Tests ===\n');

    let crtContent = '';

    runner.test('crt.glsl file exists', () => {
        assert(fs.existsSync(CRT_SHADER_PATH), `Shader file not found at ${CRT_SHADER_PATH}`);
    });

    runner.test('crt.glsl is readable', () => {
        crtContent = fs.readFileSync(CRT_SHADER_PATH, 'utf-8');
        assert(crtContent.length > 0, 'Shader file is empty');
    });

    // ========================================================================
    // CRT Uniform Declaration Tests
    // ========================================================================

    console.log('\n=== CRT Uniform Declarations ===\n');

    runner.test('CRT shader has u_scanlineIntensity uniform declaration', () => {
        assertMatch(crtContent, /uniform\s+float\s+u_scanlineIntensity\s*;/,
            'Missing uniform float u_scanlineIntensity declaration');
    });

    runner.test('CRT shader has u_time uniform declaration', () => {
        assertMatch(crtContent, /uniform\s+float\s+u_time\s*;/,
            'Missing uniform float u_time declaration');
    });

    runner.test('CRT shader has u_texture uniform declaration', () => {
        assertMatch(crtContent, /uniform\s+sampler2D\s+u_texture\s*;/,
            'Missing uniform sampler2D u_texture declaration');
    });

    runner.test('CRT shader has u_resolution uniform declaration', () => {
        assertMatch(crtContent, /uniform\s+vec2\s+u_resolution\s*;/,
            'Missing uniform vec2 u_resolution declaration');
    });

    // ========================================================================
    // CRT Shader Structure Tests
    // ========================================================================

    console.log('\n=== CRT Shader Structure ===\n');

    runner.test('CRT shader has main function', () => {
        assertMatch(crtContent, /void\s+main\s*\(\s*\)\s*\{/,
            'Missing main() function');
    });

    runner.test('CRT shader sets gl_FragColor', () => {
        assertContains(crtContent, 'gl_FragColor',
            'Shader must set gl_FragColor for output');
    });

    runner.test('CRT shader has precision declaration', () => {
        assertMatch(crtContent, /precision\s+(lowp|mediump|highp)\s+float\s*;/,
            'Missing precision declaration for float');
    });

    runner.test('CRT shader has varying for texture coordinates', () => {
        assertMatch(crtContent, /varying\s+vec2\s+v_texCoord\s*;/,
            'Missing varying vec2 v_texCoord declaration');
    });

    runner.test('CRT shader uses texture2D for sampling', () => {
        assertContains(crtContent, 'texture2D',
            'Shader should use texture2D for sampling the input texture');
    });

    // ========================================================================
    // CRT Effect Implementation Tests
    // ========================================================================

    console.log('\n=== CRT Effect Implementation ===\n');

    runner.test('CRT shader implements scanline effect', () => {
        assertContains(crtContent, 'scanline',
            'Shader should implement horizontal scanline effect');
    });

    runner.test('CRT shader implements vignette effect', () => {
        assertContains(crtContent, 'vignette',
            'Shader should implement radial vignette darkening');
    });

    runner.test('CRT shader implements chromatic aberration', () => {
        const hasChromatic = crtContent.includes('chromatic') ||
                             crtContent.includes('Chromatic') ||
                             crtContent.includes('aberration') ||
                             crtContent.includes('Aberration');
        assert(hasChromatic, 'Shader should implement chromatic aberration (RGB channel offset)');
    });

    runner.test('CRT shader implements barrel distortion', () => {
        const hasBarrel = crtContent.includes('barrel') ||
                          crtContent.includes('Barrel') ||
                          crtContent.includes('distortion') ||
                          crtContent.includes('Distortion');
        assert(hasBarrel, 'Shader should implement barrel distortion (pincushion effect)');
    });

    runner.test('CRT shader implements flicker effect', () => {
        const hasFlicker = crtContent.includes('flicker') ||
                           crtContent.includes('Flicker');
        assert(hasFlicker, 'Shader should implement subtle flicker animation');
    });

    // ========================================================================
    // CRT GLSL Syntax Validation
    // ========================================================================

    console.log('\n=== CRT GLSL Syntax Validation ===\n');

    runner.test('CRT shader has balanced braces', () => {
        const openBraces = (crtContent.match(/\{/g) || []).length;
        const closeBraces = (crtContent.match(/\}/g) || []).length;
        assert(openBraces === closeBraces,
            `Unbalanced braces: ${openBraces} open, ${closeBraces} close`);
    });

    runner.test('CRT shader has balanced parentheses', () => {
        const openParens = (crtContent.match(/\(/g) || []).length;
        const closeParens = (crtContent.match(/\)/g) || []).length;
        assert(openParens === closeParens,
            `Unbalanced parentheses: ${openParens} open, ${closeParens} close`);
    });

    runner.test('CRT shader has no obvious syntax errors', () => {
        const issues = [];

        // Double semicolons
        if (/;;/.test(crtContent)) {
            issues.push('Double semicolons found');
        }

        // Unclosed comments
        const multilineCommentOpen = (crtContent.match(/\/\*/g) || []).length;
        const multilineCommentClose = (crtContent.match(/\*\//g) || []).length;
        if (multilineCommentOpen !== multilineCommentClose) {
            issues.push('Unclosed multiline comment');
        }

        assert(issues.length === 0, issues.join(', '));
    });

    runner.test('CRT shader uses valid GLSL float literals', () => {
        // Check that we're using proper float literals (e.g., 1.0 not 1)
        const hasFloatLiterals = /\d+\.\d+/.test(crtContent);
        assert(hasFloatLiterals, 'Shader should use proper float literals (e.g., 1.0)');
    });

    return runner.summary();
}

// Direct execution support
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
    const success = run();
    process.exit(success ? 0 : 1);
}
