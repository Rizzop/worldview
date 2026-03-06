/**
 * Tests for Satellite Data Layer
 * Tests TLE parsing with mock data - no live network calls required.
 * Exports run() function and supports direct execution.
 */

import { SatelliteLayer, DEFAULT_TLE_URL } from '../src/layers/satellites.js';

/**
 * Simple assertion helpers
 */
function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function assertTrue(condition, message) {
  if (!condition) {
    throw new Error(`${message}: expected true, got false`);
  }
}

/**
 * Sample TLE data for testing (3-line format: name, line1, line2)
 * Using real ISS and Hubble TLE format for realistic testing
 */
const SAMPLE_TLE_DATA = `ISS (ZARYA)
1 25544U 98067A   23365.50000000  .00016717  00000-0  30270-3 0  9993
2 25544  51.6400  10.0000 0001234  85.0000 275.0000 15.50000000000017
HUBBLE SPACE TELESCOPE
1 20580U 90037B   23365.50000000  .00001100  00000-0  55000-4 0  9991
2 20580  28.4700 200.0000 0002500  90.0000 270.0000 15.09000000000015
STARLINK-1234
1 44235U 19029K   23365.50000000  .00002500  00000-0  12000-3 0  9997
2 44235  53.0500 100.0000 0001500  45.0000 315.0000 15.05000000000012`;

/**
 * Test default configuration
 */
function testDefaultConfig() {
  console.log('  Testing default configuration...');

  const layer = new SatelliteLayer();

  assertEqual(layer.url, DEFAULT_TLE_URL, 'Default URL should be CelesTrak active satellites');
  assertEqual(layer.timeout, 30000, 'Default timeout should be 30000ms');
  assertEqual(layer.retries, 3, 'Default retries should be 3');
  assertEqual(layer.satellites.length, 0, 'Initial satellites should be empty');
  assertEqual(layer.lastFetch, null, 'Initial lastFetch should be null');

  console.log('  ✓ Default configuration tests passed');
}

/**
 * Test custom configuration
 */
function testCustomConfig() {
  console.log('  Testing custom configuration...');

  const customUrl = 'https://example.com/tle.txt';
  const layer = new SatelliteLayer({
    url: customUrl,
    timeout: 5000,
    retries: 5,
  });

  assertEqual(layer.url, customUrl, 'Custom URL should be set');
  assertEqual(layer.timeout, 5000, 'Custom timeout should be set');
  assertEqual(layer.retries, 5, 'Custom retries should be set');

  console.log('  ✓ Custom configuration tests passed');
}

/**
 * Test parsing TLE data
 */
function testParseTLE() {
  console.log('  Testing TLE parsing...');

  const layer = new SatelliteLayer();
  const date = new Date('2023-12-31T12:00:00.000Z');

  const satellites = layer.parseResponse(SAMPLE_TLE_DATA, date);

  assertEqual(satellites.length, 3, 'Should parse 3 satellites');
  assertEqual(layer.count, 3, 'Count property should return 3');

  // Verify ISS
  const iss = satellites[0];
  assertEqual(iss.name, 'ISS (ZARYA)', 'First satellite should be ISS');
  assertEqual(iss.noradId, 25544, 'ISS NORAD ID should be 25544');
  assertTrue(iss.line1.startsWith('1 25544'), 'ISS line1 should start correctly');
  assertTrue(iss.line2.startsWith('2 25544'), 'ISS line2 should start correctly');
  assertTrue(iss.position !== null, 'ISS position should be computed');

  // Verify Hubble
  const hubble = satellites[1];
  assertEqual(hubble.name, 'HUBBLE SPACE TELESCOPE', 'Second satellite should be Hubble');
  assertEqual(hubble.noradId, 20580, 'Hubble NORAD ID should be 20580');
  assertTrue(hubble.position !== null, 'Hubble position should be computed');

  // Verify Starlink
  const starlink = satellites[2];
  assertEqual(starlink.name, 'STARLINK-1234', 'Third satellite should be Starlink');
  assertEqual(starlink.noradId, 44235, 'Starlink NORAD ID should be 44235');
  assertTrue(starlink.position !== null, 'Starlink position should be computed');

  console.log('  ✓ TLE parsing tests passed');
}

