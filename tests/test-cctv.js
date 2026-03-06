/**
 * Tests for CCTV Feed Layer
 * Tests feed data structure and connectivity. At least one URL should return HTTP 200 with image content-type.
 * Exports run() function and supports direct execution.
 */

import { CCTVLayer, CCTV_FEEDS, DEFAULT_TIMEOUT, DEFAULT_RETRIES } from '../src/layers/cctv.js';

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
 * Test default configuration
 */
function testDefaultConfig() {
  console.log('  Testing default configuration...');

  const layer = new CCTVLayer();

  assertEqual(layer.timeout, DEFAULT_TIMEOUT, 'Default timeout should match');
  assertEqual(layer.retries, DEFAULT_RETRIES, 'Default retries should match');
  assertTrue(Array.isArray(layer.feeds), 'Feeds should be an array');
  assertTrue(layer.feeds.length >= 5, 'Should have at least 5 feeds');
  assertEqual(layer.lastTest, null, 'Initial lastTest should be null');

  console.log('  ✓ Default configuration tests passed');
}

/**
 * Test custom configuration
 */
function testCustomConfig() {
  console.log('  Testing custom configuration...');

  const layer = new CCTVLayer({
    timeout: 10000,
    retries: 5,
  });

  assertEqual(layer.timeout, 10000, 'Custom timeout should be set');
  assertEqual(layer.retries, 5, 'Custom retries should be set');

  console.log('  ✓ Custom configuration tests passed');
}

/**
 * Test feed data structure
 */
function testFeedStructure() {
  console.log('  Testing feed data structure...');

  const layer = new CCTVLayer();
  const feeds = layer.getFeeds();

  assertTrue(feeds.length >= 5, 'Should have at least 5 feeds');

  for (const feed of feeds) {
    // Check required fields
    assertTrue(typeof feed.id === 'string' && feed.id.length > 0, `Feed should have valid id: ${JSON.stringify(feed)}`);
    assertTrue(typeof feed.name === 'string' && feed.name.length > 0, `Feed ${feed.id} should have valid name`);
    assertTrue(typeof feed.lat === 'number', `Feed ${feed.id} should have numeric lat`);
    assertTrue(typeof feed.lon === 'number', `Feed ${feed.id} should have numeric lon`);
    assertTrue(typeof feed.url === 'string' && feed.url.startsWith('http'), `Feed ${feed.id} should have valid URL`);

    // Validate lat/lon ranges
    assertTrue(feed.lat >= -90 && feed.lat <= 90, `Feed ${feed.id} lat should be -90 to 90`);
    assertTrue(feed.lon >= -180 && feed.lon <= 180, `Feed ${feed.id} lon should be -180 to 180`);
  }

  console.log('  ✓ Feed data structure tests passed');
}

/**
 * Test getFeeds returns copy
 */
function testGetFeedsReturnsCopy() {
  console.log('  Testing getFeeds returns copy...');

  const layer = new CCTVLayer();
  const feeds1 = layer.getFeeds();
  const feeds2 = layer.getFeeds();

  assertTrue(feeds1 !== feeds2, 'getFeeds should return new array each time');
  assertEqual(feeds1.length, feeds2.length, 'Arrays should have same length');

  // Modifying returned array should not affect internal state
  feeds1.pop();
  assertEqual(layer.getFeeds().length, feeds2.length, 'Internal state should be unchanged');

  console.log('  ✓ getFeeds returns copy tests passed');
}

/**
 * Test getFeedById
 */
function testGetFeedById() {
  console.log('  Testing getFeedById...');

  const layer = new CCTVLayer();
  const feeds = layer.getFeeds();

  // Find existing feed
  const firstFeed = feeds[0];
  const found = layer.getFeedById(firstFeed.id);
  assertTrue(found !== null, 'Should find feed by ID');
  assertEqual(found.id, firstFeed.id, 'Found feed ID should match');
  assertEqual(found.name, firstFeed.name, 'Found feed name should match');

  // Non-existent feed
  const notFound = layer.getFeedById('non-existent-id-12345');
  assertEqual(notFound, null, 'Should return null for non-existent ID');

  console.log('  ✓ getFeedById tests passed');
}

/**
 * Test getFeedsByType
 */
function testGetFeedsByType() {
  console.log('  Testing getFeedsByType...');

  const layer = new CCTVLayer();

  const trafficFeeds = layer.getFeedsByType('traffic');
  assertTrue(trafficFeeds.length > 0, 'Should have traffic feeds');
  for (const feed of trafficFeeds) {
    assertEqual(feed.type, 'traffic', 'All filtered feeds should be traffic type');
  }

  const cityFeeds = layer.getFeedsByType('city');
  for (const feed of cityFeeds) {
    assertEqual(feed.type, 'city', 'All filtered feeds should be city type');
  }

  const unknownFeeds = layer.getFeedsByType('unknown-type');
  assertEqual(unknownFeeds.length, 0, 'Should return empty for unknown type');

  console.log('  ✓ getFeedsByType tests passed');
}

