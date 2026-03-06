/**
 * Tests for Configuration Module
 * Validates config structure, types, and required fields.
 * Exports run() function and supports direct execution.
 */

import { fileURLToPath } from 'url';
import { readFile } from 'fs/promises';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

function assertObject(value, message) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(message || `Expected object, got ${typeof value}`);
  }
}

function assertArray(value, message) {
  if (!Array.isArray(value)) {
    throw new Error(message || `Expected array, got ${typeof value}`);
  }
}

function assertNumber(value, message) {
  if (typeof value !== 'number' || isNaN(value)) {
    throw new Error(message || `Expected number, got ${typeof value}`);
  }
}

function assertString(value, message) {
  if (typeof value !== 'string') {
    throw new Error(message || `Expected string, got ${typeof value}`);
  }
}

function assertInRange(value, min, max, message) {
  if (value < min || value > max) {
    throw new Error(message || `Expected ${value} to be in range [${min}, ${max}]`);
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
      console.log(`  \u2713 ${name}`);
    } catch (error) {
      this.failed++;
      this.results.push({ name, status: 'FAIL', error: error.message });
      console.log(`  \u2717 ${name}`);
      console.log(`    Error: ${error.message}`);
    }
  }

  async testAsync(name, fn) {
    try {
      await fn();
      this.passed++;
      this.results.push({ name, status: 'PASS' });
      console.log(`  \u2713 ${name}`);
    } catch (error) {
      this.failed++;
      this.results.push({ name, status: 'FAIL', error: error.message });
      console.log(`  \u2717 ${name}`);
      console.log(`    Error: ${error.message}`);
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
 * Configuration validation utilities (to be tested)
 */
const ConfigValidator = {
  /**
   * Validate a complete config object
   */
  validate(config) {
    const errors = [];

    // Check top-level required fields
    if (!config.CESIUM_ION_TOKEN || typeof config.CESIUM_ION_TOKEN !== 'string') {
      errors.push('CESIUM_ION_TOKEN must be a non-empty string');
    }

    if (!config.n2yoApiKey || typeof config.n2yoApiKey !== 'string') {
      errors.push('n2yoApiKey must be a non-empty string');
    }

    if (!config.spaceTrackUsername || typeof config.spaceTrackUsername !== 'string') {
      errors.push('spaceTrackUsername must be a non-empty string');
    }

    if (!config.spaceTrackPassword || typeof config.spaceTrackPassword !== 'string') {
      errors.push('spaceTrackPassword must be a non-empty string');
    }

    // Validate refreshRates
    if (config.refreshRates) {
      if (typeof config.refreshRates !== 'object') {
        errors.push('refreshRates must be an object');
      } else {
        const rates = config.refreshRates;
        if (typeof rates.satellitePositionUpdate !== 'number' || rates.satellitePositionUpdate < 100) {
          errors.push('refreshRates.satellitePositionUpdate must be >= 100ms');
        }
        if (typeof rates.tleFetch !== 'number' || rates.tleFetch < 60000) {
          errors.push('refreshRates.tleFetch must be >= 60000ms');
        }
        if (typeof rates.visibilityUpdate !== 'number' || rates.visibilityUpdate < 1000) {
          errors.push('refreshRates.visibilityUpdate must be >= 1000ms');
        }
        if (typeof rates.groundStationUpdate !== 'number' || rates.groundStationUpdate < 1000) {
          errors.push('refreshRates.groundStationUpdate must be >= 1000ms');
        }
      }
    }

    // Validate view settings
    if (config.view) {
      if (typeof config.view !== 'object') {
        errors.push('view must be an object');
      } else {
        const view = config.view;
        if (typeof view.defaultLatitude !== 'number' || view.defaultLatitude < -90 || view.defaultLatitude > 90) {
          errors.push('view.defaultLatitude must be a number between -90 and 90');
        }
        if (typeof view.defaultLongitude !== 'number' || view.defaultLongitude < -180 || view.defaultLongitude > 180) {
          errors.push('view.defaultLongitude must be a number between -180 and 180');
        }
        if (typeof view.defaultHeight !== 'number' || view.defaultHeight < 0) {
          errors.push('view.defaultHeight must be a positive number');
        }
        if (typeof view.fov !== 'number' || view.fov < 1 || view.fov > 179) {
          errors.push('view.fov must be a number between 1 and 179');
        }
      }
    }

    // Validate satellites settings
    if (config.satellites) {
      if (typeof config.satellites !== 'object') {
        errors.push('satellites must be an object');
      } else {
        const sats = config.satellites;
        if (typeof sats.maxDisplayed !== 'number' || sats.maxDisplayed < 1) {
          errors.push('satellites.maxDisplayed must be a positive number');
        }
        if (typeof sats.minElevation !== 'number' || sats.minElevation < 0 || sats.minElevation > 90) {
          errors.push('satellites.minElevation must be a number between 0 and 90');
        }
        if (!Array.isArray(sats.defaultCategories)) {
          errors.push('satellites.defaultCategories must be an array');
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  },

  /**
   * Create a default config object
   */
  createDefault() {
    return {
      CESIUM_ION_TOKEN: '',
      n2yoApiKey: '',
      spaceTrackUsername: '',
      spaceTrackPassword: '',
      refreshRates: {
        satellitePositionUpdate: 1000,
        tleFetch: 3600000,
        visibilityUpdate: 5000,
        groundStationUpdate: 2000
      },
      view: {
        defaultLatitude: 0,
        defaultLongitude: 0,
        defaultHeight: 20000000,
        fov: 60
      },
      satellites: {
        maxDisplayed: 1000,
        minElevation: 10,
        defaultCategories: ['active', 'weather', 'communications', 'navigation', 'science']
      }
    };
  },

  /**
   * Merge user config with defaults
   */
  merge(userConfig, defaults) {
    const result = { ...defaults };

    for (const key in userConfig) {
      if (typeof userConfig[key] === 'object' && !Array.isArray(userConfig[key]) && userConfig[key] !== null) {
        result[key] = { ...defaults[key], ...userConfig[key] };
      } else {
        result[key] = userConfig[key];
      }
    }

    return result;
  }
};

/**
 * Run all config tests
 */
export async function run() {
  const runner = new TestRunner();

  console.log('\n=== Config Example File Tests ===\n');

  // ========================================================================
  // Config Example File Tests
  // ========================================================================

  let configModule;

  await runner.testAsync('config.example.js can be imported', async () => {
    configModule = await import('../config.example.js');
    assert(configModule !== undefined, 'Failed to import config.example.js');
  });

  await runner.testAsync('config.example.js exports config object', async () => {
    assert(configModule.config !== undefined, 'config export not found');
    assertObject(configModule.config, 'config should be an object');
  });

  await runner.testAsync('config.example.js has default export', async () => {
    assert(configModule.default !== undefined, 'default export not found');
    assertEqual(configModule.default, configModule.config, 'default export should be config');
  });

  console.log('\n=== Config Structure Tests ===\n');

  // ========================================================================
  // Config Structure Tests
  // ========================================================================

  runner.test('config has CESIUM_ION_TOKEN field', () => {
    assert('CESIUM_ION_TOKEN' in configModule.config, 'Missing CESIUM_ION_TOKEN');
    assertString(configModule.config.CESIUM_ION_TOKEN, 'CESIUM_ION_TOKEN should be string');
  });

  runner.test('config has n2yoApiKey field', () => {
    assert('n2yoApiKey' in configModule.config, 'Missing n2yoApiKey');
    assertString(configModule.config.n2yoApiKey, 'n2yoApiKey should be string');
  });

  runner.test('config has spaceTrackUsername field', () => {
    assert('spaceTrackUsername' in configModule.config, 'Missing spaceTrackUsername');
    assertString(configModule.config.spaceTrackUsername, 'spaceTrackUsername should be string');
  });

  runner.test('config has spaceTrackPassword field', () => {
    assert('spaceTrackPassword' in configModule.config, 'Missing spaceTrackPassword');
    assertString(configModule.config.spaceTrackPassword, 'spaceTrackPassword should be string');
  });

  console.log('\n=== Refresh Rates Tests ===\n');

  // ========================================================================
  // Refresh Rates Tests
  // ========================================================================

  runner.test('config has refreshRates object', () => {
    assert('refreshRates' in configModule.config, 'Missing refreshRates');
    assertObject(configModule.config.refreshRates, 'refreshRates should be an object');
  });

  runner.test('refreshRates has satellitePositionUpdate', () => {
    assertNumber(configModule.config.refreshRates.satellitePositionUpdate, 'Missing satellitePositionUpdate');
    assert(configModule.config.refreshRates.satellitePositionUpdate > 0, 'satellitePositionUpdate should be positive');
  });

  runner.test('refreshRates has tleFetch', () => {
    assertNumber(configModule.config.refreshRates.tleFetch, 'Missing tleFetch');
    assert(configModule.config.refreshRates.tleFetch > 0, 'tleFetch should be positive');
  });

  runner.test('refreshRates has visibilityUpdate', () => {
    assertNumber(configModule.config.refreshRates.visibilityUpdate, 'Missing visibilityUpdate');
    assert(configModule.config.refreshRates.visibilityUpdate > 0, 'visibilityUpdate should be positive');
  });

  runner.test('refreshRates has groundStationUpdate', () => {
    assertNumber(configModule.config.refreshRates.groundStationUpdate, 'Missing groundStationUpdate');
    assert(configModule.config.refreshRates.groundStationUpdate > 0, 'groundStationUpdate should be positive');
  });

  console.log('\n=== View Settings Tests ===\n');

  // ========================================================================
  // View Settings Tests
  // ========================================================================

  runner.test('config has view object', () => {
    assert('view' in configModule.config, 'Missing view');
    assertObject(configModule.config.view, 'view should be an object');
  });

  runner.test('view has defaultLatitude', () => {
    assertNumber(configModule.config.view.defaultLatitude, 'Missing defaultLatitude');
    assertInRange(configModule.config.view.defaultLatitude, -90, 90, 'defaultLatitude out of range');
  });

  runner.test('view has defaultLongitude', () => {
    assertNumber(configModule.config.view.defaultLongitude, 'Missing defaultLongitude');
    assertInRange(configModule.config.view.defaultLongitude, -180, 180, 'defaultLongitude out of range');
  });

  runner.test('view has defaultHeight', () => {
    assertNumber(configModule.config.view.defaultHeight, 'Missing defaultHeight');
    assert(configModule.config.view.defaultHeight > 0, 'defaultHeight should be positive');
  });

  runner.test('view has fov', () => {
    assertNumber(configModule.config.view.fov, 'Missing fov');
    assertInRange(configModule.config.view.fov, 1, 179, 'fov out of range');
  });

  console.log('\n=== Satellites Settings Tests ===\n');

  // ========================================================================
  // Satellites Settings Tests
  // ========================================================================

  runner.test('config has satellites object', () => {
    assert('satellites' in configModule.config, 'Missing satellites');
    assertObject(configModule.config.satellites, 'satellites should be an object');
  });

  runner.test('satellites has maxDisplayed', () => {
    assertNumber(configModule.config.satellites.maxDisplayed, 'Missing maxDisplayed');
    assert(configModule.config.satellites.maxDisplayed > 0, 'maxDisplayed should be positive');
  });

  runner.test('satellites has minElevation', () => {
    assertNumber(configModule.config.satellites.minElevation, 'Missing minElevation');
    assertInRange(configModule.config.satellites.minElevation, 0, 90, 'minElevation out of range');
  });

  runner.test('satellites has defaultCategories', () => {
    assertArray(configModule.config.satellites.defaultCategories, 'defaultCategories should be an array');
    assert(configModule.config.satellites.defaultCategories.length > 0, 'defaultCategories should not be empty');
  });

  runner.test('defaultCategories contains expected values', () => {
    const categories = configModule.config.satellites.defaultCategories;
    assert(categories.includes('active'), 'Missing active category');
    assert(categories.includes('weather'), 'Missing weather category');
    assert(categories.includes('communications'), 'Missing communications category');
  });

  console.log('\n=== ConfigValidator Tests ===\n');

  // ========================================================================
  // ConfigValidator Tests
  // ========================================================================

  runner.test('ConfigValidator.createDefault returns valid structure', () => {
    const defaultConfig = ConfigValidator.createDefault();
    assertObject(defaultConfig, 'createDefault should return an object');
    assert('CESIUM_ION_TOKEN' in defaultConfig, 'Missing CESIUM_ION_TOKEN in default');
    assert('refreshRates' in defaultConfig, 'Missing refreshRates in default');
    assert('view' in defaultConfig, 'Missing view in default');
    assert('satellites' in defaultConfig, 'Missing satellites in default');
  });

  runner.test('ConfigValidator.validate detects missing required fields', () => {
    const emptyConfig = {};
    const result = ConfigValidator.validate(emptyConfig);
    assertEqual(result.valid, false, 'Empty config should be invalid');
    assert(result.errors.length > 0, 'Should have validation errors');
  });

  runner.test('ConfigValidator.validate accepts valid config', () => {
    const validConfig = {
      CESIUM_ION_TOKEN: 'test-token',
      n2yoApiKey: 'test-key',
      spaceTrackUsername: 'test-user',
      spaceTrackPassword: 'test-pass',
      refreshRates: {
        satellitePositionUpdate: 1000,
        tleFetch: 3600000,
        visibilityUpdate: 5000,
        groundStationUpdate: 2000
      },
      view: {
        defaultLatitude: 0,
        defaultLongitude: 0,
        defaultHeight: 20000000,
        fov: 60
      },
      satellites: {
        maxDisplayed: 1000,
        minElevation: 10,
        defaultCategories: ['active']
      }
    };
    const result = ConfigValidator.validate(validConfig);
    assertEqual(result.valid, true, 'Valid config should pass validation');
    assertEqual(result.errors.length, 0, 'Should have no validation errors');
  });

  runner.test('ConfigValidator.validate detects invalid refresh rates', () => {
    const config = {
      CESIUM_ION_TOKEN: 'test',
      n2yoApiKey: 'test',
      spaceTrackUsername: 'test',
      spaceTrackPassword: 'test',
      refreshRates: {
        satellitePositionUpdate: 10, // Too low
        tleFetch: 1000, // Too low
        visibilityUpdate: 100, // Too low
        groundStationUpdate: 100 // Too low
      }
    };
    const result = ConfigValidator.validate(config);
    assertEqual(result.valid, false, 'Config with invalid rates should fail');
    assert(result.errors.some(e => e.includes('satellitePositionUpdate')), 'Should detect invalid satellitePositionUpdate');
  });

  runner.test('ConfigValidator.validate detects invalid view settings', () => {
    const config = {
      CESIUM_ION_TOKEN: 'test',
      n2yoApiKey: 'test',
      spaceTrackUsername: 'test',
      spaceTrackPassword: 'test',
      view: {
        defaultLatitude: 200, // Out of range
        defaultLongitude: 0,
        defaultHeight: -1000, // Negative
        fov: 200 // Out of range
      }
    };
    const result = ConfigValidator.validate(config);
    assertEqual(result.valid, false, 'Config with invalid view should fail');
  });

  runner.test('ConfigValidator.merge combines configs correctly', () => {
    const defaults = ConfigValidator.createDefault();
    const userConfig = {
      CESIUM_ION_TOKEN: 'my-token',
      view: {
        defaultLatitude: 40
      }
    };
    const merged = ConfigValidator.merge(userConfig, defaults);
    assertEqual(merged.CESIUM_ION_TOKEN, 'my-token', 'Should use user token');
    assertEqual(merged.view.defaultLatitude, 40, 'Should use user latitude');
    assertEqual(merged.view.defaultLongitude, 0, 'Should preserve default longitude');
    assert('refreshRates' in merged, 'Should preserve default refreshRates');
  });

  runner.test('ConfigValidator.merge preserves arrays from user config', () => {
    const defaults = ConfigValidator.createDefault();
    const userConfig = {
      satellites: {
        defaultCategories: ['custom1', 'custom2']
      }
    };
    const merged = ConfigValidator.merge(userConfig, defaults);
    assertEqual(merged.satellites.defaultCategories.length, 2, 'Should use user categories');
    assert(merged.satellites.defaultCategories.includes('custom1'), 'Should include custom1');
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