/**
 * Test position computation
 */
function testPositionComputation() {
  console.log('  Testing position computation...');

  const layer = new SatelliteLayer();
  const date = new Date('2023-12-31T12:00:00.000Z');

  const satellites = layer.parseResponse(SAMPLE_TLE_DATA, date);
  const iss = satellites[0];

  // Verify position values are in valid ranges
  assertTrue(iss.position !== null, 'Position should be computed');
  assertTrue(
    iss.position.lat >= -90 && iss.position.lat <= 90,
    `Latitude should be -90 to 90, got ${iss.position.lat}`
  );
  assertTrue(
    iss.position.lon >= -180 && iss.position.lon <= 180,
    `Longitude should be -180 to 180, got ${iss.position.lon}`
  );
  assertTrue(
    iss.position.alt >= 300 && iss.position.alt <= 450,
    `ISS altitude should be 300-450 km, got ${iss.position.alt}`
  );

  console.log(`    ISS Position: lat=${iss.position.lat.toFixed(4)}°, lon=${iss.position.lon.toFixed(4)}°, alt=${iss.position.alt.toFixed(2)} km`);
  console.log('  ✓ Position computation tests passed');
}

/**
 * Test position updates at different times
 */
function testPositionUpdate() {
  console.log('  Testing position updates...');

  const layer = new SatelliteLayer();
  const date1 = new Date('2023-12-31T12:00:00.000Z');

  layer.parseResponse(SAMPLE_TLE_DATA, date1);
  const pos1 = { ...layer.satellites[0].position };

  // Update to a different time (30 minutes later)
  const date2 = new Date('2023-12-31T12:30:00.000Z');
  layer.updatePositions(date2);
  const pos2 = layer.satellites[0].position;

  // Positions should be different
  assertTrue(
    pos1.lat !== pos2.lat || pos1.lon !== pos2.lon,
    'Position should change at different times'
  );

  console.log('  ✓ Position update tests passed');
}

/**
 * Test satellite lookup by ID
 */
function testGetSatelliteById() {
  console.log('  Testing satellite lookup by ID...');

  const layer = new SatelliteLayer();
  layer.parseResponse(SAMPLE_TLE_DATA, new Date('2023-12-31T12:00:00.000Z'));

  const iss = layer.getSatelliteById(25544);
  assertTrue(iss !== null, 'Should find ISS by ID');
  assertEqual(iss.name, 'ISS (ZARYA)', 'Found satellite should be ISS');

  const hubble = layer.getSatelliteById(20580);
  assertTrue(hubble !== null, 'Should find Hubble by ID');
  assertEqual(hubble.name, 'HUBBLE SPACE TELESCOPE', 'Found satellite should be Hubble');

  const notFound = layer.getSatelliteById(99999);
  assertEqual(notFound, null, 'Should return null for unknown ID');

  console.log('  ✓ Satellite lookup by ID tests passed');
}

/**
 * Test satellite lookup by name
 */
function testGetSatellitesByName() {
  console.log('  Testing satellite lookup by name...');

  const layer = new SatelliteLayer();
  layer.parseResponse(SAMPLE_TLE_DATA, new Date('2023-12-31T12:00:00.000Z'));

  // Exact match (case insensitive)
  const issResults = layer.getSatellitesByName('iss');
  assertEqual(issResults.length, 1, 'Should find one ISS match');
  assertEqual(issResults[0].name, 'ISS (ZARYA)', 'Match should be ISS');

  // Partial match
  const starResults = layer.getSatellitesByName('STAR');
  assertEqual(starResults.length, 1, 'Should find one Starlink match');
  assertEqual(starResults[0].name, 'STARLINK-1234', 'Match should be Starlink');

  // No match
  const noResults = layer.getSatellitesByName('NONEXISTENT');
  assertEqual(noResults.length, 0, 'Should find no matches');

  console.log('  ✓ Satellite lookup by name tests passed');
}

/**
 * Test empty/invalid input handling
 */
