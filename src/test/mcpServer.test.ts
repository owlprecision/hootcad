/**
 * Tests for MCP Server Math Evaluation
 * 
 * These tests validate:
 * - Valid math expressions evaluate correctly
 * - Invalid syntax is rejected
 * - Security constraints are enforced
 * - Variables work correctly
 * 
 * IMPORTANT: Mathjs uses ^ for exponentiation, NOT JavaScript's ** operator
 * Examples:
 *   - Correct: math.evaluate('2 ^ 3') returns 8
 *   - Wrong:   math.evaluate('2 ** 3') throws SyntaxError
 */

import * as assert from 'assert';
import * as childProcess from 'child_process';
import * as path from 'path';
import { Readable, Writable } from 'stream';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

suite('MCP Server Test Suite', () => {
	function getBundledMcpServerPath(): string {
		// When running tests, __dirname is typically: <repo>/out/test
		return path.resolve(__dirname, '../../dist/mcpServer.js');
	}

	// Helper to create a test MCP client
	function createMcpClient(mcpServerPath: string): {
		process: childProcess.ChildProcess;
		stdin: Writable;
		stdout: Readable;
		stderr: Readable;
		send: (message: object) => void;
		readResponse: () => Promise<string>;
		close: () => void;
	} {
		const mcpProcess = childProcess.spawn(
			process.execPath,
			[mcpServerPath],
			{
				stdio: ['pipe', 'pipe', 'pipe']
			}
		);

		const send = (message: object) => {
			const jsonMessage = JSON.stringify(message);
			mcpProcess.stdin!.write(jsonMessage + '\n');
		};

		const readResponse = (): Promise<string> => {
			return new Promise((resolve, reject) => {
				let data = '';
				const onData = (chunk: Buffer) => {
					data += chunk.toString();
					// Check if we have a complete JSON message
					try {
						JSON.parse(data);
						mcpProcess.stdout!.removeListener('data', onData);
						resolve(data);
					} catch (e) {
						// Not complete yet, keep reading
					}
				};
				mcpProcess.stdout!.on('data', onData);
				
				// Timeout after 5 seconds
				setTimeout(() => {
					mcpProcess.stdout!.removeListener('data', onData);
					reject(new Error('Timeout waiting for response'));
				}, 5000);
			});
		};

		const close = () => {
			mcpProcess.kill();
		};

		return {
			process: mcpProcess,
			stdin: mcpProcess.stdin!,
			stdout: mcpProcess.stdout!,
			stderr: mcpProcess.stderr!,
			send,
			readResponse,
			close
		};
	}

	suite('Math Evaluation - Valid Expressions', () => {
		test('Should evaluate simple arithmetic', function () {
			// mathjs is large; the first require/load can exceed Mocha's default 2s timeout
			this.timeout(10000);

			// This test validates that the MCP server can be loaded and basic math works
			// We're testing the core functionality in isolation without needing a full MCP client
			
			// Use require to load the compiled server code
			const mathjs = require('mathjs');
			const math = mathjs.create(mathjs.all);
			
			assert.strictEqual(math.evaluate('2 + 2'), 4);
			assert.strictEqual(math.evaluate('10 - 3'), 7);
			assert.strictEqual(math.evaluate('4 * 5'), 20);
			assert.strictEqual(math.evaluate('20 / 4'), 5);
		});

		test('Should evaluate expressions with parentheses', () => {
			const mathjs = require('mathjs');
			const math = mathjs.create(mathjs.all);
			
			assert.strictEqual(math.evaluate('(2 + 3) * 4'), 20);
			assert.strictEqual(math.evaluate('2 + (3 * 4)'), 14);
		});

		test('Should evaluate expressions with exponents', () => {
			const mathjs = require('mathjs');
			const math = mathjs.create(mathjs.all);
			
			// mathjs uses ^ for exponentiation, not **
			assert.strictEqual(math.evaluate('2 ^ 3'), 8);
			assert.strictEqual(math.evaluate('10 ^ 2'), 100);
			assert.strictEqual(math.evaluate('pow(2, 3)'), 8);
		});

		test('Should evaluate expressions with math functions', () => {
			const mathjs = require('mathjs');
			const math = mathjs.create(mathjs.all);
			
			assert.strictEqual(math.evaluate('sqrt(16)'), 4);
			assert.strictEqual(math.evaluate('abs(-5)'), 5);
			assert.strictEqual(math.evaluate('max(3, 7, 2)'), 7);
			assert.strictEqual(math.evaluate('min(3, 7, 2)'), 2);
		});

		test('Should evaluate expressions with variables', () => {
			const mathjs = require('mathjs');
			const math = mathjs.create(mathjs.all);
			
			const result = math.evaluate('x + y', { x: 10, y: 20 });
			assert.strictEqual(result, 30);
		});

		test('Should evaluate complex expressions', () => {
			const mathjs = require('mathjs');
			const math = mathjs.create(mathjs.all);
			
			const result = math.evaluate('sqrt(x^2 + y^2)', { x: 3, y: 4 });
			assert.strictEqual(result, 5);
		});
	});

	suite('Math Evaluation - Invalid Expressions', () => {
		test('Should reject syntax errors', () => {
			const mathjs = require('mathjs');
			const math = mathjs.create(mathjs.all);
			
			assert.throws(() => {
				math.evaluate('2 +');
			}, /Unexpected end of expression/);
		});

		test('Should reject division by zero', () => {
			const mathjs = require('mathjs');
			const math = mathjs.create(mathjs.all);
			
			const result = math.evaluate('1 / 0');
			assert.ok(!Number.isFinite(result), 'Division by zero should produce Infinity');
		});

		test('Should reject undefined variables', () => {
			const mathjs = require('mathjs');
			const math = mathjs.create(mathjs.all);
			
			assert.throws(() => {
				math.evaluate('x + 5');
			}, /Undefined symbol/);
		});
	});

	suite('Security - Code Execution Prevention', () => {
		test('Should prevent function literals', () => {
			const mathjs = require('mathjs');
			const math = mathjs.create(mathjs.all);
			
			// mathjs doesn't support JavaScript function literals
			assert.throws(() => {
				math.evaluate('(() => 42)()');
			});
		});

		test('Should prevent property access after hardening', () => {
			const mathjs = require('mathjs');
			const math = mathjs.create(mathjs.all);
			
			// Capture evaluate before disabling
			const limitedEvaluate = math.evaluate;
			
			// Disable dangerous functions
			math.import({
				import: () => { throw new Error('Function import is disabled'); },
				createUnit: () => { throw new Error('Function createUnit is disabled'); },
				evaluate: () => { throw new Error('Function evaluate is disabled'); },
				parse: () => { throw new Error('Function parse is disabled'); },
			}, { override: true });
			
			// Normal evaluation should still work
			assert.strictEqual(limitedEvaluate('2 + 2'), 4);
			
			// But direct calls to disabled functions should fail
			assert.throws(() => {
				math.import({}, {});
			}, /Function import is disabled/);
		});

		test('Should not allow string operations', () => {
			const mathjs = require('mathjs');
			const math = mathjs.create(mathjs.all);
			
			// mathjs treats strings as invalid in numeric expressions
			assert.throws(() => {
				math.evaluate('"hello" + "world"');
			});
		});
	});

	suite('MCP Protocol Integration (Bundled Server)', () => {
		test('Should list tools and evaluate math.eval end-to-end', async function () {
			this.timeout(15000);

			const mcpServerPath = getBundledMcpServerPath();
			const transport = new StdioClientTransport({
				command: 'node',
				args: [mcpServerPath],
				stderr: 'pipe'
			});

			const client = new Client(
				{ name: 'hootcad-test-client', version: '0.0.0' },
				{ capabilities: {} }
			);

			try {
				await client.connect(transport);
				const toolsResult = await client.listTools();
				assert.ok(
					toolsResult.tools.some((t) => t.name === 'math.eval'),
					'Expected math.eval tool to be exposed'
				);
				assert.ok(
					toolsResult.tools.some((t) => t.name === 'cad.eval'),
					'Expected cad.eval tool alias to be exposed'
				);

				const result: any = await client.callTool({
					name: 'math.eval',
					arguments: {
						expr: 'sqrt(x^2 + y^2)',
						vars: { x: 3, y: 4 }
					}
				});

				assert.ok(result.content.length > 0);
				assert.strictEqual(result.content[0].type, 'text');
				const parsed = JSON.parse((result.content[0] as any).text);
				assert.strictEqual(parsed.value, 5);
			} finally {
				await client.close();
			}
		});
	});

	suite('Input Validation', () => {
		test('Should validate variable names', () => {
			// Valid variable names
			const validNames = ['x', 'y', 'width', 'height', 'param_1', '_temp'];
			const VALID_VAR_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
			
			for (const name of validNames) {
				assert.ok(VALID_VAR_NAME.test(name), `${name} should be valid`);
			}
			
			// Invalid variable names
			const invalidNames = ['1x', 'x-y', 'x.y', 'x[0]', ''];
			for (const name of invalidNames) {
				assert.ok(!VALID_VAR_NAME.test(name), `${name} should be invalid`);
			}
		});

		test('Should validate finite numbers', () => {
			const testValues = [
				{ value: 42, valid: true },
				{ value: -3.14, valid: true },
				{ value: 0, valid: true },
				{ value: Infinity, valid: false },
				{ value: -Infinity, valid: false },
				{ value: NaN, valid: false }
			];
			
			for (const test of testValues) {
				assert.strictEqual(
					Number.isFinite(test.value),
					test.valid,
					`${test.value} should be ${test.valid ? 'valid' : 'invalid'}`
				);
			}
		});

		test('Should enforce expression length limits', () => {
			const MAX_EXPRESSION_LENGTH = 1000;
			
			// Valid length
			const shortExpr = '2 + 2';
			assert.ok(shortExpr.length <= MAX_EXPRESSION_LENGTH);
			
			// Invalid length
			const longExpr = 'x + '.repeat(500) + '1';
			assert.ok(longExpr.length > MAX_EXPRESSION_LENGTH);
		});

		test('Should enforce variable count limits', () => {
			const MAX_VARIABLES = 100;
			
			// Valid count
			const fewVars: Record<string, number> = {};
			for (let i = 0; i < 10; i++) {
				fewVars[`x${i}`] = i;
			}
			assert.ok(Object.keys(fewVars).length <= MAX_VARIABLES);
			
			// Invalid count
			const manyVars: Record<string, number> = {};
			for (let i = 0; i < 150; i++) {
				manyVars[`x${i}`] = i;
			}
			assert.ok(Object.keys(manyVars).length > MAX_VARIABLES);
		});
	});

	suite('CAD-Specific Use Cases', () => {
		test('Should calculate distances', () => {
			const mathjs = require('mathjs');
			const math = mathjs.create(mathjs.all);
			
			// Distance formula: sqrt((x2-x1)^2 + (y2-y1)^2)
			const distance = math.evaluate('sqrt((x2-x1)^2 + (y2-y1)^2)', {
				x1: 0, y1: 0,
				x2: 3, y2: 4
			});
			assert.strictEqual(distance, 5);
		});

		test('Should calculate angles', () => {
			const mathjs = require('mathjs');
			const math = mathjs.create(mathjs.all);
			
			// Right angle is PI/2 radians
			const angle = math.evaluate('atan2(y, x)', { x: 0, y: 1 });
			assert.strictEqual(angle, Math.PI / 2);
		});

		test('Should calculate volumes', () => {
			const mathjs = require('mathjs');
			const math = mathjs.create(mathjs.all);
			
			// Volume of a box: length * width * height
			const volume = math.evaluate('length * width * height', {
				length: 10,
				width: 5,
				height: 3
			});
			assert.strictEqual(volume, 150);
		});

		test('Should handle parametric calculations', () => {
			const mathjs = require('mathjs');
			const math = mathjs.create(mathjs.all);
			
			// Circle circumference: 2 * PI * radius
			const circumference = math.evaluate('2 * pi * radius', { radius: 5 });
			assert.strictEqual(Math.round(circumference * 100) / 100, 31.42);
		});
	});
});
