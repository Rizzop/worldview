/**
 * Tests for Flight Data Layer (OpenSky Network)
 * Tests parsing with mock data - no live network calls required.
 * Exports run() function and supports direct execution.
 */

import { FlightLayer, DEFAULT_OPENSKY_URL, OPENSKY_FIELDS } from '../src/layers/flights.js';

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

function assertApproxEqual(actual, expected, tolerance, message) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message}: expected ~${expected}, got ${actual}`);
  }
}

/**
 * Sample OpenSky API response for testing
 * Based on real response format: https://openskynetwork.github.io/opensky-api/rest.html
 *
 * Each state vector is an array with fields:
 * [0] icao24, [1] callsign, [2] origin_country, [3] time_position, [4] last_contact,
 * [5] longitude, [6] latitude, [7] baro_altitude, [8] on_ground, [9] velocity,
 * [10] true_track, [11] vertical_rate, [12] sensors, [13] geo_altitude, [14] squawk,
 * [15] spi, [16] position_source
 */
const SAMPLE_OPENSKY_RESPONSE = {
  time: 1704067200, // Unix timestamp
  states: [
    // Flight 1: UAL123 - United Airlines over California
    [
      'a12345',          // icao24
      'UAL123  ',        // callsign (padded to 8 chars)
      'United States',   // origin_country
      1704067195,        // time_position
      1704067199,        // last_contact
      -122.4194,         // longitude (San Francisco area)
      37.7749,           // latitude
      10668.0,           // baro_altitude (35,000 ft in meters)
      false,             // on_ground
      250.5,             // velocity (m/s)
      45.0,              // true_track (heading NE)
      0.0,               // vertical_rate
      null,              // sensors
      10700.0,           // geo_altitude
      '1200',            // squawk (VFR code)
      false,             // spi
      0                  // position_source (ADS-B)
    ],
    // Flight 2: DLH456 - Lufthansa over Atlantic
    [
      'abc789',          // icao24
      'DLH456  ',        // callsign
      'Germany',         // origin_country
      1704067190,        // time_position
      1704067198,        // last_contact
      -45.0,             // longitude (mid-Atlantic)
      42.5,              // latitude
      11887.2,           // baro_altitude (39,000 ft)
      false,             // on_ground
      265.3,             // velocity (m/s)
      90.0,              // true_track (heading E)
      -1.5,              // vertical_rate (descending slightly)
      null,              // sensors
      11900.0,           // geo_altitude
      '7700',            // squawk (emergency code)
      false,             // spi
      0                  // position_source
    ],
    // Flight 3: On ground at JFK
    [
      'def012',          // icao24
      'AAL789  ',        // callsign (American Airlines)
      'United States',   // origin_country
      1704067180,        // time_position
      1704067195,        // last_contact
      -73.7781,          // longitude (JFK Airport)
      40.6413,           // latitude
      null,              // baro_altitude (null when on ground)
      true,              // on_ground
      5.2,               // velocity (taxiing)
      180.0,             // true_track (heading S)
      0.0,               // vertical_rate
      null,              // sensors
      4.0,               // geo_altitude (runway elevation)
      '1200',            // squawk
      false,             // spi
      0                  // position_source
    ],
    // Flight 4: No callsign
    [
      'xyz999',          // icao24
      null,              // callsign (null - no callsign)
      'France',          // origin_country
      1704067185,        // time_position
      1704067197,        // last_contact
      2.3522,            // longitude (Paris area)
      48.8566,           // latitude
      8534.4,            // baro_altitude (28,000 ft)
      false,             // on_ground
      220.0,             // velocity
      270.0,             // true_track (heading W)
      5.0,               // vertical_rate (climbing)
      null,              // sensors
      8550.0,            // geo_altitude
      null,              // squawk (null)
      false,             // spi
      1                  // position_source (ASTERIX)
    ],
    // Flight 5: No position data (should be skipped)
    [
      'nopos1',          // icao24
      'TEST999 ',        // callsign
      'Canada',          // origin_country
      null,              // time_position
      1704067190,        // last_contact
      null,              // longitude (null - no position)
      null,              // latitude (null - no position)
      null,              // baro_altitude
      false,             // on_ground
      null,              // velocity
      null,              // true_track
      null,              // vertical_rate
      null,              // sensors
      null,              // geo_altitude
      null,              // squawk
      false,             // spi
      0                  // position_source
    ],
  ]
};

/**
 * Test default configuration
 */
function testDefaultConfig() {
  console.log('  Testing default configuration...');

  const layer = new FlightLayer();

  assertEqual(layer.baseUrl, DEFAULT_OPENSKY_URL, 'Default URL should be OpenSky states/all');
  assertEqual(layer.timeout, 30000, 'Default timeout should be 30000ms');
  assertEqual(layer.retries, 3, 'Default retries should be 3');
  assertEqual(layer.username, null, 'Default username should be null');
  assertEqual(layer.password, null, 'Default password should be null');
  assertEqual(layer.bounds, null, 'Default bounds should be null');
  assertEqual(layer.flights.length, 0, 'Initial flights should be empty');
  assertEqual(layer.lastFetch, null, 'Initial lastFetch should be null');

  console.log('  ✓ Default configuration tests passed');
}

/**
 * Test custom configuration
 */
function testCustomConfig() {
  console.log('  Testing custom configuration...');

  const customUrl = 'https://custom.opensky.org/api/states/all';
  const layer = new FlightLayer({
    url: customUrl,
    username: 'testuser',
    password: 'testpass',
    timeout: 5000,
    retries: 5,
    bounds: { lamin: 40, lomin: -80, lamax: 50, lomax: -70 },
  });

  assertEqual(layer.baseUrl, customUrl, 'Custom URL should be set');
  assertEqual(layer.username, 'testuser', 'Username should be set');
  assertEqual(layer.password, 'testpass', 'Password should be set');
  assertEqual(layer.timeout, 5000, 'Custom timeout should be set');
  assertEqual(layer.retries, 5, 'Custom retries should be set');
  assertEqual(layer.bounds.lamin, 40, 'Bounds lamin should be set');
  assertEqual(layer.bounds.lomax, -70, 'Bounds lomax should be set');

  console.log('  ✓ Custom configuration tests passed');
}

/**
 * Test URL building with bounds
 */
function testUrlBuilding() {
  console.log('  Testing URL building...');

  // Without bounds
  const layer1 = new FlightLayer();
  const url1 = layer1._buildUrl();
  assertEqual(url1, DEFAULT_OPENSKY_URL, 'URL without bounds should be base URL');

  // With bounds
  const layer2 = new FlightLayer({
    bounds: { lamin: 45.0, lomin: -130.0, lamax: 50.0, lomax: -120.0 },
  });
  const url2 = layer2._buildUrl();
  assertTrue(url2.includes('lamin=45'), 'URL should contain lamin parameter');
  assertTrue(url2.includes('lomin=-130'), 'URL should contain lomin parameter');
  assertTrue(url2.includes('lamax=50'), 'URL should contain lamax parameter');
  assertTrue(url2.includes('lomax=-120'), 'URL should contain lomax parameter');

  console.log('  ✓ URL building tests passed');
}

/**
 * Test parsing OpenSky response
 */
function testParseResponse() {
  console.log('  Testing response parsing...');

  const layer = new FlightLayer();
  const flights = layer.parseResponse(SAMPLE_OPENSKY_RESPONSE);

  // Should parse 4 flights (1 has no position and should be skipped)
  assertEqual(flights.length, 4, 'Should parse 4 flights (skip one without position)');
  assertEqual(layer.count, 4, 'Count property should return 4');

  // Verify first flight (UAL123)
  const flight1 = flights[0];
  assertEqual(flight1.icao24, 'a12345', 'First flight icao24 should be a12345');
  assertEqual(flight1.callsign, 'UAL123', 'First flight callsign should be UAL123 (trimmed)');
  assertEqual(flight1.originCountry, 'United States', 'First flight origin should be United States');
  assertApproxEqual(flight1.lat, 37.7749, 0.0001, 'First flight latitude');
  assertApproxEqual(flight1.lon, -122.4194, 0.0001, 'First flight longitude');
  assertApproxEqual(flight1.altitude, 10668.0, 0.1, 'First flight altitude');
  assertApproxEqual(flight1.velocity, 250.5, 0.1, 'First flight velocity');
  assertEqual(flight1.heading, 45.0, 'First flight heading');
  assertEqual(flight1.onGround, false, 'First flight should not be on ground');
  assertEqual(flight1.squawk, '1200', 'First flight squawk');

  // Verify second flight (DLH456)
  const flight2 = flights[1];
  assertEqual(flight2.icao24, 'abc789', 'Second flight icao24');
  assertEqual(flight2.callsign, 'DLH456', 'Second flight callsign');
  assertEqual(flight2.originCountry, 'Germany', 'Second flight origin');
  assertEqual(flight2.squawk, '7700', 'Second flight squawk (emergency)');
  assertApproxEqual(flight2.verticalRate, -1.5, 0.1, 'Second flight vertical rate');

  // Verify third flight (on ground)
  const flight3 = flights[2];
  assertEqual(flight3.callsign, 'AAL789', 'Third flight callsign');
  assertEqual(flight3.onGround, true, 'Third flight should be on ground');
  // baro_altitude is null, so it falls back to geo_altitude which is 4.0
  assertEqual(flight3.altitude, 4.0, 'Third flight altitude should use geo_altitude as fallback');

  console.log('  ✓ Response parsing tests passed');
}

/**
 * Test flight object field extraction
 */
function testFlightFields() {
  console.log('  Testing flight field extraction...');

  const layer = new FlightLayer();
  const flights = layer.parseResponse(SAMPLE_OPENSKY_RESPONSE);

  // Test flight with null callsign
  const noCallsignFlight = flights[3]; // xyz999
  assertEqual(noCallsignFlight.icao24, 'xyz999', 'No-callsign flight icao24');
  assertEqual(noCallsignFlight.callsign, null, 'Null callsign should remain null');
  assertEqual(noCallsignFlight.originCountry, 'France', 'Origin country should be France');
  assertApproxEqual(noCallsignFlight.verticalRate, 5.0, 0.1, 'Vertical rate (climbing)');

  // Test altitude fallback (uses geo_altitude when baro is null)
  const groundFlight = flights[2]; // On ground at JFK
  // baro_altitude is null, geo_altitude is 4.0
  assertEqual(groundFlight.altitude, 4.0, 'Should use geo_altitude when baro is null');

  console.log('  ✓ Flight field extraction tests passed');
}

/**
 * Test flight lookup by ID
 */
function testGetFlightById() {
  console.log('  Testing flight lookup by ID...');

  const layer = new FlightLayer();
  layer.parseResponse(SAMPLE_OPENSKY_RESPONSE);

  // Find existing flight
  const flight = layer.getFlightById('a12345');
  assertTrue(flight !== null, 'Should find flight by icao24');
  assertEqual(flight.callsign, 'UAL123', 'Found flight should be UAL123');

  // Case insensitive search
  const flightUpper = layer.getFlightById('A12345');
  assertTrue(flightUpper !== null, 'Should find flight case-insensitively');

  // Find another flight
  const flight2 = layer.getFlightById('abc789');
  assertTrue(flight2 !== null, 'Should find DLH456');
  assertEqual(flight2.callsign, 'DLH456', 'Should be DLH456');

  // Not found
  const notFound = layer.getFlightById('notexist');
  assertEqual(notFound, null, 'Should return null for non-existent ID');

  // Null/empty input
  assertEqual(layer.getFlightById(null), null, 'Null ID should return null');
  assertEqual(layer.getFlightById(''), null, 'Empty ID should return null');

  console.log('  ✓ Flight lookup by ID tests passed');
}

/**
 * Test flight lookup by callsign
 */
function testGetFlightsByCallsign() {
  console.log('  Testing flight lookup by callsign...');

  const layer = new FlightLayer();
  layer.parseResponse(SAMPLE_OPENSKY_RESPONSE);

  // Exact match
  const ualFlights = layer.getFlightsByCallsign('UAL123');
  assertEqual(ualFlights.length, 1, 'Should find one UAL123');
  assertEqual(ualFlights[0].icao24, 'a12345', 'Found flight should be a12345');

  // Partial match
  const dlhFlights = layer.getFlightsByCallsign('DLH');
  assertEqual(dlhFlights.length, 1, 'Should find one DLH flight');

  // Case insensitive
  const ualLower = layer.getFlightsByCallsign('ual');
  assertEqual(ualLower.length, 1, 'Should find UAL case-insensitively');

  // Multiple matches (AAL)
  const aalFlights = layer.getFlightsByCallsign('AAL');
  assertEqual(aalFlights.length, 1, 'Should find one AAL flight');

  // No matches
  const noMatch = layer.getFlightsByCallsign('XYZ');
  assertEqual(noMatch.length, 0, 'Should find no matches for XYZ');

  // Empty/null input
  assertEqual(layer.getFlightsByCallsign('').length, 0, 'Empty callsign should return empty');
  assertEqual(layer.getFlightsByCallsign(null).length, 0, 'Null callsign should return empty');

  console.log('  ✓ Flight lookup by callsign tests passed');
}

/**
 * Test flight lookup by country
 */
function testGetFlightsByCountry() {
  console.log('  Testing flight lookup by country...');

  const layer = new FlightLayer();
  layer.parseResponse(SAMPLE_OPENSKY_RESPONSE);

  // Full country name
  const usFlights = layer.getFlightsByCountry('United States');
  assertEqual(usFlights.length, 2, 'Should find 2 US flights');

  // Partial match
  const germanyFlights = layer.getFlightsByCountry('Germ');
  assertEqual(germanyFlights.length, 1, 'Should find one German flight');

  // Case insensitive
  const franceLower = layer.getFlightsByCountry('france');
  assertEqual(franceLower.length, 1, 'Should find French flight case-insensitively');

  // No matches
  const noMatch = layer.getFlightsByCountry('Japan');
  assertEqual(noMatch.length, 0, 'Should find no Japanese flights');

  console.log('  ✓ Flight lookup by country tests passed');
}

/**
 * Test filtering by altitude
 */
function testGetFlightsByAltitude() {
  console.log('  Testing altitude filtering...');

  const layer = new FlightLayer();
  layer.parseResponse(SAMPLE_OPENSKY_RESPONSE);

  // High altitude (FL350+)
  const highFlights = layer.getFlightsByAltitude(10000, 15000);
  assertEqual(highFlights.length, 2, 'Should find 2 high-altitude flights');

  // Mid altitude
  const midFlights = layer.getFlightsByAltitude(8000, 9000);
  assertEqual(midFlights.length, 1, 'Should find 1 mid-altitude flight');

  // No matches
  const veryHigh = layer.getFlightsByAltitude(15000, 20000);
  assertEqual(veryHigh.length, 0, 'Should find no flights at extreme altitude');

  console.log('  ✓ Altitude filtering tests passed');
}

/**
 * Test airborne/grounded filtering
 */
function testAirborneGroundedFiltering() {
  console.log('  Testing airborne/grounded filtering...');

  const layer = new FlightLayer();
  layer.parseResponse(SAMPLE_OPENSKY_RESPONSE);

  const airborne = layer.getAirborneFlights();
  assertEqual(airborne.length, 3, 'Should find 3 airborne flights');

  const grounded = layer.getGroundedFlights();
  assertEqual(grounded.length, 1, 'Should find 1 grounded flight');
  assertEqual(grounded[0].callsign, 'AAL789', 'Grounded flight should be AAL789');

  console.log('  ✓ Airborne/grounded filtering tests passed');
}

/**
 * Test getInfo method
 */
function testGetInfo() {
  console.log('  Testing getInfo method...');

  const layer = new FlightLayer();
  layer.parseResponse(SAMPLE_OPENSKY_RESPONSE);
  layer.lastFetch = new Date('2024-01-01T00:00:00Z');
  layer.responseTime = new Date(SAMPLE_OPENSKY_RESPONSE.time * 1000);

  const info = layer.getInfo('a12345');
  assertTrue(info !== null, 'Should return info for existing flight');
  assertEqual(info.icao24, 'a12345', 'Info should contain icao24');
  assertEqual(info.callsign, 'UAL123', 'Info should contain callsign');
  assertTrue(info.lastFetch !== null, 'Info should contain lastFetch');
  assertTrue(info.responseTime !== null, 'Info should contain responseTime');

  const noInfo = layer.getInfo('notexist');
  assertEqual(noInfo, null, 'Should return null for non-existent flight');

  console.log('  ✓ getInfo tests passed');
}

/**
 * Test empty/invalid input handling
 */
function testInvalidInput() {
  console.log('  Testing invalid input handling...');

  const layer = new FlightLayer();

  // Null response
  let result = layer.parseResponse(null);
  assertEqual(result.length, 0, 'Null response should return empty array');

  // Undefined response
  result = layer.parseResponse(undefined);
  assertEqual(result.length, 0, 'Undefined response should return empty array');

  // Empty object
  result = layer.parseResponse({});
  assertEqual(result.length, 0, 'Empty object should return empty array');

  // No states array
  result = layer.parseResponse({ time: 123 });
  assertEqual(result.length, 0, 'Response without states should return empty array');

  // States not an array
  result = layer.parseResponse({ time: 123, states: 'not an array' });
  assertEqual(result.length, 0, 'Non-array states should return empty array');

  // Empty states array
  result = layer.parseResponse({ time: 123, states: [] });
  assertEqual(result.length, 0, 'Empty states should return empty array');

  console.log('  ✓ Invalid input handling tests passed');
}

/**
 * Test that flights are stored internally
 */
function testInternalStorage() {
  console.log('  Testing internal storage...');

  const layer = new FlightLayer();
  assertEqual(layer.flights.length, 0, 'Initial flights should be empty');

  layer.parseResponse(SAMPLE_OPENSKY_RESPONSE);
  assertEqual(layer.flights.length, 4, 'Flights should be stored internally');

  // Parse again with different data - should replace
  const singleFlight = {
    time: 1704067300,
    states: [
      ['single1', 'SINGLE  ', 'Test', 1704067295, 1704067299, -100.0, 35.0, 5000.0, false, 200.0, 90.0, 0.0, null, 5010.0, '1200', false, 0]
    ]
  };

  layer.parseResponse(singleFlight);
  assertEqual(layer.flights.length, 1, 'Flights should be replaced on new parse');
  assertEqual(layer.flights[0].callsign, 'SINGLE', 'New flight should be stored');

  console.log('  ✓ Internal storage tests passed');
}

/**
 * Test OPENSKY_FIELDS constants
 */
function testFieldConstants() {
  console.log('  Testing field constants...');

  // Verify field indices match expected positions
  assertEqual(OPENSKY_FIELDS.ICAO24, 0, 'ICAO24 should be at index 0');
  assertEqual(OPENSKY_FIELDS.CALLSIGN, 1, 'CALLSIGN should be at index 1');
  assertEqual(OPENSKY_FIELDS.LONGITUDE, 5, 'LONGITUDE should be at index 5');
  assertEqual(OPENSKY_FIELDS.LATITUDE, 6, 'LATITUDE should be at index 6');
  assertEqual(OPENSKY_FIELDS.BARO_ALTITUDE, 7, 'BARO_ALTITUDE should be at index 7');
  assertEqual(OPENSKY_FIELDS.VELOCITY, 9, 'VELOCITY should be at index 9');

  console.log('  ✓ Field constants tests passed');
}

/**
 * Run all tests
 * @returns {boolean} true if all tests pass
 */
export function run() {
  console.log('Running Flight Layer tests...\n');

  let passed = true;

  const tests = [
    { name: 'Default config', fn: testDefaultConfig },
    { name: 'Custom config', fn: testCustomConfig },
    { name: 'URL building', fn: testUrlBuilding },
    { name: 'Response parsing', fn: testParseResponse },
    { name: 'Flight fields', fn: testFlightFields },
    { name: 'Flight lookup by ID', fn: testGetFlightById },
    { name: 'Flight lookup by callsign', fn: testGetFlightsByCallsign },
    { name: 'Flight lookup by country', fn: testGetFlightsByCountry },
    { name: 'Altitude filtering', fn: testGetFlightsByAltitude },
    { name: 'Airborne/grounded filtering', fn: testAirborneGroundedFiltering },
    { name: 'getInfo method', fn: testGetInfo },
    { name: 'Invalid input handling', fn: testInvalidInput },
    { name: 'Internal storage', fn: testInternalStorage },
    { name: 'Field constants', fn: testFieldConstants },
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
    console.log('All Flight Layer tests passed! ✓');
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
