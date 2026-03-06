/**
 * Tests for SGP4 Orbit Propagator Wrapper
 * Exports run() function and supports direct execution.
 */

import { propagateTLE } from '../src/utils/sgp4.js';

/**
 * Simple assertion helper
 */
function assertTrue(condition, message) {
  if (!condition) {
    throw new Error(`${message}: expected true, got false`);
  }
}

function assertThrows(fn, message) {
  let threw = false;
  try {
    fn();
  } catch (e) {
    threw = true;
  }
  if (!threw) {
    throw new Error(`${message}: expected function to throw`);
  }
}

/**
 * Test propagation with known ISS TLE
 * Uses a real ISS TLE from late 2023
 */
function testISSPropagation() {
  console.log('  Testing ISS TLE propagation...');

  // ISS TLE (ZARYA) - a known good TLE
  const line1 = '1 25544U 98067A   23365.50000000  .00016717  00000-0  30270-3 0  9993';
  const line2 = '2 25544  51.6400  10.0000 0001234  85.0000 275.0000 15.50000000000017';

  // Propagate to a specific date (December 31, 2023)
  const date = new Date('2023-12-31T12:00:00.000Z');

  const result = propagateTLE(line1, line2, date);

  // Verify we got a result
  assertTrue(result !== null, 'propagateTLE should return a result');

  // Verify lat is within valid range (-90 to 90)
  assertTrue(
    result.lat >= -90 && result.lat <= 90,
    `Latitude should be between -90 and 90, got ${result.lat}`
  );

  // Verify lon is within valid range (-180 to 180)
  assertTrue(
    result.lon >= -180 && result.lon <= 180,
    `Longitude should be between -180 and 180, got ${result.lon}`
  );

  // ISS altitude is typically 300-450 km
  assertTrue(
    result.alt >= 300 && result.alt <= 450,
    `ISS altitude should be between 300-450 km, got ${result.alt}`
  );

  console.log(`    Position: lat=${result.lat.toFixed(4)}°, lon=${result.lon.toFixed(4)}°, alt=${result.alt.toFixed(2)} km`);
  console.log('  ✓ ISS TLE propagation test passed');
}

/**
 * Test propagation at different times
 */
function testMultipleTimes() {
  console.log('  Testing propagation at multiple times...');

  // ISS TLE
  const line1 = '1 25544U 98067A   23365.50000000  .00016717  00000-0  30270-3 0  9993';
  const line2 = '2 25544  51.6400  10.0000 0001234  85.0000 275.0000 15.50000000000017';

  // ISS completes about 15.5 orbits per day, so one orbit takes ~93 minutes
  const baseDate = new Date('2023-12-31T12:00:00.000Z');

  const results = [];
  for (let i = 0; i < 4; i++) {
    const date = new Date(baseDate.getTime() + i * 30 * 60 * 1000); // Every 30 minutes
    const result = propagateTLE(line1, line2, date);
    assertTrue(result !== null, `Propagation at time ${i} should succeed`);
    results.push(result);
  }

  // Verify positions are different at different times
  const firstPos = results[0];
  const lastPos = results[3];
  assertTrue(
    firstPos.lat !== lastPos.lat || firstPos.lon !== lastPos.lon,
    'Positions at different times should be different'
  );

  // All positions should still be in valid ranges
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    assertTrue(r.lat >= -90 && r.lat <= 90, `Position ${i} latitude in range`);
    assertTrue(r.lon >= -180 && r.lon <= 180, `Position ${i} longitude in range`);
    assertTrue(r.alt >= 300 && r.alt <= 450, `Position ${i} altitude in range`);
  }

  console.log('  ✓ Multiple times test passed');
}

/**
 * Test error handling with invalid TLE
 */
function testInvalidTLE() {
  console.log('  Testing invalid TLE handling...');

  const date = new Date('2023-12-31T12:00:00.000Z');

  // Test with empty strings
  assertThrows(
    () => propagateTLE('', '', date),
    'Should throw for empty TLE strings'
  );

  // Test with null
  assertThrows(
    () => propagateTLE(null, null, date),
    'Should throw for null TLE'
  );

  // Test with invalid date
  const validLine1 = '1 25544U 98067A   23365.50000000  .00016717  00000-0  30270-3 0  9993';
  const validLine2 = '2 25544  51.6400  10.0000 0001234  85.0000 275.0000 15.50000000000017';

  assertThrows(
    () => propagateTLE(validLine1, validLine2, 'not a date'),
    'Should throw for invalid date'
  );

  assertThrows(
    () => propagateTLE(validLine1, validLine2, new Date('invalid')),
    'Should throw for invalid date object'
  );

  console.log('  ✓ Invalid TLE handling test passed');
}

/**
 * Test with another known satellite (Hubble Space Telescope)
 */
function testHubblePropagation() {
  console.log('  Testing Hubble TLE propagation...');

  // Hubble TLE - orbits at about 540 km altitude
  const line1 = '1 20580U 90037B   23365.50000000  .00001100  00000-0  55000-4 0  9991';
  const line2 = '2 20580  28.4700 200.0000 0002500  90.0000 270.0000 15.09000000000015';

  const date = new Date('2023-12-31T12:00:00.000Z');
  const result = propagateTLE(line1, line2, date);

  assertTrue(result !== null, 'Hubble propagation should return a result');

  // Verify valid ranges
  assertTrue(result.lat >= -90 && result.lat <= 90, `Latitude in range, got ${result.lat}`);
  assertTrue(result.lon >= -180 && result.lon <= 180, `Longitude in range, got ${result.lon}`);

  // Hubble orbits at about 540 km, allow range 500-600 km
  assertTrue(
    result.alt >= 500 && result.alt <= 600,
    `Hubble altitude should be ~540 km, got ${result.alt}`
  );

  console.log(`    Position: lat=${result.lat.toFixed(4)}°, lon=${result.lon.toFixed(4)}°, alt=${result.alt.toFixed(2)} km`);
  console.log('  ✓ Hubble TLE propagation test passed');
}

/**
 * Run all tests
 * @returns {boolean} true if all tests pass
 */
export function run() {
  console.log('Running SGP4 orbit propagator tests...\n');

  let passed = true;

  try {
    testISSPropagation();
  } catch (error) {
    console.error('  ✗ ISS propagation test failed:', error.message);
    passed = false;
  }

  try {
    testMultipleTimes();
  } catch (error) {
    console.error('  ✗ Multiple times test failed:', error.message);
    passed = false;
  }

  try {
    testInvalidTLE();
  } catch (error) {
    console.error('  ✗ Invalid TLE handling test failed:', error.message);
    passed = false;
  }

  try {
    testHubblePropagation();
  } catch (error) {
    console.error('  ✗ Hubble propagation test failed:', error.message);
    passed = false;
  }

  console.log('');

  if (passed) {
    console.log('All SGP4 propagator tests passed! ✓');
  } else {
    console.log('Some tests failed! ✗');
  }

  return passed;
}

// Support direct execution
const isDirectRun = import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  const success = run();
  process.exit(success ? 0 : 1);
}
