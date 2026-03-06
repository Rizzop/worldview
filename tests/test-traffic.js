/**
 * Tests for Traffic Data Layer - OSM Road Network
 * Tests Overpass API JSON parsing with mock data - no live network calls required.
 * Exports run() function and supports direct execution.
 */

import { TrafficLayer, DEFAULT_OVERPASS_URL } from '../src/layers/traffic.js';

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
 * Sample Overpass API JSON response for testing
 * Contains nodes and ways representing a small road network
 */
const SAMPLE_OVERPASS_RESPONSE = {
  version: 0.6,
  generator: 'Overpass API',
  osm3s: {
    timestamp_osm_base: '2024-03-06T10:00:00Z',
    copyright: 'The data is from OpenStreetMap, ODbL 1.0'
  },
  elements: [
    // Nodes for Main Street
    { type: 'node', id: 1001, lat: 37.7749, lon: -122.4194 },
    { type: 'node', id: 1002, lat: 37.7750, lon: -122.4180 },
    { type: 'node', id: 1003, lat: 37.7751, lon: -122.4165 },
    { type: 'node', id: 1004, lat: 37.7752, lon: -122.4150 },

    // Nodes for Oak Avenue
    { type: 'node', id: 2001, lat: 37.7760, lon: -122.4200 },
    { type: 'node', id: 2002, lat: 37.7755, lon: -122.4185 },
    { type: 'node', id: 2003, lat: 37.7750, lon: -122.4180 }, // Shared with Main Street

    // Nodes for Highway 101
    { type: 'node', id: 3001, lat: 37.7700, lon: -122.4300 },
    { type: 'node', id: 3002, lat: 37.7720, lon: -122.4250 },
    { type: 'node', id: 3003, lat: 37.7740, lon: -122.4200 },
    { type: 'node', id: 3004, lat: 37.7760, lon: -122.4150 },
    { type: 'node', id: 3005, lat: 37.7780, lon: -122.4100 },

    // Way: Main Street (primary road)
    {
      type: 'way',
      id: 10001,
      nodes: [1001, 1002, 1003, 1004],
      tags: {
        highway: 'primary',
        name: 'Main Street',
        lanes: '2'
      }
    },

    // Way: Oak Avenue (residential road)
    {
      type: 'way',
      id: 10002,
      nodes: [2001, 2002, 2003],
      tags: {
        highway: 'residential',
        name: 'Oak Avenue'
      }
    },

    // Way: Highway 101 (motorway)
    {
      type: 'way',
      id: 10003,
      nodes: [3001, 3002, 3003, 3004, 3005],
      tags: {
        highway: 'motorway',
        name: 'US Highway 101',
        ref: 'US 101',
        lanes: '4'
      }
    }
  ]
};

/**
 * Test default configuration
 */
function testDefaultConfig() {
  console.log('  Testing default configuration...');

  const layer = new TrafficLayer();

  assertEqual(layer.url, DEFAULT_OVERPASS_URL, 'Default URL should be Overpass API');
  assertEqual(layer.timeout, 60000, 'Default timeout should be 60000ms');
  assertEqual(layer.retries, 3, 'Default retries should be 3');
  assertEqual(layer.roadSegments.length, 0, 'Initial roadSegments should be empty');
  assertEqual(layer.lastFetch, null, 'Initial lastFetch should be null');

  console.log('  ✓ Default configuration tests passed');
}

/**
 * Test custom configuration
 */
function testCustomConfig() {
  console.log('  Testing custom configuration...');

  const customUrl = 'https://custom-overpass.example.com/api/interpreter';
  const layer = new TrafficLayer({
    url: customUrl,
    timeout: 120000,
    retries: 5,
  });

  assertEqual(layer.url, customUrl, 'Custom URL should be set');
  assertEqual(layer.timeout, 120000, 'Custom timeout should be set');
  assertEqual(layer.retries, 5, 'Custom retries should be set');

  console.log('  ✓ Custom configuration tests passed');
}

/**
 * Test parsing Overpass JSON response
 */
