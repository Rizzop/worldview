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

    return runner.summary();
}

// Direct execution support
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
    const success = run();
    process.exit(success ? 0 : 1);
}