/**
 * Test getFeedsByRegion
 */
function testGetFeedsByRegion() {
  console.log('  Testing getFeedsByRegion...');

  const layer = new CCTVLayer();
  const feeds = layer.getFeeds();

  // Get a region that exists
  const regions = [...new Set(feeds.map(f => f.region).filter(Boolean))];
  if (regions.length > 0) {
    const regionFeeds = layer.getFeedsByRegion(regions[0]);
    assertTrue(regionFeeds.length > 0, 'Should find feeds by region');
    for (const feed of regionFeeds) {
      assertEqual(feed.region, regions[0], 'All filtered feeds should match region');
    }
  }

  const unknownFeeds = layer.getFeedsByRegion('Unknown Region XYZ');
  assertEqual(unknownFeeds.length, 0, 'Should return empty for unknown region');

  console.log('  ✓ getFeedsByRegion tests passed');
}

/**
 * Test count property
 */
function testCountProperty() {
  console.log('  Testing count property...');

  const layer = new CCTVLayer();

  assertEqual(layer.count, layer.feeds.length, 'Count should match feeds length');
  assertTrue(layer.count >= 5, 'Count should be at least 5');

  console.log('  ✓ Count property tests passed');
}

/**
 * Test addFeed
 */
function testAddFeed() {
  console.log('  Testing addFeed...');

  const layer = new CCTVLayer();
  const initialCount = layer.count;

  // Add valid feed
  const newFeed = {
    id: 'test-feed-123',
    name: 'Test Camera',
    lat: 40.0,
    lon: -74.0,
    url: 'https://example.com/camera.jpg',
    type: 'test',
    region: 'Test Region',
  };

  const added = layer.addFeed(newFeed);
  assertTrue(added, 'Should return true when adding valid feed');
  assertEqual(layer.count, initialCount + 1, 'Count should increase by 1');

  const found = layer.getFeedById('test-feed-123');
  assertTrue(found !== null, 'Should find newly added feed');
  assertEqual(found.name, 'Test Camera', 'Added feed name should match');

  // Try to add duplicate ID
  const duplicate = layer.addFeed(newFeed);
  assertFalse(duplicate, 'Should return false for duplicate ID');
  assertEqual(layer.count, initialCount + 1, 'Count should not change for duplicate');

  // Try to add invalid feeds
  assertFalse(layer.addFeed(null), 'Should reject null');
  assertFalse(layer.addFeed({}), 'Should reject empty object');
  assertFalse(layer.addFeed({ id: 'x' }), 'Should reject missing fields');
  assertFalse(layer.addFeed({ id: 'x', name: 'x', url: 'http://x', lat: 'invalid', lon: 0 }), 'Should reject non-numeric lat');

  console.log('  ✓ addFeed tests passed');
}

/**
 * Test removeFeed
 */
function testRemoveFeed() {
  console.log('  Testing removeFeed...');

  const layer = new CCTVLayer();

  // Add a feed first
  layer.addFeed({
    id: 'to-be-removed',
    name: 'Remove Me',
    lat: 0,
    lon: 0,
    url: 'https://example.com/remove.jpg',
  });

  const countBefore = layer.count;
  assertTrue(layer.getFeedById('to-be-removed') !== null, 'Feed should exist before removal');

  const removed = layer.removeFeed('to-be-removed');
  assertTrue(removed, 'Should return true when removing existing feed');
  assertEqual(layer.count, countBefore - 1, 'Count should decrease by 1');
  assertEqual(layer.getFeedById('to-be-removed'), null, 'Feed should not exist after removal');

  // Try to remove non-existent feed
  const notRemoved = layer.removeFeed('non-existent-id');
  assertFalse(notRemoved, 'Should return false for non-existent ID');

  console.log('  ✓ removeFeed tests passed');
}

/**
 * Test getInfo
 */
function testGetInfo() {
  console.log('  Testing getInfo...');

  const layer = new CCTVLayer();
  const feeds = layer.getFeeds();
  const firstFeed = feeds[0];

  const info = layer.getInfo(firstFeed.id);
  assertTrue(info !== null, 'Should return info for valid ID');
  assertEqual(info.id, firstFeed.id, 'Info ID should match');
  assertEqual(info.name, firstFeed.name, 'Info name should match');
  assertEqual(info.lat, firstFeed.lat, 'Info lat should match');
  assertEqual(info.lon, firstFeed.lon, 'Info lon should match');
  assertEqual(info.url, firstFeed.url, 'Info url should match');
  assertTrue('lastTest' in info, 'Info should include lastTest');

  const notFound = layer.getInfo('non-existent-id');
  assertEqual(notFound, null, 'Should return null for invalid ID');

  console.log('  ✓ getInfo tests passed');
}

