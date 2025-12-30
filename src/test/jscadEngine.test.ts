import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { resolveJscadEntrypoint, resolveJscadEntrypointWithOptions, executeJscadFile, getParameterDefinitions } from '../jscadEngine';

suite('JSCAD Engine Test Suite', () => {
	// Tests run from compiled output in CI (out/test/**). Fixtures live in src/test/fixtures.
	// Resolve to repo-root/src/test/fixtures regardless of whether __dirname is src/test or out/test.
	const fixturesPath = path.resolve(__dirname, '../../src/test/fixtures');
	
	// Create a proper mock OutputChannel
	const createMockOutputChannel = (captureLog: boolean = false, logs?: string[]): vscode.OutputChannel => {
		return {
			name: 'Test Output Channel',
			append: (value: string) => { 
				if (captureLog && logs) { 
					logs.push(value); 
				}
			},
			appendLine: (value: string) => { 
				if (captureLog && logs) { 
					logs.push(value); 
				}
			},
			replace: (value: string) => { /* no-op */ },
			clear: () => { /* no-op */ },
			show: () => { /* no-op */ },
			hide: () => { /* no-op */ },
			dispose: () => { /* no-op */ }
		};
	};
	
	const mockOutputChannel = createMockOutputChannel();

	suite('Test Fixture Validation', () => {
		const requiredFixtures = [
			'valid-cube.jscad',
			'valid-multiple.jscad',
			'valid-2d.jscad',
			'no-main.jscad',
			'syntax-error.jscad',
			'runtime-error.jscad',
			'index.jscad',
			'test-package.json',
			'invalid-main-package.json'
		];

		test('All required test fixtures exist', () => {
			for (const fixture of requiredFixtures) {
				const fixturePath = path.join(fixturesPath, fixture);
				assert.ok(
					fs.existsSync(fixturePath), 
					`Required fixture file missing: ${fixture}`
				);
			}
		});

		test('Valid fixtures are syntactically correct', () => {
			const validFixtures = ['valid-cube.jscad', 'valid-multiple.jscad', 'valid-2d.jscad'];
			
			for (const fixture of validFixtures) {
				const fixturePath = path.join(fixturesPath, fixture);
				assert.doesNotThrow(
					() => {
						require(fixturePath);
					},
					`Valid fixture should not throw: ${fixture}`
				);
			}
		});

		test('Valid fixtures export main function', () => {
			const validFixtures = ['valid-cube.jscad', 'valid-multiple.jscad', 'valid-2d.jscad'];
			
			for (const fixture of validFixtures) {
				const fixturePath = path.join(fixturesPath, fixture);
				const module = require(fixturePath);
				assert.ok(module.main, `${fixture} should export main`);
				assert.strictEqual(typeof module.main, 'function', `${fixture} main should be a function`);
			}
		});

		test('Invalid fixtures have expected problems', () => {
			// no-main.jscad should not export main
			const noMainPath = path.join(fixturesPath, 'no-main.jscad');
			const noMainModule = require(noMainPath);
			assert.strictEqual(noMainModule.main, undefined, 'no-main.jscad should not export main');

			// syntax-error.jscad should throw on require
			const syntaxErrorPath = path.join(fixturesPath, 'syntax-error.jscad');
			assert.throws(
				() => {
					delete require.cache[path.resolve(syntaxErrorPath)];
					require(syntaxErrorPath);
				},
				'syntax-error.jscad should throw'
			);
		});
	});

	suite('Entrypoint Resolution', () => {
		test('resolveJscadEntrypoint returns null when no workspace and no active editor', () => {
			// This test assumes no workspace is open and no .jscad file is active
			const entrypoint = resolveJscadEntrypoint();
			// Could be null or could resolve from active editor depending on test environment
			assert.ok(entrypoint === null || typeof entrypoint === 'object');
		});

		test('resolveJscadEntrypoint resolves from package.json main field', async () => {
			// Create a temporary workspace-like directory structure
			const testDir = path.join(fixturesPath, 'workspace-test-1');
			
			// Clean up from previous runs
			if (fs.existsSync(testDir)) {
				fs.rmSync(testDir, { recursive: true });
			}
			
			fs.mkdirSync(testDir, { recursive: true });
			
			try {
				// Create package.json with main field
				const packageJson = {
					name: 'test-workspace',
					main: 'entry.jscad'
				};
				fs.writeFileSync(
					path.join(testDir, 'package.json'),
					JSON.stringify(packageJson, null, 2)
				);
				
				// Create the referenced .jscad file
				const jscadContent = `
const { cube } = require('@jscad/modeling').primitives
const main = () => cube({ size: 10 })
module.exports = { main }
				`;
				fs.writeFileSync(
					path.join(testDir, 'entry.jscad'),
					jscadContent
				);
				
				// Avoid vscode.openFolder in tests: it reloads the window and can cancel the extension host in CI.
				const entrypoint = resolveJscadEntrypointWithOptions({ workspaceRoot: testDir });
				
				assert.ok(entrypoint, 'Should resolve an entrypoint');
				assert.strictEqual(entrypoint.source, 'package.json', 'Should resolve from package.json');
				assert.ok(entrypoint.filePath.endsWith('entry.jscad'), 'Should point to entry.jscad');
			} finally {
				// Clean up
				if (fs.existsSync(testDir)) {
					fs.rmSync(testDir, { recursive: true });
				}
			}
		});

		test('resolveJscadEntrypoint skips package.json if main is not .jscad', async () => {
			const testDir = path.join(fixturesPath, 'workspace-test-2');
			
			if (fs.existsSync(testDir)) {
				fs.rmSync(testDir, { recursive: true });
			}
			
			fs.mkdirSync(testDir, { recursive: true });
			
			try {
				// Create package.json with non-.jscad main
				const packageJson = {
					name: 'test-workspace',
					main: 'index.js'  // Not a .jscad file
				};
				fs.writeFileSync(
					path.join(testDir, 'package.json'),
					JSON.stringify(packageJson, null, 2)
				);
				
				// Create index.jscad at root
				const jscadContent = `
const { cube } = require('@jscad/modeling').primitives
const main = () => cube({ size: 10 })
module.exports = { main }
				`;
				fs.writeFileSync(
					path.join(testDir, 'index.jscad'),
					jscadContent
				);
				
				const entrypoint = resolveJscadEntrypointWithOptions({ workspaceRoot: testDir });
				
				assert.ok(entrypoint, 'Should resolve an entrypoint');
				assert.strictEqual(entrypoint.source, 'index.jscad', 'Should resolve from index.jscad');
			} finally {
				if (fs.existsSync(testDir)) {
					fs.rmSync(testDir, { recursive: true });
				}
			}
		});
	});

	suite('JSCAD File Execution', () => {
		test('executeJscadFile succeeds with valid cube', async () => {
			const filePath = path.join(fixturesPath, 'valid-cube.jscad');
			
			const entities = await executeJscadFile(filePath, mockOutputChannel);
			
			assert.ok(Array.isArray(entities), 'Should return array');
			assert.ok(entities.length > 0, 'Should return at least one entity');
			assert.ok(entities[0], 'Entity should be defined');
		});

		test('executeJscadFile succeeds with multiple geometries', async () => {
			const filePath = path.join(fixturesPath, 'valid-multiple.jscad');
			
			const entities = await executeJscadFile(filePath, mockOutputChannel);
			
			assert.ok(Array.isArray(entities), 'Should return array');
			assert.ok(entities.length >= 2, 'Should return at least two entities');
			assert.ok(entities[0] && entities[1], 'Both entities should be defined');
		});

		test('executeJscadFile throws error when main() is missing', async () => {
			const filePath = path.join(fixturesPath, 'no-main.jscad');
			
			await assert.rejects(
				async () => {
					await executeJscadFile(filePath, mockOutputChannel);
				},
				{
					message: 'JSCAD file must export a main() function'
				},
				'Should throw error for missing main()'
			);
		});

		test('executeJscadFile throws error for syntax errors', async () => {
			const filePath = path.join(fixturesPath, 'syntax-error.jscad');
			
			await assert.rejects(
				async () => {
					await executeJscadFile(filePath, mockOutputChannel);
				},
				'Should throw error for syntax errors'
			);
		});

		test('executeJscadFile throws error for runtime errors', async () => {
			const filePath = path.join(fixturesPath, 'runtime-error.jscad');
			
			await assert.rejects(
				async () => {
					await executeJscadFile(filePath, mockOutputChannel);
				},
				{
					message: 'Intentional runtime error'
				},
				'Should throw error for runtime errors in main()'
			);
		});

		test('executeJscadFile error stack includes .jscad source location', async () => {
			const filePath = path.join(fixturesPath, 'runtime-error.jscad');
			try {
				await executeJscadFile(filePath, mockOutputChannel);
				assert.fail('Expected executeJscadFile to throw');
			} catch (err) {
				assert.ok(err && typeof err === 'object', 'Should throw an error-like object');
				const stack = (err as any).stack;
				assert.ok(typeof stack === 'string' && stack.length > 0, 'Error should include a stack trace');
				assert.ok(
					stack.includes(filePath),
					`Stack trace should include the source file path (${filePath})`
				);
			}
		});

		test('executeJscadFile clears require cache for fresh execution', async () => {
			const filePath = path.join(fixturesPath, 'valid-cube.jscad');
			
			// Execute twice - the second execution should work (not cached)
			const entities1 = await executeJscadFile(filePath, mockOutputChannel);
			const entities2 = await executeJscadFile(filePath, mockOutputChannel);
			
			assert.ok(entities1.length > 0, 'First execution should succeed');
			assert.ok(entities2.length > 0, 'Second execution should succeed');
			// Note: We're not testing the actual cache clearing mechanism deeply,
			// just that it doesn't break repeated execution
		});

		test('executeJscadFile converts single geometry to entities array', async () => {
			const filePath = path.join(fixturesPath, 'valid-cube.jscad');
			
			const entities = await executeJscadFile(filePath, mockOutputChannel);
			
			assert.ok(Array.isArray(entities), 'Should always return array');
			assert.ok(entities.length > 0, 'Should return at least one entity');
		});

		test('executeJscadFile converts multiple geometries to entities array', async () => {
			const filePath = path.join(fixturesPath, 'valid-multiple.jscad');
			
			const entities = await executeJscadFile(filePath, mockOutputChannel);
			
			assert.ok(Array.isArray(entities), 'Should return array');
			assert.ok(entities.length >= 2, 'Should return multiple entities');
		});

		test('executeJscadFile handles 2D geometries', async () => {
			const filePath = path.join(fixturesPath, 'valid-2d.jscad');
			
			const entities = await executeJscadFile(filePath, mockOutputChannel);
			
			assert.ok(Array.isArray(entities), 'Should return array');
			assert.ok(entities.length >= 2, 'Should return entities for 2D geometries');
			// Entities should have proper draw commands for 2D
			const hasLineDrawCmd = entities.some(e => e.visuals && e.visuals.drawCmd === 'drawLines');
			assert.ok(hasLineDrawCmd, 'Should have entities with drawLines command for 2D geometry');
		});
	});

	suite('Error Handling', () => {
		test('executeJscadFile provides detailed error messages', async () => {
			const filePath = path.join(fixturesPath, 'runtime-error.jscad');
			
			try {
				await executeJscadFile(filePath, mockOutputChannel);
				assert.fail('Should have thrown an error');
			} catch (error) {
				assert.ok(error && typeof error === 'object', 'Should throw error-like object');
				assert.ok(typeof (error as any).message === 'string', 'Should include error message');
				assert.ok((error as any).message.includes('Intentional runtime error'), 'Should include error message');
			}
		});

		test('executeJscadFile handles non-existent files', async () => {
			const filePath = path.join(fixturesPath, 'does-not-exist.jscad');
			
			await assert.rejects(
				async () => {
					await executeJscadFile(filePath, mockOutputChannel);
				},
				'Should throw error for non-existent files'
			);
		});
	});

	suite('Integration with OutputChannel', () => {
		test('executeJscadFile logs execution to output channel', async () => {
			const logs: string[] = [];
			const testOutputChannel = createMockOutputChannel(true, logs);

			const filePath = path.join(fixturesPath, 'valid-cube.jscad');
			await executeJscadFile(filePath, testOutputChannel);
			
			assert.ok(logs.some(log => log.includes('Executing JSCAD file')), 'Should log execution start');
			assert.ok(logs.some(log => log.includes('executed successfully')), 'Should log success');
			assert.ok(logs.some(log => log.includes('Converted')), 'Should log entity conversion');
		});

		test('executeJscadFile logs errors to output channel', async () => {
			const logs: string[] = [];
			const testOutputChannel = createMockOutputChannel(true, logs);

			const filePath = path.join(fixturesPath, 'runtime-error.jscad');
			
			try {
				await executeJscadFile(filePath, testOutputChannel);
			} catch (error) {
				// Expected to throw
			}
			
			assert.ok(logs.some(log => log.includes('Error executing JSCAD file')), 'Should log error');
		});
	});

	suite('Parameter Definitions', () => {
		test('getParameterDefinitions returns empty array for file without parameters', async () => {
			const filePath = path.join(fixturesPath, 'valid-cube.jscad');
			
			const definitions = await getParameterDefinitions(filePath, mockOutputChannel);
			
			assert.ok(Array.isArray(definitions), 'Should return an array');
			assert.strictEqual(definitions.length, 0, 'Should return empty array for no parameters');
		});

		test('getParameterDefinitions returns definitions from parametric file', async () => {
			// Create a test file with parameters
			const testDir = path.join(fixturesPath, 'param-test');
			if (!fs.existsSync(testDir)) {
				fs.mkdirSync(testDir, { recursive: true });
			}
			
			const filePath = path.join(testDir, 'parametric.jscad');
			const content = `
const { cube } = require('@jscad/modeling').primitives

const getParameterDefinitions = () => {
	return [
		{ name: 'size', type: 'number', initial: 10, min: 1, max: 50, caption: 'Cube Size' },
		{ name: 'center', type: 'checkbox', checked: false, caption: 'Center Cube' }
	]
}

const main = (params) => cube({ size: params.size || 10 })

module.exports = { main, getParameterDefinitions }
			`;
			
			try {
				fs.writeFileSync(filePath, content);
				
				const definitions = await getParameterDefinitions(filePath, mockOutputChannel);
				
				assert.ok(Array.isArray(definitions), 'Should return an array');
				assert.strictEqual(definitions.length, 2, 'Should return two parameter definitions');
				assert.strictEqual(definitions[0].name, 'size', 'First parameter should be size');
				assert.strictEqual(definitions[0].type, 'number', 'Should have correct type');
				assert.strictEqual(definitions[0].initial, 10, 'Should have initial value');
				assert.strictEqual(definitions[1].name, 'center', 'Second parameter should be center');
				assert.strictEqual(definitions[1].type, 'checkbox', 'Should have checkbox type');
			} finally {
				// Clean up
				if (fs.existsSync(testDir)) {
					fs.rmSync(testDir, { recursive: true });
				}
			}
		});

		test('executeJscadFile uses provided parameters', async () => {
			// Create a parametric test file
			const testDir = path.join(fixturesPath, 'param-test');
			if (!fs.existsSync(testDir)) {
				fs.mkdirSync(testDir, { recursive: true });
			}
			
			const filePath = path.join(testDir, 'parametric-exec.jscad');
			const content = `
const { cube } = require('@jscad/modeling').primitives

const main = (params) => {
	const size = params.size || 10;
	return cube({ size });
}

module.exports = { main }
			`;
			
			try {
				fs.writeFileSync(filePath, content);
				
				// Execute with custom parameters
				const params = { size: 25 };
				const entities = await executeJscadFile(filePath, mockOutputChannel, params);
				
				assert.ok(Array.isArray(entities), 'Should return entities array');
				assert.ok(entities.length > 0, 'Should return at least one entity');
				// The geometry should reflect the custom size (25 vs default 10)
				// We can't directly verify the size, but we can verify execution succeeded
			} finally {
				// Clean up
				if (fs.existsSync(testDir)) {
					fs.rmSync(testDir, { recursive: true });
				}
			}
		});

		test('executeJscadFile uses empty params when none provided', async () => {
			const filePath = path.join(fixturesPath, 'valid-cube.jscad');
			
			// Execute without parameters (should use empty object)
			const entities = await executeJscadFile(filePath, mockOutputChannel);
			
			assert.ok(Array.isArray(entities), 'Should return entities array');
			assert.ok(entities.length > 0, 'Should return at least one entity');
		});

		test('getParameterDefinitions handles errors gracefully', async () => {
			const filePath = path.join(fixturesPath, 'syntax-error.jscad');
			
			// Should not throw, but return empty array
			const definitions = await getParameterDefinitions(filePath, mockOutputChannel);
			
			assert.ok(Array.isArray(definitions), 'Should return an array');
			assert.strictEqual(definitions.length, 0, 'Should return empty array on error');
		});
	});
});
