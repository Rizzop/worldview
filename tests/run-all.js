#!/usr/bin/env node
/**
 * Master Test Runner
 * Executes all test files, aggregates results, and prints summary.
 * Exits with code 0 if all pass, 1 if any fail.
 */

// List of all test modules to run
const testModules = [
  { name: 'test-coordinates', path: './test-coordinates.js' },
  { name: 'test-sgp4', path: './test-sgp4.js' },
  { name: 'test-satellites', path: './test-satellites.js' },
  { name: 'test-flights', path: './test-flights.js' },
  { name: 'test-military-filter', path: './test-military-filter.js' },
  { name: 'test-seismic', path: './test-seismic.js' },
  { name: 'test-traffic', path: './test-traffic.js' },
  { name: 'test-cctv', path: './test-cctv.js' },
  { name: 'test-shaders', path: './test-shaders.js' },
  { name: 'test-api-utils', path: './test-api-utils.js' },
  { name: 'test-ui-module', path: './test-ui-module.js' },
  { name: 'test-config', path: './test-config.js' },
];

/**
 * Run all tests and collect results
 */
async function runAllTests() {
  const startTime = Date.now();
  const results = [];

  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║               MASTER TEST RUNNER - WorldView                   ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`Running ${testModules.length} test suites...\n`);
  console.log('────────────────────────────────────────────────────────────────────');

  for (const testModule of testModules) {
    console.log(`\n▶ ${testModule.name}`);
    console.log('─'.repeat(40));

    let passed = false;
    let error = null;

    try {
      // Dynamically import the test module
      const module = await import(testModule.path);

      // Each test module exports a run() function that returns true/false
      if (typeof module.run !== 'function') {
        throw new Error(`Test module ${testModule.name} does not export a run() function`);
      }

      // Run the test - handle both sync and async
      const result = await module.run();
      passed = result === true;

      if (!passed && result !== false) {
        // If run() doesn't return a boolean, treat non-false as passing
        passed = result !== false;
      }
    } catch (err) {
      passed = false;
      error = err;
      console.error(`  ✗ Error: ${err.message}`);
    }

    results.push({
      name: testModule.name,
      passed,
      error
    });

    const status = passed ? '✓ PASSED' : '✗ FAILED';
    console.log(`\n${status}: ${testModule.name}`);
    console.log('────────────────────────────────────────────────────────────────────');
  }

  // Calculate summary
  const totalTests = results.length;
  const passedTests = results.filter(r => r.passed).length;
  const failedTests = totalTests - passedTests;
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

  // Print summary
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║                        TEST SUMMARY                            ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');

  // Results per test
  for (const result of results) {
    const icon = result.passed ? '✓' : '✗';
    const status = result.passed ? 'PASS' : 'FAIL';
    console.log(`  ${icon} ${status.padEnd(4)} │ ${result.name}`);
  }

  console.log('');
  console.log('────────────────────────────────────────────────────────────────────');
  console.log(`  ${passedTests}/${totalTests} tests passed`);
  console.log(`  Time elapsed: ${elapsed}s`);
  console.log('────────────────────────────────────────────────────────────────────');

  if (failedTests > 0) {
    console.log('\n✗ Some tests failed!\n');
    console.log('Failed tests:');
    for (const result of results.filter(r => !r.passed)) {
      console.log(`  - ${result.name}${result.error ? `: ${result.error.message}` : ''}`);
    }
    return false;
  } else {
    console.log('\n✓ All tests passed!\n');
    return true;
  }
}

// Run and exit with appropriate code
runAllTests()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(err => {
    console.error('Fatal error in test runner:', err);
    process.exit(1);
  });