/**
 * Test that CCTV_FEEDS export has correct structure
 */
function testFeedsExport() {
  console.log('  Testing CCTV_FEEDS export...');

  assertTrue(Array.isArray(CCTV_FEEDS), 'CCTV_FEEDS should be an array');
  assertTrue(CCTV_FEEDS.length >= 5, 'CCTV_FEEDS should have at least 5 feeds');

  for (const feed of CCTV_FEEDS) {
    assertTrue(typeof feed.id === 'string', 'Feed id should be string');
    assertTrue(typeof feed.name === 'string', 'Feed name should be string');
    assertTrue(typeof feed.lat === 'number', 'Feed lat should be number');
    assertTrue(typeof feed.lon === 'number', 'Feed lon should be number');
    assertTrue(typeof feed.url === 'string', 'Feed url should be string');
  }

  console.log('  ✓ CCTV_FEEDS export tests passed');
}

/**
 * Test camera connectivity - at least one URL should return HTTP 200 with image content-type
 * This test has a longer timeout and handles network failures gracefully.
 */
async function testCameraConnectivity() {
  console.log('  Testing camera connectivity (this may take a moment)...');

  const layer = new CCTVLayer({
    timeout: 10000, // 10 second timeout per request
    retries: 1,
  });

  const results = [];
  let successCount = 0;

  for (const feed of layer.getFeeds()) {
    try {
      const result = await layer.testFeed(feed);
      results.push(result);

      if (result.success) {
        successCount++;
        console.log(`    ✓ ${feed.name}: HTTP ${result.status}, ${result.contentType}`);
      } else {
        console.log(`    - ${feed.name}: ${result.error || 'Failed'}`);
      }
    } catch (error) {
      console.log(`    - ${feed.name}: ${error.message}`);
      results.push({
        id: feed.id,
        success: false,
        error: error.message,
      });
    }
  }

  // At least one feed should be working
  assertTrue(successCount >= 1, `At least 1 feed should be accessible (got ${successCount})`);

  console.log(`  ✓ Camera connectivity test passed (${successCount}/${results.length} feeds working)`);
}

/**
 * Test testFeed with invalid input
 */
async function testTestFeedInvalidInput() {
  console.log('  Testing testFeed with invalid input...');

  const layer = new CCTVLayer();

  // Null feed
  let result = await layer.testFeed(null);
  assertFalse(result.success, 'Null feed should fail');
  assertTrue(result.error !== null, 'Should have error message');

  // Feed without URL
  result = await layer.testFeed({ id: 'test', name: 'test' });
  assertFalse(result.success, 'Feed without URL should fail');

  // Empty URL
  result = await layer.testFeed({ id: 'test', url: '' });
  assertFalse(result.success, 'Empty URL should fail');

  console.log('  ✓ testFeed invalid input tests passed');
}

/**
 * Run all tests
 * @returns {Promise<boolean>} true if all tests pass
 */
export async function run() {
  console.log('Running CCTV Layer tests...\n');

  let passed = true;

  // Synchronous tests
  const syncTests = [
    { name: 'Default config', fn: testDefaultConfig },
    { name: 'Custom config', fn: testCustomConfig },
    { name: 'Feed structure', fn: testFeedStructure },
    { name: 'getFeeds returns copy', fn: testGetFeedsReturnsCopy },
    { name: 'getFeedById', fn: testGetFeedById },
    { name: 'getFeedsByType', fn: testGetFeedsByType },
    { name: 'getFeedsByRegion', fn: testGetFeedsByRegion },
    { name: 'count property', fn: testCountProperty },
    { name: 'addFeed', fn: testAddFeed },
    { name: 'removeFeed', fn: testRemoveFeed },
    { name: 'getInfo', fn: testGetInfo },
    { name: 'CCTV_FEEDS export', fn: testFeedsExport },
  ];

  for (const test of syncTests) {
    try {
      test.fn();
    } catch (error) {
      console.error(`  ✗ ${test.name} test failed:`, error.message);
      passed = false;
    }
  }

  // Async tests
  const asyncTests = [
    { name: 'testFeed invalid input', fn: testTestFeedInvalidInput },
    { name: 'Camera connectivity', fn: testCameraConnectivity },
  ];

  for (const test of asyncTests) {
    try {
      await test.fn();
    } catch (error) {
      console.error(`  ✗ ${test.name} test failed:`, error.message);
      passed = false;
    }
  }

  console.log('');

  if (passed) {
    console.log('All CCTV Layer tests passed! ✓');
  } else {
    console.log('Some tests failed! ✗');
  }

  return passed;
}

// Support direct execution
const isDirectRun = import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  run().then(success => {
    process.exit(success ? 0 : 1);
  });
}
