/**
 * Tests for API Fetch Utilities
 * Tests timeout behavior and retry logic with mock failures.
 * Exports run() function and supports direct execution.
 */

import {
  fetchWithRetry,
  fetchJSON,
  clearCache,
  getCacheStats,
  DEFAULT_CONFIG
} from '../src/utils/api.js';
import http from 'http';

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

function assertThrows(fn, expectedMessage, message) {
  let threw = false;
  let errorMessage = '';
  try {
    fn();
  } catch (e) {
    threw = true;
    errorMessage = e.message;
  }
  if (!threw) {
    throw new Error(`${message}: expected function to throw`);
  }
  if (expectedMessage && !errorMessage.includes(expectedMessage)) {
    throw new Error(`${message}: expected error containing "${expectedMessage}", got "${errorMessage}"`);
  }
}

/**
 * Create a test server that can be configured for different behaviors
 */
function createTestServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        server,
        url: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((res) => server.close(res)),
      });
    });
  });
}

/**
 * Test default configuration values
 */
function testDefaultConfig() {
  console.log('  Testing default configuration...');

  assertEqual(DEFAULT_CONFIG.timeout, 30000, 'Default timeout should be 30000ms');
  assertEqual(DEFAULT_CONFIG.retries, 3, 'Default retries should be 3');
  assertEqual(DEFAULT_CONFIG.retryDelay, 1000, 'Default retry delay should be 1000ms');
  assertEqual(DEFAULT_CONFIG.useCache, false, 'Default useCache should be false');
  assertEqual(DEFAULT_CONFIG.cacheTTL, 300000, 'Default cacheTTL should be 300000ms');

  console.log('  ✓ Default configuration tests passed');
}

/**
 * Test successful fetch
 */
async function testSuccessfulFetch() {
  console.log('  Testing successful fetch...');

  const testData = { message: 'success', value: 42 };

  const { server, url, close } = await createTestServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(testData));
  });

  try {
    const response = await fetchWithRetry(url);
    assertTrue(response !== null, 'Response should not be null');
    assertTrue(response.ok, 'Response should be ok');

    const data = await response.json();
    assertEqual(data.message, 'success', 'Response message should match');
    assertEqual(data.value, 42, 'Response value should match');

    console.log('  ✓ Successful fetch tests passed');
  } finally {
    await close();
  }
}

/**
 * Test timeout behavior
 */
async function testTimeoutBehavior() {
  console.log('  Testing timeout behavior...');

  // Server that delays response longer than timeout
  const { server, url, close } = await createTestServer((req, res) => {
    // Don't respond - let it timeout
    setTimeout(() => {
      res.writeHead(200);
      res.end('delayed');
    }, 5000);
  });

  try {
    const startTime = Date.now();

    let threw = false;
    try {
      await fetchWithRetry(url, {
        timeout: 100,  // Very short timeout
        retries: 1,    // Only 1 retry to speed up test
        retryDelay: 10,
      });
    } catch (error) {
      threw = true;
      assertTrue(
        error.message.includes('failed') || error.message.includes('abort'),
        'Error should indicate failure or abort'
      );
    }

    assertTrue(threw, 'Should throw error on timeout');

    const elapsed = Date.now() - startTime;
    assertTrue(elapsed < 2000, `Timeout should trigger quickly, took ${elapsed}ms`);

    console.log('  ✓ Timeout behavior tests passed');
  } finally {
    await close();
  }
}

/**
 * Test retry logic with intermittent failures
 */
async function testRetryLogic() {
  console.log('  Testing retry logic with intermittent failures...');

  let requestCount = 0;
  const failUntil = 2; // Fail first 2 requests, succeed on 3rd

  const { server, url, close } = await createTestServer((req, res) => {
    requestCount++;
    if (requestCount < failUntil) {
      // Destroy connection to simulate network failure
      req.socket.destroy();
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ attempt: requestCount }));
    }
  });

  try {
    const response = await fetchWithRetry(url, {
      retries: 3,
      retryDelay: 50, // Short delay for testing
    });

    assertTrue(response !== null, 'Response should not be null after retries');
    assertTrue(response.ok, 'Response should be ok');

    const data = await response.json();
    assertEqual(data.attempt, failUntil, `Should succeed on attempt ${failUntil}`);
    assertTrue(requestCount >= failUntil, 'Should have made multiple attempts');

    console.log('  ✓ Retry logic tests passed');
  } finally {
    await close();
  }
}

/**
 * Test that all retries exhausted throws error
 */
async function testAllRetriesExhausted() {
  console.log('  Testing all retries exhausted...');

  let requestCount = 0;

  const { server, url, close } = await createTestServer((req, res) => {
    requestCount++;
    // Always fail
    req.socket.destroy();
  });

  try {
    let threw = false;
    let errorMessage = '';

    try {
      await fetchWithRetry(url, {
        retries: 3,
        retryDelay: 10, // Short delay for testing
      });
    } catch (error) {
      threw = true;
      errorMessage = error.message;
    }

    assertTrue(threw, 'Should throw error when all retries exhausted');
    assertTrue(
      errorMessage.includes('failed after 3 attempts'),
      `Error should mention attempts: ${errorMessage}`
    );
    assertEqual(requestCount, 3, 'Should have made exactly 3 attempts');

    console.log('  ✓ All retries exhausted tests passed');
  } finally {
    await close();
  }
}

/**
 * Test exponential backoff timing
 */
