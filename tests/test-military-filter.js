/**
 * Tests for Military Aircraft Filter Logic
 * Exports run() function and supports direct execution.
 */

import {
  isMilitary,
  checkMilitaryHex,
  checkMilitaryCallsign,
  checkMilitaryType,
  MILITARY_HEX_PREFIXES,
  MILITARY_CALLSIGN_PREFIXES,
  MILITARY_TYPE_CODES,
} from '../src/layers/military.js';

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

function assertFalse(condition, message) {
  if (condition) {
    throw new Error(`${message}: expected false, got true`);
  }
}

/**
 * Test ICAO24 hex range detection
 */
function testMilitaryHexRanges() {
  console.log('  Testing ICAO24 hex range detection...');

  // US Military (AE prefix - USAF)
  assertTrue(checkMilitaryHex('ae1234'), 'US Air Force AE prefix should be military');
  assertTrue(checkMilitaryHex('AE5678'), 'US Air Force AE prefix (uppercase) should be military');
  assertTrue(checkMilitaryHex('aef000'), 'US Air Force AEF should be military');

  // US Military (AF prefix - USAF continued)
  assertTrue(checkMilitaryHex('af0001'), 'US Air Force AF prefix should be military');
  assertTrue(checkMilitaryHex('AF9999'), 'US Air Force AF prefix (uppercase) should be military');

  // US Coast Guard (A8 prefix)
  assertTrue(checkMilitaryHex('a80123'), 'US Coast Guard A8 prefix should be military');
  assertTrue(checkMilitaryHex('A8ABCD'), 'US Coast Guard A8 prefix (uppercase) should be military');

  // UK Military (43C prefix)
  assertTrue(checkMilitaryHex('43c001'), 'UK MOD 43C prefix should be military');
  assertTrue(checkMilitaryHex('43C999'), 'UK MOD 43C prefix (uppercase) should be military');

  // Civilian aircraft should not match
  assertFalse(checkMilitaryHex('a12345'), 'Civilian A1 prefix should not be military');
  assertFalse(checkMilitaryHex('abc123'), 'Random civilian hex should not be military');
  assertFalse(checkMilitaryHex('123456'), 'Numeric civilian hex should not be military');

  console.log('  ✓ ICAO24 hex range tests passed');
}

/**
 * Test callsign prefix detection
 */
function testMilitaryCallsigns() {
  console.log('  Testing callsign prefix detection...');

  // US Air Force callsigns
  assertTrue(checkMilitaryCallsign('RCH123'), 'RCH (Reach) should be military');
  assertTrue(checkMilitaryCallsign('rch456'), 'rch lowercase should be military');
  assertTrue(checkMilitaryCallsign('CNV01'), 'CNV (Convoy) should be military');
  assertTrue(checkMilitaryCallsign('STEEL77'), 'STEEL should be military');
  assertTrue(checkMilitaryCallsign('SHADY01'), 'SHADY (tanker) should be military');
  assertTrue(checkMilitaryCallsign('LOBO22'), 'LOBO (spec ops) should be military');
  assertTrue(checkMilitaryCallsign('SPAR19'), 'SPAR (VIP transport) should be military');

  // SAM flights (Air Force One support)
  assertTrue(checkMilitaryCallsign('SAM001'), 'SAM should be military');
  assertTrue(checkMilitaryCallsign('SAM999'), 'SAM999 should be military');

  // US Navy/Marine
  assertTrue(checkMilitaryCallsign('NAVY01'), 'NAVY should be military');
  assertTrue(checkMilitaryCallsign('MARINE1'), 'MARINE should be military');

  // UK RAF
  assertTrue(checkMilitaryCallsign('ASCOT01'), 'ASCOT (RAF) should be military');
  assertTrue(checkMilitaryCallsign('RRR001'), 'RRR (RAF) should be military');

  // NATO
  assertTrue(checkMilitaryCallsign('NATO01'), 'NATO should be military');

  // Civilian callsigns should not match
  assertFalse(checkMilitaryCallsign('UAL123'), 'United Airlines should not be military');
  assertFalse(checkMilitaryCallsign('AAL456'), 'American Airlines should not be military');
  assertFalse(checkMilitaryCallsign('DAL789'), 'Delta should not be military');
  assertFalse(checkMilitaryCallsign('SWA001'), 'Southwest should not be military');
  assertFalse(checkMilitaryCallsign('N12345'), 'Private registration should not be military');
  assertFalse(checkMilitaryCallsign('JBU234'), 'JetBlue should not be military');

  console.log('  ✓ Callsign prefix tests passed');
}

/**
 * Test aircraft type code detection
 */