function testParseResponse() {
  console.log('  Testing Overpass JSON parsing...');

  const layer = new TrafficLayer();
  const roads = layer.parseResponse(SAMPLE_OVERPASS_RESPONSE);

  assertEqual(roads.length, 3, 'Should parse 3 road segments');
  assertEqual(layer.count, 3, 'Count property should return 3');

  // Verify Main Street
  const mainStreet = roads.find(r => r.id === 10001);
  assertTrue(mainStreet !== undefined, 'Should find Main Street');
  assertEqual(mainStreet.highway, 'primary', 'Main Street should be primary');
  assertEqual(mainStreet.name, 'Main Street', 'Name should be Main Street');
  assertEqual(mainStreet.waypoints.length, 4, 'Main Street should have 4 waypoints');

  // Verify Highway 101
  const highway101 = roads.find(r => r.id === 10003);
  assertTrue(highway101 !== undefined, 'Should find Highway 101');
  assertEqual(highway101.highway, 'motorway', 'Highway 101 should be motorway');
  assertEqual(highway101.waypoints.length, 5, 'Highway 101 should have 5 waypoints');

  console.log('  ✓ Overpass JSON parsing tests passed');
}

/**
 * Test waypoint coordinate extraction
 */
function testWaypointCoordinates() {
  console.log('  Testing waypoint coordinate extraction...');

  const layer = new TrafficLayer();
  layer.parseResponse(SAMPLE_OVERPASS_RESPONSE);

  // Check Main Street waypoints
  const mainStreet = layer.getRoadById(10001);
  assertTrue(mainStreet !== null, 'Should find Main Street by ID');

  // First waypoint should match node 1001
  assertClose(mainStreet.waypoints[0].lat, 37.7749, 0.0001, 'First waypoint lat');
  assertClose(mainStreet.waypoints[0].lon, -122.4194, 0.0001, 'First waypoint lon');

  // Last waypoint should match node 1004
  assertClose(mainStreet.waypoints[3].lat, 37.7752, 0.0001, 'Last waypoint lat');
  assertClose(mainStreet.waypoints[3].lon, -122.4150, 0.0001, 'Last waypoint lon');

  console.log('  ✓ Waypoint coordinate extraction tests passed');
}

/**
 * Test road lookup by ID
 */
function testGetRoadById() {
  console.log('  Testing road lookup by ID...');

  const layer = new TrafficLayer();
  layer.parseResponse(SAMPLE_OVERPASS_RESPONSE);

  const mainStreet = layer.getRoadById(10001);
  assertTrue(mainStreet !== null, 'Should find Main Street by ID');
  assertEqual(mainStreet.name, 'Main Street', 'Found road name should match');

  const oakAvenue = layer.getRoadById(10002);
  assertTrue(oakAvenue !== null, 'Should find Oak Avenue by ID');
  assertEqual(oakAvenue.highway, 'residential', 'Oak Avenue should be residential');

  const notFound = layer.getRoadById(99999);
  assertEqual(notFound, null, 'Should return null for unknown ID');

  console.log('  ✓ Road lookup by ID tests passed');
}

/**
 * Test filtering by highway type
 */
function testGetRoadsByType() {
  console.log('  Testing road filtering by type...');

  const layer = new TrafficLayer();
  layer.parseResponse(SAMPLE_OVERPASS_RESPONSE);

  // Single type
  const motorways = layer.getRoadsByType('motorway');
  assertEqual(motorways.length, 1, 'Should find 1 motorway');
  assertEqual(motorways[0].name, 'US Highway 101', 'Motorway should be Highway 101');

  // Multiple types
  const majorRoads = layer.getRoadsByType(['motorway', 'primary']);
  assertEqual(majorRoads.length, 2, 'Should find 2 major roads');

  // No matches
  const cycleways = layer.getRoadsByType('cycleway');
  assertEqual(cycleways.length, 0, 'Should find 0 cycleways');

  console.log('  ✓ Road filtering by type tests passed');
}

/**
 * Test getting named roads
 */