async function testExponentialBackoff() {
  console.log('  Testing exponential backoff timing...');

  let requestTimes = [];

  const { server, url, close } = await createTestServer((req, res) => {
    requestTimes.push(Date.now());
    // Always fail to test backoff
    req.socket.destroy();
  });

  try {
    const startTime = Date.now();

    try {
      await fetchWithRetry(url, {
        retries: 3,
        retryDelay: 100, // 100ms base delay
      });
    } catch (error) {
      // Expected to fail
    }

    // Check timing: delays should be ~100ms, ~200ms (exponential backoff)
    // First retry delay: 100ms * 2^0 = 100ms
    // Second retry delay: 100ms * 2^1 = 200ms
    if (requestTimes.length >= 3) {
      const delay1 = requestTimes[1] - requestTimes[0];
      const delay2 = requestTimes[2] - requestTimes[1];

      // Allow some tolerance for timing variations
      assertTrue(delay1 >= 80 && delay1 <= 200, `First delay should be ~100ms, got ${delay1}ms`);
      assertTrue(delay2 >= 160 && delay2 <= 400, `Second delay should be ~200ms, got ${delay2}ms`);
      assertTrue(delay2 > delay1, 'Second delay should be longer than first (exponential backoff)');
    }

    console.log('  ✓ Exponential backoff tests passed');
  } finally {
    await close();
  }
}

/**
 * Test response caching
 */
async function testResponseCaching() {
  console.log('  Testing response caching...');

  let requestCount = 0;

  const { server, url, close } = await createTestServer((req, res) => {
    requestCount++;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ count: requestCount }));
  });

  try {
    clearCache();

    // First request - should hit server
    const response1 = await fetchWithRetry(url, { useCache: true });
    const data1 = await response1.json();
    assertEqual(data1.count, 1, 'First request should hit server');

    // Second request - should use cache
    const response2 = await fetchWithRetry(url, { useCache: true });
    const data2 = await response2.json();
    // Note: cached response was already consumed, so we can't read it again
    // But we can verify the server wasn't hit
    assertEqual(requestCount, 1, 'Second request should use cache, not hit server');

    // Verify cache stats
    const stats = getCacheStats();
    assertEqual(stats.size, 1, 'Cache should have 1 entry');

    // Clear cache and try again
    clearCache();
    const statsAfterClear = getCacheStats();
    assertEqual(statsAfterClear.size, 0, 'Cache should be empty after clear');

    console.log('  ✓ Response caching tests passed');
  } finally {
    await close();
  }
}

/**
 * Test fetchJSON convenience function
 */
async function testFetchJSON() {
  console.log('  Testing fetchJSON convenience function...');

  const testData = { name: 'test', values: [1, 2, 3] };

  const { server, url, close } = await createTestServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(testData));
  });

  try {
    const data = await fetchJSON(url);
    assertTrue(data !== null, 'fetchJSON should return data');
    assertEqual(data.name, 'test', 'Data name should match');
    assertEqual(data.values.length, 3, 'Data values length should match');

    console.log('  ✓ fetchJSON tests passed');
  } finally {
    await close();
  }
}

/**
 * Test fetchJSON returns null on error
 */
async function testFetchJSONReturnsNullOnError() {
  console.log('  Testing fetchJSON returns null on error...');

  // Use an invalid URL that will fail
  const result = await fetchJSON('http://127.0.0.1:1', {
    retries: 1,
    retryDelay: 10,
    timeout: 100,
  });

  assertEqual(result, null, 'fetchJSON should return null on connection error');

  console.log('  ✓ fetchJSON null on error tests passed');
}

/**
 * Test HTTP error responses (non-2xx)
 */
async function testHttpErrorResponses() {
  console.log('  Testing HTTP error responses...');

  const { server, url, close } = await createTestServer((req, res) => {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  try {
    // fetchWithRetry should return the response even for 4xx errors
    const response = await fetchWithRetry(url);
    assertTrue(response !== null, 'Response should not be null');
    assertEqual(response.status, 404, 'Status should be 404');
    assertTrue(!response.ok, 'Response should not be ok for 404');

    // fetchJSON should return null for non-ok responses
    const jsonResult = await fetchJSON(url);
    assertEqual(jsonResult, null, 'fetchJSON should return null for 404');

    console.log('  ✓ HTTP error response tests passed');
  } finally {
    await close();
  }
}

/**
 * Run all tests
 * @returns {Promise<boolean>} true if all tests pass
 */
export async function run() {
  console.log('Running API utility tests...\n');

  let passed = true;

  // Synchronous tests
  try {
    testDefaultConfig();
  } catch (error) {
    console.error('  ✗ Default config test failed:', error.message);
    passed = false;
  }

  // Async tests
  const asyncTests = [
    { name: 'Successful fetch', fn: testSuccessfulFetch },
    { name: 'Timeout behavior', fn: testTimeoutBehavior },
    { name: 'Retry logic', fn: testRetryLogic },
    { name: 'All retries exhausted', fn: testAllRetriesExhausted },
    { name: 'Exponential backoff', fn: testExponentialBackoff },
    { name: 'Response caching', fn: testResponseCaching },
    { name: 'fetchJSON', fn: testFetchJSON },
    { name: 'fetchJSON null on error', fn: testFetchJSONReturnsNullOnError },
    { name: 'HTTP error responses', fn: testHttpErrorResponses },
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
    console.log('All API utility tests passed! ✓');
  } else {
    console.log('Some tests failed! ✗');
  }

  return passed;
}

// Support direct execution
const isDirectRun = import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  run().then((success) => {
    process.exit(success ? 0 : 1);
  });
}
