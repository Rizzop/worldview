/**
 * Tests for Seismic Data Layer
 * Tests GeoJSON parsing with mock data - no live network calls required.
 * Exports run() function and supports direct execution.
 */

import { SeismicLayer, DEFAULT_USGS_URL } from '../src/layers/seismic.js';

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

function assertClose(actual, expected, tolerance, message) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message}: expected ${expected} ± ${tolerance}, got ${actual}`);
  }
}

/**
 * Sample USGS GeoJSON data for testing
 * Note: GeoJSON coordinates are [lon, lat, depth]
 */
const SAMPLE_GEOJSON = {
  type: 'FeatureCollection',
  metadata: {
    generated: 1709740800000,
    url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson',
    title: 'USGS All Earthquakes, Past Day',
    status: 200,
    count: 3
  },
  features: [
    {
      type: 'Feature',
      id: 'us7000m1ab',
      properties: {
        mag: 5.2,
        place: '50 km SSW of Tonga',
        time: 1709740000000,
        url: 'https://earthquake.usgs.gov/earthquakes/eventpage/us7000m1ab'
      },
      geometry: {
        type: 'Point',
        coordinates: [-175.5, -21.3, 10.5]  // [lon, lat, depth]
      }
    },
    {
      type: 'Feature',
      id: 'nc73123456',
      properties: {
        mag: 2.8,
        place: '15 km NE of San Jose, CA',
        time: 1709738000000,
        url: 'https://earthquake.usgs.gov/earthquakes/eventpage/nc73123456'
      },
      geometry: {
        type: 'Point',
        coordinates: [-121.75, 37.45, 8.2]  // [lon, lat, depth]
      }
    },
    {
      type: 'Feature',
      id: 'ak023abcde',
      properties: {
        mag: 4.1,
        place: '100 km SE of Anchorage, Alaska',
        time: 1709735000000,
        url: 'https://earthquake.usgs.gov/earthquakes/eventpage/ak023abcde'
      },
      geometry: {
        type: 'Point',
        coordinates: [-148.2, 60.5, 45.0]  // [lon, lat, depth]
      }
    }
  ]
};

/**
 * Test default configuration
 */
function testDefaultConfig() {
  console.log('  Testing default configuration...');

  const layer = new SeismicLayer();

  assertEqual(layer.url, DEFAULT_USGS_URL, 'Default URL should be USGS all_day feed');
  assertEqual(layer.timeout, 30000, 'Default timeout should be 30000ms');
  assertEqual(layer.retries, 3, 'Default retries should be 3');
  assertEqual(layer.earthquakes.length, 0, 'Initial earthquakes should be empty');
  assertEqual(layer.lastFetch, null, 'Initial lastFetch should be null');

  console.log('  ✓ Default configuration tests passed');
}

/**
 * Test custom configuration
 */
function testCustomConfig() {
  console.log('  Testing custom configuration...');

  const customUrl = 'https://example.com/earthquakes.geojson';
  const layer = new SeismicLayer({
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
 * Test parsing GeoJSON data
 */
function testParseGeoJSON() {
  console.log('  Testing GeoJSON parsing...');

  const layer = new SeismicLayer();
  const earthquakes = layer.parseResponse(SAMPLE_GEOJSON);

  assertEqual(earthquakes.length, 3, 'Should parse 3 earthquakes');
  assertEqual(layer.count, 3, 'Count property should return 3');

  // Verify first earthquake (Tonga)
  const tonga = earthquakes[0];
  assertEqual(tonga.id, 'us7000m1ab', 'First earthquake ID should match');
  assertEqual(tonga.magnitude, 5.2, 'Magnitude should be 5.2');
  assertEqual(tonga.place, '50 km SSW of Tonga', 'Place should match');
  assertTrue(tonga.url.includes('us7000m1ab'), 'URL should contain event ID');

  console.log('  ✓ GeoJSON parsing tests passed');
}

/**
 * Test coordinate conversion (GeoJSON [lon, lat, depth] -> {lat, lon, depth})
 */
function testCoordinateConversion() {
  console.log('  Testing coordinate conversion...');

  const layer = new SeismicLayer();
  const earthquakes = layer.parseResponse(SAMPLE_GEOJSON);

  // Verify Tonga coordinates are correctly converted
  const tonga = earthquakes[0];
  // GeoJSON: [-175.5, -21.3, 10.5] = [lon, lat, depth]
  assertClose(tonga.lon, -175.5, 0.001, 'Longitude should be -175.5');
  assertClose(tonga.lat, -21.3, 0.001, 'Latitude should be -21.3');
  assertClose(tonga.depth, 10.5, 0.001, 'Depth should be 10.5 km');

  // Verify San Jose coordinates
  const sanJose = earthquakes[1];
  // GeoJSON: [-121.75, 37.45, 8.2] = [lon, lat, depth]
  assertClose(sanJose.lon, -121.75, 0.001, 'San Jose longitude should be -121.75');
  assertClose(sanJose.lat, 37.45, 0.001, 'San Jose latitude should be 37.45');
  assertClose(sanJose.depth, 8.2, 0.001, 'San Jose depth should be 8.2 km');

  // Verify Alaska coordinates
  const alaska = earthquakes[2];
  // GeoJSON: [-148.2, 60.5, 45.0] = [lon, lat, depth]
  assertClose(alaska.lon, -148.2, 0.001, 'Alaska longitude should be -148.2');
  assertClose(alaska.lat, 60.5, 0.001, 'Alaska latitude should be 60.5');
  assertClose(alaska.depth, 45.0, 0.001, 'Alaska depth should be 45.0 km');

  console.log('  ✓ Coordinate conversion tests passed');
}

/**
 * Test timestamp parsing
 */
function testTimestampParsing() {
  console.log('  Testing timestamp parsing...');

  const layer = new SeismicLayer();
  const earthquakes = layer.parseResponse(SAMPLE_GEOJSON);

  const tonga = earthquakes[0];
  assertTrue(tonga.timestamp instanceof Date, 'Timestamp should be a Date object');
  assertEqual(tonga.timestamp.getTime(), 1709740000000, 'Timestamp should match');

  console.log('  ✓ Timestamp parsing tests passed');
}

/**
 * Test earthquake lookup by ID
 */
function testGetEarthquakeById() {
  console.log('  Testing earthquake lookup by ID...');

  const layer = new SeismicLayer();
  layer.parseResponse(SAMPLE_GEOJSON);

  const tonga = layer.getEarthquakeById('us7000m1ab');
  assertTrue(tonga !== null, 'Should find Tonga earthquake by ID');
  assertEqual(tonga.magnitude, 5.2, 'Found earthquake should have correct magnitude');

  const sanJose = layer.getEarthquakeById('nc73123456');
  assertTrue(sanJose !== null, 'Should find San Jose earthquake by ID');
  assertEqual(sanJose.magnitude, 2.8, 'Found earthquake should have correct magnitude');

  const notFound = layer.getEarthquakeById('nonexistent');
  assertEqual(notFound, null, 'Should return null for unknown ID');

  console.log('  ✓ Earthquake lookup by ID tests passed');
}

/**
 * Test filtering by magnitude
 */
function testGetEarthquakesByMagnitude() {
  console.log('  Testing earthquake filtering by magnitude...');

  const layer = new SeismicLayer();
  layer.parseResponse(SAMPLE_GEOJSON);

  // Filter for magnitude >= 4.0
  const largQuakes = layer.getEarthquakesByMagnitude(4.0);
  assertEqual(largQuakes.length, 2, 'Should find 2 earthquakes >= 4.0');

  // Filter for magnitude >= 5.0
  const majorQuakes = layer.getEarthquakesByMagnitude(5.0);
  assertEqual(majorQuakes.length, 1, 'Should find 1 earthquake >= 5.0');
  assertEqual(majorQuakes[0].id, 'us7000m1ab', 'Major quake should be Tonga');

  // Filter for magnitude >= 6.0
  const veryLarge = layer.getEarthquakesByMagnitude(6.0);
  assertEqual(veryLarge.length, 0, 'Should find 0 earthquakes >= 6.0');

  console.log('  ✓ Earthquake filtering by magnitude tests passed');
}

/**
 * Test getInfo method
 */
function testGetInfo() {
  console.log('  Testing getInfo method...');

  const layer = new SeismicLayer();
  layer.parseResponse(SAMPLE_GEOJSON);

  const info = layer.getInfo('us7000m1ab');
  assertTrue(info !== null, 'Should return info for valid ID');
  assertEqual(info.id, 'us7000m1ab', 'Info ID should match');
  assertEqual(info.magnitude, 5.2, 'Info magnitude should match');
  assertClose(info.lat, -21.3, 0.001, 'Info lat should match');
  assertClose(info.lon, -175.5, 0.001, 'Info lon should match');
  assertClose(info.depth, 10.5, 0.001, 'Info depth should match');

  const notFound = layer.getInfo('nonexistent');
  assertEqual(notFound, null, 'Should return null for invalid ID');

  console.log('  ✓ getInfo method tests passed');
}

/**
 * Test empty/invalid input handling
 */
function testInvalidInput() {
  console.log('  Testing invalid input handling...');

  const layer = new SeismicLayer();

  // Null
  let result = layer.parseResponse(null);
  assertEqual(result.length, 0, 'Null should return empty array');

  // Undefined
  result = layer.parseResponse(undefined);
  assertEqual(result.length, 0, 'Undefined should return empty array');

  // Empty object
  result = layer.parseResponse({});
  assertEqual(result.length, 0, 'Empty object should return empty array');

  // Object without features
  result = layer.parseResponse({ type: 'FeatureCollection' });
  assertEqual(result.length, 0, 'Object without features should return empty array');

  // Features is not an array
  result = layer.parseResponse({ features: 'not an array' });
  assertEqual(result.length, 0, 'Features not array should return empty array');

  console.log('  ✓ Invalid input handling tests passed');
}

/**
 * Test partial/malformed feature handling
 */
function testPartialFeatures() {
  console.log('  Testing partial feature handling...');

  const layer = new SeismicLayer();

  const partialGeoJSON = {
    type: 'FeatureCollection',
    features: [
      // Valid feature
      {
        type: 'Feature',
        id: 'valid1',
        properties: { mag: 3.0, place: 'Test Location', time: 1709740000000 },
        geometry: { type: 'Point', coordinates: [-100, 35, 5] }
      },
      // Missing geometry
      {
        type: 'Feature',
        id: 'invalid1',
        properties: { mag: 2.0 }
      },
      // Missing properties
      {
        type: 'Feature',
        id: 'invalid2',
        geometry: { type: 'Point', coordinates: [-100, 35, 5] }
      },
      // Invalid coordinates (too short)
      {
        type: 'Feature',
        id: 'invalid3',
        properties: { mag: 2.0 },
        geometry: { type: 'Point', coordinates: [-100, 35] }
      },
      // Another valid feature
      {
        type: 'Feature',
        id: 'valid2',
        properties: { mag: 4.5, place: 'Another Location', time: 1709745000000 },
        geometry: { type: 'Point', coordinates: [120, -10, 20] }
      }
    ]
  };

  const result = layer.parseResponse(partialGeoJSON);
  assertEqual(result.length, 2, 'Should parse 2 valid features, skip 3 invalid');
  assertEqual(result[0].id, 'valid1', 'First should be valid1');
  assertEqual(result[1].id, 'valid2', 'Second should be valid2');

  console.log('  ✓ Partial feature handling tests passed');
}

/**
 * Test that null magnitude is handled
 */
function testNullMagnitude() {
  console.log('  Testing null magnitude handling...');

  const layer = new SeismicLayer();

  const geoJSONWithNullMag = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        id: 'nullmag1',
        properties: { mag: null, place: 'Unknown Magnitude', time: 1709740000000 },
        geometry: { type: 'Point', coordinates: [-100, 35, 5] }
      }
    ]
  };

  const result = layer.parseResponse(geoJSONWithNullMag);
  assertEqual(result.length, 1, 'Should parse earthquake with null magnitude');
  assertEqual(result[0].magnitude, null, 'Magnitude should be null');

  // Null magnitude should be excluded from magnitude filter
  const filtered = layer.getEarthquakesByMagnitude(0);
  assertEqual(filtered.length, 0, 'Null magnitude should not pass magnitude filter');

  console.log('  ✓ Null magnitude handling tests passed');
}

/**
 * Test internal storage replacement
 */
function testInternalStorage() {
  console.log('  Testing internal storage...');

  const layer = new SeismicLayer();
  assertEqual(layer.earthquakes.length, 0, 'Initial earthquakes should be empty');

  layer.parseResponse(SAMPLE_GEOJSON);
  assertEqual(layer.earthquakes.length, 3, 'Earthquakes should be stored internally');

  // Parse again with different data - should replace
  const singleQuake = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        id: 'single1',
        properties: { mag: 6.0, place: 'Test', time: 1709740000000 },
        geometry: { type: 'Point', coordinates: [0, 0, 10] }
      }
    ]
  };

  layer.parseResponse(singleQuake);
  assertEqual(layer.earthquakes.length, 1, 'Earthquakes should be replaced on new parse');

  console.log('  ✓ Internal storage tests passed');
}

/**
 * Run all tests
 * @returns {boolean} true if all tests pass
 */
export function run() {
  console.log('Running Seismic Layer tests...\n');

  let passed = true;

  const tests = [
    { name: 'Default config', fn: testDefaultConfig },
    { name: 'Custom config', fn: testCustomConfig },
    { name: 'GeoJSON parsing', fn: testParseGeoJSON },
    { name: 'Coordinate conversion', fn: testCoordinateConversion },
    { name: 'Timestamp parsing', fn: testTimestampParsing },
    { name: 'Earthquake lookup by ID', fn: testGetEarthquakeById },
    { name: 'Filter by magnitude', fn: testGetEarthquakesByMagnitude },
    { name: 'getInfo method', fn: testGetInfo },
    { name: 'Invalid input handling', fn: testInvalidInput },
    { name: 'Partial feature handling', fn: testPartialFeatures },
    { name: 'Null magnitude handling', fn: testNullMagnitude },
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
    console.log('All Seismic Layer tests passed! ✓');
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