function testGetNamedRoads() {
  console.log('  Testing named roads filter...');

  const layer = new TrafficLayer();
  layer.parseResponse(SAMPLE_OVERPASS_RESPONSE);

  const namedRoads = layer.getNamedRoads();
  assertEqual(namedRoads.length, 3, 'All 3 roads have names');

  console.log('  ✓ Named roads filter tests passed');
}

/**
 * Test total waypoints count
 */
function testTotalWaypoints() {
  console.log('  Testing total waypoints count...');

  const layer = new TrafficLayer();
  layer.parseResponse(SAMPLE_OVERPASS_RESPONSE);

  // Main Street: 4, Oak Avenue: 3, Highway 101: 5
  assertEqual(layer.totalWaypoints, 12, 'Total waypoints should be 12');

  console.log('  ✓ Total waypoints count tests passed');
}

/**
 * Test getInfo method
 */
function testGetInfo() {
  console.log('  Testing getInfo method...');

  const layer = new TrafficLayer();
  layer.parseResponse(SAMPLE_OVERPASS_RESPONSE);

  const info = layer.getInfo(10001);
  assertTrue(info !== null, 'Should return info for valid ID');
  assertEqual(info.id, 10001, 'Info ID should match');
  assertEqual(info.highway, 'primary', 'Info highway should match');
  assertEqual(info.name, 'Main Street', 'Info name should match');
  assertEqual(info.waypointCount, 4, 'Info waypointCount should match');
  assertEqual(info.waypoints.length, 4, 'Info waypoints should be included');

  const notFound = layer.getInfo(99999);
  assertEqual(notFound, null, 'Should return null for invalid ID');

  console.log('  ✓ getInfo method tests passed');
}

/**
 * Test empty/invalid input handling
 */
function testInvalidInput() {
  console.log('  Testing invalid input handling...');

  const layer = new TrafficLayer();

  // Null
  let result = layer.parseResponse(null);
  assertEqual(result.length, 0, 'Null should return empty array');

  // Undefined
  result = layer.parseResponse(undefined);
  assertEqual(result.length, 0, 'Undefined should return empty array');

  // Empty object
  result = layer.parseResponse({});
  assertEqual(result.length, 0, 'Empty object should return empty array');

  // Object without elements
  result = layer.parseResponse({ version: 0.6 });
  assertEqual(result.length, 0, 'Object without elements should return empty array');

  // Elements is not an array
  result = layer.parseResponse({ elements: 'not an array' });
  assertEqual(result.length, 0, 'Elements not array should return empty array');

  console.log('  ✓ Invalid input handling tests passed');
}

/**
 * Test partial/malformed element handling
 */
function testPartialElements() {
  console.log('  Testing partial element handling...');

  const layer = new TrafficLayer();

  const partialResponse = {
    version: 0.6,
    elements: [
      // Valid nodes
      { type: 'node', id: 100, lat: 37.0, lon: -122.0 },
      { type: 'node', id: 101, lat: 37.1, lon: -122.1 },
      { type: 'node', id: 102, lat: 37.2, lon: -122.2 },

      // Valid way
      {
        type: 'way',
        id: 1000,
        nodes: [100, 101, 102],
        tags: { highway: 'secondary', name: 'Valid Road' }
      },

      // Way with missing nodes array
      {
        type: 'way',
        id: 1001,
        tags: { highway: 'tertiary' }
      },

      // Way with only one node (invalid)
      {
        type: 'way',
        id: 1002,
        nodes: [100],
        tags: { highway: 'residential' }
      },

      // Way referencing non-existent nodes
      {
        type: 'way',
        id: 1003,
        nodes: [999, 998],
        tags: { highway: 'primary' }
      },

      // Another valid way
      {
        type: 'way',
        id: 1004,
        nodes: [100, 102],
        tags: { highway: 'unclassified' }
      }
    ]
  };

  const result = layer.parseResponse(partialResponse);
  assertEqual(result.length, 2, 'Should parse 2 valid ways, skip invalid ones');
  assertEqual(result[0].id, 1000, 'First should be Valid Road');
  assertEqual(result[1].id, 1004, 'Second should be unclassified way');

  console.log('  ✓ Partial element handling tests passed');
}