function testMilitaryTypeCodes() {
  console.log('  Testing aircraft type code detection...');

  // Fighter aircraft
  assertTrue(checkMilitaryType('F15'), 'F-15 Eagle should be military');
  assertTrue(checkMilitaryType('F16'), 'F-16 should be military');
  assertTrue(checkMilitaryType('F22'), 'F-22 Raptor should be military');
  assertTrue(checkMilitaryType('F35'), 'F-35 should be military');
  assertTrue(checkMilitaryType('f16'), 'f16 lowercase should be military');

  // Transport aircraft
  assertTrue(checkMilitaryType('C17'), 'C-17 should be military');
  assertTrue(checkMilitaryType('C130'), 'C-130 Hercules should be military');
  assertTrue(checkMilitaryType('C5'), 'C-5 Galaxy should be military');

  // Tankers
  assertTrue(checkMilitaryType('KC10'), 'KC-10 should be military');
  assertTrue(checkMilitaryType('KC35'), 'KC-135 should be military');

  // Surveillance
  assertTrue(checkMilitaryType('E3'), 'E-3 AWACS should be military');
  assertTrue(checkMilitaryType('MQ9'), 'MQ-9 Reaper should be military');

  // Civilian types should not match
  assertFalse(checkMilitaryType('B738'), 'Boeing 737-800 should not be military');
  assertFalse(checkMilitaryType('A320'), 'Airbus A320 should not be military');
  assertFalse(checkMilitaryType('B77W'), 'Boeing 777 should not be military');
  assertFalse(checkMilitaryType('E190'), 'Embraer 190 should not be military');
  assertFalse(checkMilitaryType('CRJ7'), 'CRJ-700 should not be military');

  console.log('  ✓ Aircraft type code tests passed');
}

/**
 * Test the main isMilitary function with complete aircraft objects
 */
function testIsMilitaryFunction() {
  console.log('  Testing isMilitary() function...');

  // Test military aircraft - identified by ICAO24 hex
  assertTrue(isMilitary({ icao24: 'ae1234', callsign: null }), 'USAF by hex should be military');
  assertTrue(isMilitary({ icao24: 'a80001' }), 'USCG by hex should be military');

  // Test military aircraft - identified by callsign
  assertTrue(isMilitary({ icao24: '000000', callsign: 'RCH123' }), 'Military by callsign should be military');
  assertTrue(isMilitary({ icao24: null, callsign: 'SHADY01' }), 'Tanker by callsign should be military');

  // Test military aircraft - identified by type code
  assertTrue(isMilitary({ icao24: '000000', callsign: null, typeCode: 'F16' }), 'F-16 by type should be military');
  assertTrue(isMilitary({ icao24: '000000', callsign: '', typeCode: 'C17' }), 'C-17 by type should be military');

  // Test civilian aircraft
  assertFalse(isMilitary({ icao24: 'a12345', callsign: 'UAL123' }), 'United flight should not be military');
  assertFalse(isMilitary({ icao24: 'abc123', callsign: 'DAL456' }), 'Delta flight should not be military');
  assertFalse(isMilitary({ icao24: '111111', callsign: 'N12345' }), 'Private plane should not be military');
  // Canadian military hex test - C0 is Canadian Armed Forces
  assertTrue(isMilitary({ icao24: 'c00001', callsign: 'AAL789' }),
    'Canadian military hex should be military even with civilian callsign');

  // Multiple indicators (should still return true)
  assertTrue(isMilitary({ icao24: 'ae1234', callsign: 'RCH001', typeCode: 'C17' }),
    'Aircraft with multiple military indicators should be military');

  console.log('  ✓ isMilitary() function tests passed');
}

/**
 * Test graceful handling of edge cases
 */
function testEdgeCases() {
  console.log('  Testing edge case handling...');

  // Null/undefined inputs should not throw
  assertFalse(isMilitary(null), 'null should return false');
  assertFalse(isMilitary(undefined), 'undefined should return false');
  assertFalse(isMilitary({}), 'Empty object should return false');

  // Missing fields should not throw
  assertFalse(isMilitary({ icao24: null }), 'null icao24 should return false');
  assertFalse(isMilitary({ callsign: null }), 'null callsign should return false');
  assertFalse(isMilitary({ icao24: undefined, callsign: undefined }), 'undefined fields should return false');

  // Empty strings should not throw
  assertFalse(isMilitary({ icao24: '', callsign: '' }), 'Empty strings should return false');
  assertFalse(isMilitary({ icao24: '   ', callsign: '   ' }), 'Whitespace-only should return false');

  // Non-string types should not throw
  assertFalse(isMilitary({ icao24: 12345 }), 'Numeric icao24 should return false');
  assertFalse(isMilitary({ callsign: 12345 }), 'Numeric callsign should return false');
  assertFalse(isMilitary({ icao24: [], callsign: {} }), 'Object/array values should return false');

  // Invalid input types should not throw
  assertFalse(isMilitary('string'), 'String input should return false');
  assertFalse(isMilitary(12345), 'Numeric input should return false');
  assertFalse(isMilitary([]), 'Array input should return false');

  // Verify the function never throws
  let threw = false;
  try {
    isMilitary(null);
    isMilitary(undefined);
    isMilitary({});
    isMilitary({ icao24: null, callsign: undefined, typeCode: 123 });
    isMilitary('invalid');
    isMilitary(Symbol('test'));
  } catch (e) {
    threw = true;
  }
  assertFalse(threw, 'isMilitary should never throw exceptions');

  console.log('  ✓ Edge case handling tests passed');
}

