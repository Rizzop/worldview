/**
 * Tests for UI Controls Module
 * Validates module exports, structure, and event-driven behavior.
 * Does not test actual DOM rendering (no DOM in Node.js environment).
 * Exports run() function and supports direct execution.
 */

import { fileURLToPath } from 'url';

/**
 * Simple assertion helpers
 */
function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

function assertType(value, type, message) {
  if (typeof value !== type) {
    throw new Error(message || `Expected type ${type}, got ${typeof value}`);
  }
}

function assertArray(value, message) {
  if (!Array.isArray(value)) {
    throw new Error(message || `Expected array, got ${typeof value}`);
  }
}

function assertContains(arr, value, message) {
  if (!arr.includes(value)) {
    throw new Error(message || `Expected array to contain ${value}`);
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

  async testAsync(name, fn) {
    try {
      await fn();
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
 * Run all UI module tests
 */
export async function run() {
  const runner = new TestRunner();

  // Import the module
  let Controls, LAYER_TYPES, VISUAL_MODES;

  // ========================================================================
  // Module Import Tests
  // ========================================================================

  console.log('\n=== Module Import Tests ===\n');

  await runner.testAsync('controls.js module can be imported', async () => {
    const module = await import('../src/ui/controls.js');
    Controls = module.Controls;
    LAYER_TYPES = module.LAYER_TYPES;
    VISUAL_MODES = module.VISUAL_MODES;
    assert(module !== undefined, 'Module import failed');
  });

  await runner.testAsync('Controls class is exported', async () => {
    assert(Controls !== undefined, 'Controls class not exported');
    assertType(Controls, 'function', 'Controls should be a class/function');
  });

  await runner.testAsync('LAYER_TYPES constant is exported', async () => {
    assert(LAYER_TYPES !== undefined, 'LAYER_TYPES not exported');
    assertArray(LAYER_TYPES, 'LAYER_TYPES should be an array');
  });

  await runner.testAsync('VISUAL_MODES constant is exported', async () => {
    assert(VISUAL_MODES !== undefined, 'VISUAL_MODES not exported');
    assertArray(VISUAL_MODES, 'VISUAL_MODES should be an array');
  });

  await runner.testAsync('default export is Controls class', async () => {
    const module = await import('../src/ui/controls.js');
    assertEqual(module.default, Controls, 'Default export should be Controls class');
  });

  // ========================================================================
  // Layer Types Tests
  // ========================================================================

  console.log('\n=== Layer Types Tests ===\n');

  runner.test('LAYER_TYPES contains satellites', () => {
    assertContains(LAYER_TYPES, 'satellites', 'Missing satellites layer');
  });

  runner.test('LAYER_TYPES contains flights', () => {
    assertContains(LAYER_TYPES, 'flights', 'Missing flights layer');
  });

  runner.test('LAYER_TYPES contains military', () => {
    assertContains(LAYER_TYPES, 'military', 'Missing military layer');
  });

  runner.test('LAYER_TYPES contains seismic', () => {
    assertContains(LAYER_TYPES, 'seismic', 'Missing seismic layer');
  });

  runner.test('LAYER_TYPES contains traffic', () => {
    assertContains(LAYER_TYPES, 'traffic', 'Missing traffic layer');
  });

  runner.test('LAYER_TYPES contains cctv', () => {
    assertContains(LAYER_TYPES, 'cctv', 'Missing cctv layer');
  });

  // ========================================================================
  // Visual Modes Tests
  // ========================================================================

  console.log('\n=== Visual Modes Tests ===\n');

  runner.test('VISUAL_MODES contains none', () => {
    assertContains(VISUAL_MODES, 'none', 'Missing none mode');
  });

  runner.test('VISUAL_MODES contains nvg', () => {
    assertContains(VISUAL_MODES, 'nvg', 'Missing nvg (night vision) mode');
  });

  runner.test('VISUAL_MODES contains flir', () => {
    assertContains(VISUAL_MODES, 'flir', 'Missing flir (thermal) mode');
  });

  runner.test('VISUAL_MODES contains crt', () => {
    assertContains(VISUAL_MODES, 'crt', 'Missing crt mode');
  });

  // ========================================================================
  // Controls Class Instantiation Tests
  // ========================================================================

  console.log('\n=== Controls Class Instantiation Tests ===\n');

  let controls;

  runner.test('Controls can be instantiated without options', () => {
    controls = new Controls();
    assert(controls !== undefined, 'Failed to create Controls instance');
  });

  runner.test('Controls can be instantiated with options', () => {
    const opts = {
      layers: { satellites: false, flights: true },
      mode: 'nvg',
      opacity: 75
    };
    const c = new Controls(opts);
    assert(c !== undefined, 'Failed to create Controls instance with options');
  });

  runner.test('Controls does not crash without DOM', () => {
    // This test verifies that Controls handles missing DOM gracefully
    const c = new Controls({ container: 'non-existent-element' });
    assert(c !== undefined, 'Controls should not crash without DOM');
  });

  // ========================================================================
  // Layer State Methods Tests
  // ========================================================================

  console.log('\n=== Layer State Methods Tests ===\n');

  runner.test('getLayerStates returns object', () => {
    controls = new Controls();
    const states = controls.getLayerStates();
    assertType(states, 'object', 'getLayerStates should return an object');
  });

  runner.test('getLayerStates contains all layer types', () => {
    controls = new Controls();
    const states = controls.getLayerStates();
    for (const layer of LAYER_TYPES) {
      assert(layer in states, `Missing layer state for ${layer}`);
    }
  });

  runner.test('isLayerEnabled returns boolean', () => {
    controls = new Controls();
    const enabled = controls.isLayerEnabled('satellites');
    assertType(enabled, 'boolean', 'isLayerEnabled should return boolean');
  });

  runner.test('setLayerEnabled updates state', () => {
    controls = new Controls();
    controls.setLayerEnabled('satellites', false);
    assertEqual(controls.isLayerEnabled('satellites'), false, 'Layer should be disabled');
    controls.setLayerEnabled('satellites', true);
    assertEqual(controls.isLayerEnabled('satellites'), true, 'Layer should be enabled');
  });

  runner.test('toggleLayer toggles state', () => {
    controls = new Controls();
    const initial = controls.isLayerEnabled('flights');
    const toggled = controls.toggleLayer('flights');
    assertEqual(toggled, !initial, 'toggleLayer should return new state');
    assertEqual(controls.isLayerEnabled('flights'), !initial, 'State should be toggled');
  });

  runner.test('initial layer states respect options', () => {
    const c = new Controls({
      layers: { satellites: false, military: false }
    });
    assertEqual(c.isLayerEnabled('satellites'), false, 'satellites should be disabled');
    assertEqual(c.isLayerEnabled('military'), false, 'military should be disabled');
    assertEqual(c.isLayerEnabled('flights'), true, 'flights should default to true');
  });

  // ========================================================================
  // Visual Mode Methods Tests
  // ========================================================================

  console.log('\n=== Visual Mode Methods Tests ===\n');

  runner.test('getVisualMode returns string', () => {
    controls = new Controls();
    const mode = controls.getVisualMode();
    assertType(mode, 'string', 'getVisualMode should return string');
  });

  runner.test('default visual mode is none', () => {
    controls = new Controls();
    assertEqual(controls.getVisualMode(), 'none', 'Default mode should be none');
  });

  runner.test('setVisualMode updates mode', () => {
    controls = new Controls();
    controls.setVisualMode('nvg');
    assertEqual(controls.getVisualMode(), 'nvg', 'Mode should be nvg');
    controls.setVisualMode('flir');
    assertEqual(controls.getVisualMode(), 'flir', 'Mode should be flir');
    controls.setVisualMode('crt');
    assertEqual(controls.getVisualMode(), 'crt', 'Mode should be crt');
    controls.setVisualMode('none');
    assertEqual(controls.getVisualMode(), 'none', 'Mode should be none');
  });

  runner.test('setVisualMode ignores invalid modes', () => {
    controls = new Controls();
    controls.setVisualMode('invalid-mode');
    assertEqual(controls.getVisualMode(), 'none', 'Invalid mode should be ignored');
  });

  runner.test('initial mode respects options', () => {
    const c = new Controls({ mode: 'flir' });
    assertEqual(c.getVisualMode(), 'flir', 'Initial mode should be flir');
  });

  // ========================================================================
  // Opacity Methods Tests
  // ========================================================================

  console.log('\n=== Opacity Methods Tests ===\n');

  runner.test('getOpacity returns number', () => {
    controls = new Controls();
    const opacity = controls.getOpacity();
    assertType(opacity, 'number', 'getOpacity should return number');
  });

  runner.test('default opacity is 100', () => {
    controls = new Controls();
    assertEqual(controls.getOpacity(), 100, 'Default opacity should be 100');
  });

  runner.test('setOpacity updates opacity', () => {
    controls = new Controls();
    controls.setOpacity(50);
    assertEqual(controls.getOpacity(), 50, 'Opacity should be 50');
    controls.setOpacity(0);
    assertEqual(controls.getOpacity(), 0, 'Opacity should be 0');
    controls.setOpacity(100);
    assertEqual(controls.getOpacity(), 100, 'Opacity should be 100');
  });

  runner.test('setOpacity clamps to valid range', () => {
    controls = new Controls();
    controls.setOpacity(-10);
    assertEqual(controls.getOpacity(), 0, 'Opacity should be clamped to 0');
    controls.setOpacity(150);
    assertEqual(controls.getOpacity(), 100, 'Opacity should be clamped to 100');
  });

  runner.test('initial opacity respects options', () => {
    const c = new Controls({ opacity: 75 });
    assertEqual(c.getOpacity(), 75, 'Initial opacity should be 75');
  });

  // ========================================================================
  // Event Emitter Tests
  // ========================================================================

  console.log('\n=== Event Emitter Tests ===\n');

  runner.test('Controls has on method', () => {
    controls = new Controls();
    assertType(controls.on, 'function', 'Controls should have on method');
  });

  runner.test('Controls has off method', () => {
    controls = new Controls();
    assertType(controls.off, 'function', 'Controls should have off method');
  });

  runner.test('Controls has emit method', () => {
    controls = new Controls();
    assertType(controls.emit, 'function', 'Controls should have emit method');
  });

  runner.test('layerToggle event is emitted on setLayerEnabled', () => {
    controls = new Controls();
    let eventReceived = false;
    let eventData = null;

    controls.on('layerToggle', (data) => {
      eventReceived = true;
      eventData = data;
    });

    controls.setLayerEnabled('satellites', false);

    assert(eventReceived, 'layerToggle event should be emitted');
    assertEqual(eventData.layer, 'satellites', 'Event should contain layer name');
    assertEqual(eventData.enabled, false, 'Event should contain enabled state');
  });

  runner.test('modeChange event is emitted on setVisualMode', () => {
    controls = new Controls();
    let eventReceived = false;
    let eventData = null;

    controls.on('modeChange', (data) => {
      eventReceived = true;
      eventData = data;
    });

    controls.setVisualMode('nvg');

    assert(eventReceived, 'modeChange event should be emitted');
    assertEqual(eventData.mode, 'nvg', 'Event should contain new mode');
    assertEqual(eventData.previousMode, 'none', 'Event should contain previous mode');
  });

  runner.test('opacityChange event is emitted on setOpacity', () => {
    controls = new Controls();
    let eventReceived = false;
    let eventData = null;

    controls.on('opacityChange', (data) => {
      eventReceived = true;
      eventData = data;
    });

    controls.setOpacity(50);

    assert(eventReceived, 'opacityChange event should be emitted');
    assertEqual(eventData.opacity, 50, 'Event should contain new opacity');
    assertEqual(eventData.previousOpacity, 100, 'Event should contain previous opacity');
  });

  runner.test('event listener can be removed with off', () => {
    controls = new Controls();
    let callCount = 0;

    const listener = () => { callCount++; };
    controls.on('layerToggle', listener);
    controls.setLayerEnabled('flights', false);
    assertEqual(callCount, 1, 'Listener should be called once');

    controls.off('layerToggle', listener);
    controls.setLayerEnabled('flights', true);
    assertEqual(callCount, 1, 'Listener should not be called after removal');
  });

  runner.test('no event emitted when state does not change', () => {
    controls = new Controls({ opacity: 50 });
    let eventReceived = false;

    controls.on('opacityChange', () => { eventReceived = true; });
    controls.setOpacity(50); // Same value

    assert(!eventReceived, 'Event should not be emitted when value unchanged');
  });

  // ========================================================================
  // Render Method Tests (No DOM)
  // ========================================================================

  console.log('\n=== Render Method Tests ===\n');

  runner.test('Controls has render method', () => {
    controls = new Controls();
    assertType(controls.render, 'function', 'Controls should have render method');
  });

  runner.test('render returns null when DOM unavailable', () => {
    controls = new Controls();
    const result = controls.render('non-existent');
    assertEqual(result, null, 'render should return null without DOM');
  });

  runner.test('Controls has destroy method', () => {
    controls = new Controls();
    assertType(controls.destroy, 'function', 'Controls should have destroy method');
  });

  runner.test('destroy does not crash without DOM', () => {
    controls = new Controls();
    controls.destroy(); // Should not throw
    assert(true, 'destroy should not crash without DOM');
  });

  // ========================================================================
  // Interface Completeness Tests
  // ========================================================================

  console.log('\n=== Interface Completeness Tests ===\n');

  runner.test('Controls exposes all required layer methods', () => {
    controls = new Controls();
    assertType(controls.getLayerStates, 'function', 'Missing getLayerStates');
    assertType(controls.isLayerEnabled, 'function', 'Missing isLayerEnabled');
    assertType(controls.setLayerEnabled, 'function', 'Missing setLayerEnabled');
    assertType(controls.toggleLayer, 'function', 'Missing toggleLayer');
  });

  runner.test('Controls exposes all required mode methods', () => {
    controls = new Controls();
    assertType(controls.getVisualMode, 'function', 'Missing getVisualMode');
    assertType(controls.setVisualMode, 'function', 'Missing setVisualMode');
  });

  runner.test('Controls exposes all required opacity methods', () => {
    controls = new Controls();
    assertType(controls.getOpacity, 'function', 'Missing getOpacity');
    assertType(controls.setOpacity, 'function', 'Missing setOpacity');
  });

  return runner.summary();
}

// Direct execution support
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  run().then(success => {
    process.exit(success ? 0 : 1);
  });
}