/**
 * Test way without tags
 */
function testWayWithoutTags() {
  console.log('  Testing way without tags...');

  const layer = new TrafficLayer();

  const responseNoTags = {
    version: 0.6,
    elements: [
      { type: 'node', id: 100, lat: 37.0, lon: -122.0 },
      { type: 'node', id: 101, lat: 37.1, lon: -122.1 },
      {
        type: 'way',
        id: 1000,
        nodes: [100, 101]
        // No tags property
      }
    ]
  };

  const result = layer.parseResponse(responseNoTags);
  assertEqual(result.length, 1, 'Should parse way without tags');
  assertEqual(result[0].highway, null, 'Highway should be null');
  assertEqual(result[0].name, null, 'Name should be null');

  console.log('  ✓ Way without tags tests passed');
}

/**
 * Test internal storage replacement
 */
function testInternalStorage() {
  console.log('  Testing internal storage...');

  const layer = new TrafficLayer();
  assertEqual(layer.roadSegments.length, 0, 'Initial roadSegments should be empty');

  layer.parseResponse(SAMPLE_OVERPASS_RESPONSE);
  assertEqual(layer.roadSegments.length, 3, 'Roads should be stored internally');

  // Parse again with different data - should replace
  const singleRoad = {
    version: 0.6,
    elements: [
      { type: 'node', id: 1, lat: 0, lon: 0 },
      { type: 'node', id: 2, lat: 1, lon: 1 },
      { type: 'way', id: 1, nodes: [1, 2], tags: { highway: 'path' } }
    ]
  };

  layer.parseResponse(singleRoad);
  assertEqual(layer.roadSegments.length, 1, 'Roads should be replaced on new parse');

  console.log('  ✓ Internal storage tests passed');
}

/**
 * Test node with invalid coordinates
 */
function testInvalidNodeCoordinates() {
  console.log('  Testing invalid node coordinates...');

  const layer = new TrafficLayer();

  const responseInvalidNodes = {
    version: 0.6,
    elements: [
      // Valid nodes
      { type: 'node', id: 100, lat: 37.0, lon: -122.0 },
      { type: 'node', id: 101, lat: 37.1, lon: -122.1 },

      // Invalid nodes
      { type: 'node', id: 102, lat: 'invalid', lon: -122.2 },
      { type: 'node', id: 103, lat: 37.3, lon: null },
      { type: 'node', id: 104 }, // Missing lat/lon

      // Way that references mix of valid and invalid nodes
      {
        type: 'way',
        id: 1000,
        nodes: [100, 102, 103, 101],
        tags: { highway: 'path' }
      }
    ]
  };

  const result = layer.parseResponse(responseInvalidNodes);
  assertEqual(result.length, 1, 'Should parse 1 way');
  assertEqual(result[0].waypoints.length, 2, 'Should only have 2 valid waypoints');

  console.log('  ✓ Invalid node coordinates tests passed');
}

/**
 * Run all tests
 * @returns {boolean} true if all tests pass
 */
export function run() {
  console.log('Running Traffic Layer tests...\n');

  let passed = true;

  const tests = [
    { name: 'Default config', fn: testDefaultConfig },
    { name: 'Custom config', fn: testCustomConfig },
    { name: 'Overpass JSON parsing', fn: testParseResponse },
    { name: 'Waypoint coordinates', fn: testWaypointCoordinates },
    { name: 'Road lookup by ID', fn: testGetRoadById },
    { name: 'Filter by type', fn: testGetRoadsByType },
    { name: 'Named roads filter', fn: testGetNamedRoads },
    { name: 'Total waypoints count', fn: testTotalWaypoints },
    { name: 'getInfo method', fn: testGetInfo },
    { name: 'Invalid input handling', fn: testInvalidInput },
    { name: 'Partial element handling', fn: testPartialElements },
    { name: 'Way without tags', fn: testWayWithoutTags },
    { name: 'Internal storage', fn: testInternalStorage },
    { name: 'Invalid node coordinates', fn: testInvalidNodeCoordinates },
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
    console.log('All Traffic Layer tests passed! ✓');
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
