/**
 * Tests for Coordinate Conversion Utilities
 * Exports run() function and supports direct execution.
 */

import {
  eciToGeodetic,
  degreesToRadians,
  radiansToDegrees,
  distanceKm
} from '../src/utils/coordinates.js';

/**
 * Simple assertion helper
 */
function assertEqual(actual, expected, message, tolerance = 1e-10) {
  if (typeof actual === 'number' && typeof expected === 'number') {
    if (Math.abs(actual - expected) > tolerance) {
      throw new Error(`${message}: expected ${expected}, got ${actual}`);
    }
  } else if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function assertTrue(condition, message) {
  if (!condition) {
    throw new Error(`${message}: expected true, got false`);
  }
}

/**
 * Test degree/radian round-trip conversion
 */
function testDegreeRadianRoundTrip() {
  console.log('  Testing degree/radian round-trip conversion...');

  const testAngles = [0, 45, 90, 180, 270, 360, -45, -90, -180];

  for (const deg of testAngles) {
    const rad = degreesToRadians(deg);
    const backToDeg = radiansToDegrees(rad);
    assertEqual(backToDeg, deg, `Round-trip failed for ${deg} degrees`, 1e-12);
  }

  // Test specific known values
  assertEqual(degreesToRadians(180), Math.PI, '180 degrees should be PI', 1e-12);
  assertEqual(degreesToRadians(90), Math.PI / 2, '90 degrees should be PI/2', 1e-12);
  assertEqual(radiansToDegrees(Math.PI), 180, 'PI radians should be 180 degrees', 1e-12);
  assertEqual(radiansToDegrees(Math.PI / 2), 90, 'PI/2 radians should be 90 degrees', 1e-12);

  console.log('  ✓ Degree/radian conversion tests passed');
}

/**
 * Test ECI to geodetic conversion with known position [7000, 0, 0] km
 */
function testEciToGeodetic() {
  console.log('  Testing ECI to geodetic conversion...');

  // Test case: ECI position [7000, 0, 0] km at GMST = 0
  // This should be at 0° latitude, 0° longitude (on the equator at prime meridian)
  // Altitude should be 7000 - Earth radius ≈ 621.863 km
  const positionEci = { x: 7000, y: 0, z: 0 };
  const gmst = 0;

  const geodetic = eciToGeodetic(positionEci, gmst);

  // Latitude should be 0 (on equator)
  assertEqual(geodetic.latitude, 0, 'Latitude should be 0 for equatorial position', 1e-10);

  // Longitude should be 0 (at prime meridian when GMST = 0)
  assertEqual(geodetic.longitude, 0, 'Longitude should be 0 when GMST = 0', 1e-10);

  // Altitude should be approximately 621.863 km (7000 - 6378.137)
  const expectedAltitude = 7000 - 6378.137;
  assertEqual(geodetic.altitude, expectedAltitude, 'Altitude calculation', 0.001);

  // Validate that results are within valid ranges
  assertTrue(geodetic.latitude >= -Math.PI / 2 && geodetic.latitude <= Math.PI / 2,
    'Latitude should be in valid range [-PI/2, PI/2]');
  assertTrue(geodetic.longitude >= -Math.PI && geodetic.longitude <= Math.PI,
    'Longitude should be in valid range [-PI, PI]');
  assertTrue(geodetic.altitude > 0,
    'Altitude should be positive for position above Earth surface');

  // Test with non-zero Z component (off-equator position)
  const posEciNorth = { x: 0, y: 0, z: 7000 };
  const geodeticNorth = eciToGeodetic(posEciNorth, 0);

  // Should be at north pole (latitude ≈ 90°)
  const expectedLatRad = Math.PI / 2;
  assertEqual(geodeticNorth.latitude, expectedLatRad, 'North pole latitude', 0.01);

  // Test with GMST rotation
  const posEciGmst = { x: 7000, y: 0, z: 0 };
  const gmstOffset = Math.PI / 4; // 45 degrees
  const geodeticWithGmst = eciToGeodetic(posEciGmst, gmstOffset);

  // Longitude should be shifted by -GMST
  assertEqual(geodeticWithGmst.longitude, -gmstOffset, 'GMST rotation effect on longitude', 1e-10);

  console.log('  ✓ ECI to geodetic conversion tests passed');
}

/**
 * Test distance calculation
 */
function testDistanceKm() {
  console.log('  Testing distance calculation...');

  // Same point should have 0 distance
  const lat1 = degreesToRadians(40.7128); // NYC
  const lon1 = degreesToRadians(-74.0060);
  assertEqual(distanceKm(lat1, lon1, lat1, lon1), 0, 'Same point distance should be 0', 1e-10);

  // Test known distance: NYC to London ≈ 5570 km
  const lat2 = degreesToRadians(51.5074); // London
  const lon2 = degreesToRadians(-0.1278);
  const nycToLondon = distanceKm(lat1, lon1, lat2, lon2);

  // Should be approximately 5570 km (within 1% tolerance)
  assertTrue(nycToLondon > 5500 && nycToLondon < 5650,
    `NYC to London distance should be ~5570km, got ${nycToLondon}`);

  // Test antipodal points (half Earth circumference)
  const equator1 = degreesToRadians(0);
  const lon0 = degreesToRadians(0);
  const lon180 = degreesToRadians(180);
  const antipodal = distanceKm(equator1, lon0, equator1, lon180);

  // Should be approximately half Earth circumference ≈ 20015 km
  const halfCircumference = Math.PI * 6378.137;
  assertEqual(antipodal, halfCircumference, 'Antipodal distance', 1);

  console.log('  ✓ Distance calculation tests passed');
}

/**
 * Run all tests
 * @returns {boolean} true if all tests pass
 */
export function run() {
  console.log('Running coordinate utility tests...\n');

  let passed = true;

  try {
    testDegreeRadianRoundTrip();
  } catch (error) {
    console.error('  ✗ Degree/radian test failed:', error.message);
    passed = false;
  }

  try {
    testEciToGeodetic();
  } catch (error) {
    console.error('  ✗ ECI to geodetic test failed:', error.message);
    passed = false;
  }

  try {
    testDistanceKm();
  } catch (error) {
    console.error('  ✗ Distance calculation test failed:', error.message);
    passed = false;
  }

  console.log('');

  if (passed) {
    console.log('All coordinate utility tests passed! ✓');
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