function testInvalidInput() {
  console.log('  Testing invalid input handling...');

  const layer = new SatelliteLayer();

  // Empty string
  let result = layer.parseResponse('');
  assertEqual(result.length, 0, 'Empty string should return empty array');

  // Null
  result = layer.parseResponse(null);
  assertEqual(result.length, 0, 'Null should return empty array');

  // Undefined
  result = layer.parseResponse(undefined);
  assertEqual(result.length, 0, 'Undefined should return empty array');

  // Invalid TLE lines (wrong format)
  const invalidTLE = `INVALID SAT
NOT A TLE LINE
ALSO NOT TLE`;
  result = layer.parseResponse(invalidTLE);
  assertEqual(result.length, 0, 'Invalid TLE should return empty array');

  console.log('  ✓ Invalid input handling tests passed');
}

/**
 * Test partial/malformed TLE data
 */
function testPartialTLE() {
  console.log('  Testing partial TLE data...');

  const layer = new SatelliteLayer();

  // TLE with one valid and one invalid entry
  const partialTLE = `ISS (ZARYA)
1 25544U 98067A   23365.50000000  .00016717  00000-0  30270-3 0  9993
2 25544  51.6400  10.0000 0001234  85.0000 275.0000 15.50000000000017
INVALID SATELLITE
NOT A TLE
STILL NOT TLE
ANOTHER VALID SAT
1 99999U 20001A   23365.50000000  .00001000  00000-0  10000-3 0  9999
2 99999  45.0000  90.0000 0000100  30.0000 330.0000 15.00000000000001`;

  const result = layer.parseResponse(partialTLE, new Date('2023-12-31T12:00:00.000Z'));

  // Should parse 2 valid entries, skipping the invalid one
  assertEqual(result.length, 2, 'Should parse 2 valid satellites, skip invalid');
  assertEqual(result[0].name, 'ISS (ZARYA)', 'First should be ISS');
  assertEqual(result[1].name, 'ANOTHER VALID SAT', 'Second should be the other valid sat');

  console.log('  ✓ Partial TLE data tests passed');
}

/**
 * Test that layer stores satellites internally
 */
function testInternalStorage() {
  console.log('  Testing internal storage...');

  const layer = new SatelliteLayer();
  assertEqual(layer.satellites.length, 0, 'Initial satellites should be empty');

  layer.parseResponse(SAMPLE_TLE_DATA, new Date('2023-12-31T12:00:00.000Z'));
  assertEqual(layer.satellites.length, 3, 'Satellites should be stored internally');

  // Parse again with different data - should replace
  const singleSat = `TEST SAT
1 11111U 10001A   23365.50000000  .00001000  00000-0  10000-3 0  9999
2 11111  45.0000  90.0000 0000100  30.0000 330.0000 15.00000000000001`;

  layer.parseResponse(singleSat, new Date('2023-12-31T12:00:00.000Z'));
  assertEqual(layer.satellites.length, 1, 'Satellites should be replaced on new parse');

  console.log('  ✓ Internal storage tests passed');
}

/**
 * Run all tests
 * @returns {boolean} true if all tests pass
 */
export function run() {
  console.log('Running Satellite Layer tests...\n');

  let passed = true;

  const tests = [
    { name: 'Default config', fn: testDefaultConfig },
    { name: 'Custom config', fn: testCustomConfig },
    { name: 'TLE parsing', fn: testParseTLE },
    { name: 'Position computation', fn: testPositionComputation },
    { name: 'Position updates', fn: testPositionUpdate },
    { name: 'Satellite lookup by ID', fn: testGetSatelliteById },
    { name: 'Satellite lookup by name', fn: testGetSatellitesByName },
    { name: 'Invalid input handling', fn: testInvalidInput },
    { name: 'Partial TLE data', fn: testPartialTLE },
    { name: 'Internal storage', fn: testInternalStorage },
  ];

  for (const test of tests) {
    try {
      test.fn();
    } catch (error) {
      console.error(`  ✗ ${test.name} test failed:`, error.message);
      passed = false;
    }
  }

  console.log('');

  if (passed) {
    console.log('All Satellite Layer tests passed! ✓');
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
