import * as assert from 'assert';
import * as vscode from 'vscode';
import { ParameterCache } from '../parameterCache';
import { ParameterDefinition } from '../jscadEngine';

suite('Parameter Cache Test Suite', () => {
    let context: vscode.ExtensionContext;
    let cache: ParameterCache;

    setup(async () => {
        // Get extension context
        const extension = vscode.extensions.getExtension('hootcad.hootcad');
        assert.ok(extension, 'Extension should exist');
        
        if (!extension.isActive) {
            await extension.activate();
        }
        
        // Access the extension's context through exports if available
        // For testing, we'll create a mock context
        const mockWorkspaceState = new Map<string, any>();
        
        context = {
            workspaceState: {
                get: (key: string) => mockWorkspaceState.get(key),
                update: (key: string, value: any) => {
                    mockWorkspaceState.set(key, value);
                    return Promise.resolve();
                },
                keys: () => Array.from(mockWorkspaceState.keys())
            }
        } as any;
        
        cache = new ParameterCache(context);
    });

    test('Should store and retrieve parameter values', () => {
        const filePath = '/test/file.jscad';
        const values = { size: 20, center: true };
        
        cache.set(filePath, values);
        const retrieved = cache.get(filePath);
        
        assert.deepStrictEqual(retrieved, values, 'Retrieved values should match stored values');
    });

    test('Should update individual parameter', () => {
        const filePath = '/test/file.jscad';
        cache.set(filePath, { size: 10 });
        
        cache.updateParameter(filePath, 'size', 20);
        const retrieved = cache.get(filePath);
        
        assert.strictEqual(retrieved?.size, 20, 'Parameter should be updated');
    });

    test('Should merge defaults with cached values', () => {
        const filePath = '/test/file.jscad';
        const definitions: ParameterDefinition[] = [
            { name: 'size', type: 'number', initial: 10 },
            { name: 'center', type: 'checkbox', checked: false },
            { name: 'color', type: 'choice', values: ['red', 'blue'], initial: 'red' }
        ];
        
        // Set some cached values
        cache.set(filePath, { size: 25, center: true });
        
        const merged = cache.getMergedParameters(filePath, definitions);
        
        assert.strictEqual(merged.size, 25, 'Should use cached value for size');
        assert.strictEqual(merged.center, true, 'Should use cached value for center');
        assert.strictEqual(merged.color, 'red', 'Should use default value for color');
    });

    test('Should use checkbox defaults correctly', () => {
        const filePath = '/test/file2.jscad';
        const definitions: ParameterDefinition[] = [
            { name: 'enableFeature', type: 'checkbox', checked: true }
        ];
        
        const merged = cache.getMergedParameters(filePath, definitions);
        
        assert.strictEqual(merged.enableFeature, true, 'Should use checkbox default');
    });

    test('Should handle choice defaults', () => {
        const filePath = '/test/file3.jscad';
        const definitions: ParameterDefinition[] = [
            { name: 'shape', type: 'choice', values: ['cube', 'sphere', 'cylinder'], initial: 'sphere' }
        ];
        
        const merged = cache.getMergedParameters(filePath, definitions);
        
        assert.strictEqual(merged.shape, 'sphere', 'Should use choice initial value');
    });

    test('Should use first value as default for choice without initial', () => {
        const filePath = '/test/file4.jscad';
        const definitions: ParameterDefinition[] = [
            { name: 'color', type: 'choice', values: ['red', 'green', 'blue'] }
        ];
        
        const merged = cache.getMergedParameters(filePath, definitions);
        
        assert.strictEqual(merged.color, 'red', 'Should use first value as default');
    });

    test('Should clear cached values for a file', () => {
        const filePath = '/test/file.jscad';
        cache.set(filePath, { size: 20 });
        
        cache.clear(filePath);
        const retrieved = cache.get(filePath);
        
        assert.strictEqual(retrieved, undefined, 'Cached values should be cleared');
    });

    test('Should clear all cached values', () => {
        cache.set('/test/file1.jscad', { size: 10 });
        cache.set('/test/file2.jscad', { size: 20 });
        
        cache.clearAll();
        
        assert.strictEqual(cache.get('/test/file1.jscad'), undefined);
        assert.strictEqual(cache.get('/test/file2.jscad'), undefined);
    });

    test('Should persist to workspace state', () => {
        const filePath = '/test/file.jscad';
        const values = { size: 30, center: true };
        
        cache.set(filePath, values);
        
        // Create a new cache instance with the same context
        const newCache = new ParameterCache(context);
        const retrieved = newCache.get(filePath);
        
        assert.deepStrictEqual(retrieved, values, 'Values should persist across cache instances');
    });

    test('Should handle empty parameter definitions', () => {
        const filePath = '/test/file.jscad';
        const definitions: ParameterDefinition[] = [];
        
        const merged = cache.getMergedParameters(filePath, definitions);
        
        assert.deepStrictEqual(merged, {}, 'Should return empty object for no definitions');
    });

    test('Should handle file with no cached values', () => {
        const filePath = '/test/new-file.jscad';
        const retrieved = cache.get(filePath);
        
        assert.strictEqual(retrieved, undefined, 'Should return undefined for uncached file');
    });

    test('Should coerce color hex strings to RGBA arrays', () => {
        const filePath = '/test/color-file.jscad';
        const definitions: ParameterDefinition[] = [
            { name: 'sphereColor', type: 'color', initial: '#ff5555' }
        ];

        const merged = cache.getMergedParameters(filePath, definitions);
        assert.ok(Array.isArray(merged.sphereColor), 'Color should be an array');
        assert.strictEqual(merged.sphereColor.length, 4, 'Color should be RGBA');
        // #ff5555 -> (255,85,85,255)
        assert.ok(Math.abs(merged.sphereColor[0] - 1) < 1e-9);
        assert.ok(Math.abs(merged.sphereColor[1] - (85 / 255)) < 1e-9);
        assert.ok(Math.abs(merged.sphereColor[2] - (85 / 255)) < 1e-9);
        assert.ok(Math.abs(merged.sphereColor[3] - 1) < 1e-9);
    });

    test('Should coerce cached color hex overrides', () => {
        const filePath = '/test/color-file-2.jscad';
        const definitions: ParameterDefinition[] = [
            { name: 'sphereColor', type: 'color', initial: '#000000' }
        ];
        cache.set(filePath, { sphereColor: '#00ff00' });

        const merged = cache.getMergedParameters(filePath, definitions);
        assert.deepStrictEqual(merged.sphereColor, [0, 1, 0, 1]);
    });
});