/**
 * Test with real-world example aircraft
 */
function testRealWorldExamples() {
  console.log('  Testing real-world example aircraft...');

  // Known military aircraft examples
  const militaryExamples = [
    { icao24: 'ae01c5', callsign: 'RCH402', description: 'C-17 Globemaster' },
    { icao24: 'ae5a2b', callsign: 'STEEL01', description: 'Military transport' },
    { icao24: 'a80432', callsign: 'USCG2115', description: 'Coast Guard HC-130' },
    { icao24: 'adf7c8', callsign: 'REACH123', description: 'Air Mobility Command' },
    { icao24: '43c123', callsign: 'ASCOT01', description: 'RAF transport' },
    { icao24: '3f0001', callsign: null, description: 'German Luftwaffe' },
    { icao24: 'ae1234', callsign: 'SPAR19', description: 'VIP transport' },
    { icao24: 'af0001', callsign: 'LOBO22', description: 'Special operations' },
  ];

  for (const aircraft of militaryExamples) {
    assertTrue(isMilitary(aircraft), `${aircraft.description} (${aircraft.icao24}/${aircraft.callsign}) should be military`);
  }

  // Known civilian aircraft examples
  const civilianExamples = [
    { icao24: 'a1b2c3', callsign: 'UAL123', description: 'United Airlines 737' },
    { icao24: 'a4f5e6', callsign: 'DAL456', description: 'Delta A320' },
    { icao24: 'ab1234', callsign: 'SWA789', description: 'Southwest 737' },
    { icao24: '123abc', callsign: 'N12345', description: 'Private Cessna' },
    { icao24: 'c12345', callsign: 'ACA001', description: 'Air Canada' },
    { icao24: '8d1234', callsign: 'JBU234', description: 'JetBlue A321' },
    { icao24: '40abcd', callsign: 'BAW123', description: 'British Airways 777' },
    { icao24: '346abc', callsign: 'FRA001', description: 'Air France A380' },
  ];

  for (const aircraft of civilianExamples) {
    assertFalse(isMilitary(aircraft), `${aircraft.description} (${aircraft.icao24}/${aircraft.callsign}) should NOT be military`);
  }

  console.log('  ✓ Real-world example tests passed');
}

/**
 * Test exports are complete
 */
function testExports() {
  console.log('  Testing module exports...');

  // Verify all expected exports exist
  assertTrue(typeof isMilitary === 'function', 'isMilitary should be a function');
  assertTrue(typeof checkMilitaryHex === 'function', 'checkMilitaryHex should be a function');
  assertTrue(typeof checkMilitaryCallsign === 'function', 'checkMilitaryCallsign should be a function');
  assertTrue(typeof checkMilitaryType === 'function', 'checkMilitaryType should be a function');
  assertTrue(Array.isArray(MILITARY_HEX_PREFIXES), 'MILITARY_HEX_PREFIXES should be an array');
  assertTrue(Array.isArray(MILITARY_CALLSIGN_PREFIXES), 'MILITARY_CALLSIGN_PREFIXES should be an array');
  assertTrue(Array.isArray(MILITARY_TYPE_CODES), 'MILITARY_TYPE_CODES should be an array');

  // Verify arrays have content
  assertTrue(MILITARY_HEX_PREFIXES.length > 0, 'MILITARY_HEX_PREFIXES should have entries');
  assertTrue(MILITARY_CALLSIGN_PREFIXES.length > 0, 'MILITARY_CALLSIGN_PREFIXES should have entries');
  assertTrue(MILITARY_TYPE_CODES.length > 0, 'MILITARY_TYPE_CODES should have entries');

  console.log('  ✓ Module exports tests passed');
}

/**
 * Run all tests
 * @returns {boolean} true if all tests pass
 */
export function run() {
  console.log('Running military filter tests...\n');

  let passed = true;

  try {
    testMilitaryHexRanges();
  } catch (error) {
    console.error('  ✗ Hex range test failed:', error.message);
    passed = false;
  }

  try {
    testMilitaryCallsigns();
  } catch (error) {
    console.error('  ✗ Callsign test failed:', error.message);
    passed = false;
  }

  try {
    testMilitaryTypeCodes();
  } catch (error) {
    console.error('  ✗ Type code test failed:', error.message);
    passed = false;
  }

  try {
    testIsMilitaryFunction();
  } catch (error) {
    console.error('  ✗ isMilitary function test failed:', error.message);
    passed = false;
  }

  try {
    testEdgeCases();
  } catch (error) {
    console.error('  ✗ Edge case test failed:', error.message);
    passed = false;
  }

  try {
    testRealWorldExamples();
  } catch (error) {
    console.error('  ✗ Real-world examples test failed:', error.message);
    passed = false;
  }

  try {
    testExports();
  } catch (error) {
    console.error('  ✗ Exports test failed:', error.message);
    passed = false;
  }

  console.log('');

  if (passed) {
    console.log('All military filter tests passed! ✓');
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
