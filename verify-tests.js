#!/usr/bin/env node
/**
 * Verification script for MCP Server math tests
 * This script verifies that all math operations work correctly
 * before running the full CI test suite.
 */

const assert = require('assert');
const mathjs = require('mathjs');

console.log('Verifying MCP Server Math Operations...\n');

let failures = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(`  Error: ${error.message}`);
    failures++;
  }
}

// Test 1: Simple arithmetic
test('Simple arithmetic (2 + 2 = 4)', () => {
  const math = mathjs.create(mathjs.all);
  assert.strictEqual(math.evaluate('2 + 2'), 4);
  assert.strictEqual(math.evaluate('10 - 3'), 7);
  assert.strictEqual(math.evaluate('4 * 5'), 20);
  assert.strictEqual(math.evaluate('20 / 4'), 5);
});

// Test 2: Parentheses
test('Parentheses ((2 + 3) * 4 = 20)', () => {
  const math = mathjs.create(mathjs.all);
  assert.strictEqual(math.evaluate('(2 + 3) * 4'), 20);
  assert.strictEqual(math.evaluate('2 + (3 * 4)'), 14);
});

// Test 3: Exponents with ^ operator (NOT **)
test('Exponents using ^ operator (2 ^ 3 = 8)', () => {
  const math = mathjs.create(mathjs.all);
  assert.strictEqual(math.evaluate('2 ^ 3'), 8);
  assert.strictEqual(math.evaluate('10 ^ 2'), 100);
  assert.strictEqual(math.evaluate('pow(2, 3)'), 8);
});

// Test 4: Math functions
test('Math functions (sqrt, abs, max, min)', () => {
  const math = mathjs.create(mathjs.all);
  assert.strictEqual(math.evaluate('sqrt(16)'), 4);
  assert.strictEqual(math.evaluate('abs(-5)'), 5);
  assert.strictEqual(math.evaluate('max(3, 7, 2)'), 7);
  assert.strictEqual(math.evaluate('min(3, 7, 2)'), 2);
});

// Test 5: Variables
test('Variables (x + y with x=10, y=20)', () => {
  const math = mathjs.create(mathjs.all);
  const result = math.evaluate('x + y', { x: 10, y: 20 });
  assert.strictEqual(result, 30);
});

// Test 6: Complex expressions
test('Complex expressions (sqrt(x^2 + y^2))', () => {
  const math = mathjs.create(mathjs.all);
  const result = math.evaluate('sqrt(x^2 + y^2)', { x: 3, y: 4 });
  assert.strictEqual(result, 5);
});

// Test 7: Distance calculation
test('Distance formula (Pythagorean theorem)', () => {
  const math = mathjs.create(mathjs.all);
  const distance = math.evaluate('sqrt((x2-x1)^2 + (y2-y1)^2)', {
    x1: 0, y1: 0,
    x2: 3, y2: 4
  });
  assert.strictEqual(distance, 5);
});

// Test 8: Verify ** operator fails (should use ^ instead)
test('Verify ** operator is NOT supported (should fail)', () => {
  const math = mathjs.create(mathjs.all);
  let didFail = false;
  try {
    math.evaluate('2 ** 3');
  } catch (error) {
    didFail = true;
  }
  assert.ok(didFail, '** operator should not be supported, use ^ instead');
});

console.log(`\n${failures === 0 ? '✅' : '❌'} Verification complete: ${failures} failure(s)\n`);

if (failures > 0) {
  console.error('Note: Mathjs uses ^ for exponentiation, NOT the JavaScript ** operator');
  console.error('Please update any tests using ** to use ^ instead');
  process.exit(1);
}

console.log('All math operations verified successfully!');
process.exit(0);
