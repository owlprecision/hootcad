import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { executeJscadFile } from '../jscadEngine';
import { createRequire } from 'module';

suite('Export Integration Test Suite', () => {
    const fixturesPath = path.resolve(__dirname, '../../src/test/fixtures');
    
    // Create a mock OutputChannel
    const createMockOutputChannel = (): any => {
        return {
            name: 'Test Output Channel',
            append: (value: string) => { },
            appendLine: (value: string) => { },
            replace: (value: string) => { },
            clear: () => { },
            show: () => { },
            hide: () => { },
            dispose: () => { }
        };
    };
    
    const mockOutputChannel = createMockOutputChannel();
    
    /**
     * Helper function to convert serialized geometries to JSCAD modeling objects
     */
    const convertGeometries = (geometries: any[], modeling: any): any[] => {
        return geometries.map(serialized => {
            if (serialized.type === 'geom3') {
                return modeling.geometries.geom3.create(serialized.polygons);
            } else if (serialized.type === 'geom2') {
                return modeling.geometries.geom2.create(serialized.sides);
            }
            return serialized;
        });
    };
    
    /**
     * Helper to get extension require
     */
    const getExtensionRequire = () => {
        // Walk up from the compiled test location until we find this extension's package.json.
        // (The test runner's working directory can vary, so relative paths can accidentally
        // land on an unrelated parent folder's package.json.)
        let currentDir = __dirname;
        for (let i = 0; i < 8; i++) {
            const candidate = path.join(currentDir, 'package.json');
            if (fs.existsSync(candidate)) {
                try {
                    const pkg = JSON.parse(fs.readFileSync(candidate, 'utf8'));
                    if (pkg?.name === 'hootcad') {
                        return createRequire(candidate);
                    }
                } catch {
                    // Ignore invalid package.json and keep walking
                }
            }
            const parentDir = path.dirname(currentDir);
            if (parentDir === currentDir) {
                break;
            }
            currentDir = parentDir;
        }

        // Fallback to the historical relative path (kept for readability when it works).
        const fallback = path.resolve(__dirname, '../../../package.json');
        return createRequire(fallback);
    };
    
    suite('JSCAD Serializer Integration', () => {
        test('STL serializer can be loaded', () => {
            const extensionRequire = getExtensionRequire();
            assert.doesNotThrow(() => {
                const stlSerializer = extensionRequire('@jscad/stl-serializer');
                assert.ok(stlSerializer, 'STL serializer should load');
                assert.ok(typeof stlSerializer.serialize === 'function', 'STL serializer should have serialize function');
            });
        });
        
        test('OBJ serializer can be loaded', () => {
            const extensionRequire = getExtensionRequire();
            assert.doesNotThrow(() => {
                const objSerializer = extensionRequire('@jscad/obj-serializer');
                assert.ok(objSerializer, 'OBJ serializer should load');
                assert.ok(typeof objSerializer.serialize === 'function', 'OBJ serializer should have serialize function');
            });
        });
        
        test('SVG serializer can be loaded', () => {
            const extensionRequire = getExtensionRequire();
            assert.doesNotThrow(() => {
                const svgSerializer = extensionRequire('@jscad/svg-serializer');
                assert.ok(svgSerializer, 'SVG serializer should load');
                assert.ok(typeof svgSerializer.serialize === 'function', 'SVG serializer should have serialize function');
            });
        });
        
        test('JSON serializer can be loaded', () => {
            const extensionRequire = getExtensionRequire();
            assert.doesNotThrow(() => {
                const jsonSerializer = extensionRequire('@jscad/json-serializer');
                assert.ok(jsonSerializer, 'JSON serializer should load');
                assert.ok(typeof jsonSerializer.serialize === 'function', 'JSON serializer should have serialize function');
            });
        });
    });
    
    suite('End-to-End Export Workflow', () => {
        test('Can execute JSCAD and serialize to STL binary', async () => {
            const filePath = path.join(fixturesPath, 'valid-cube.jscad');
            
            // Step 1: Execute JSCAD file
            const geometries = await executeJscadFile(filePath, mockOutputChannel);
            assert.ok(geometries.length > 0, 'Should generate geometries');
            
            // Step 2: Convert to JSCAD modeling objects
            const extensionRequire = getExtensionRequire();
            const modeling = extensionRequire('@jscad/modeling');
            const jscadGeometries = convertGeometries(geometries, modeling);
            
            // Step 3: Serialize to STL binary
            const stlSerializer = extensionRequire('@jscad/stl-serializer');
            const stlData = stlSerializer.serialize({ binary: true }, ...jscadGeometries);
            
            assert.ok(Array.isArray(stlData), 'Should return array');
            assert.ok(stlData.length > 0, 'Should return data');
            assert.ok(
                stlData[0] instanceof ArrayBuffer || stlData[0] instanceof Uint8Array || Buffer.isBuffer(stlData[0]),
                'Binary STL should be ArrayBuffer, Uint8Array, or Buffer'
            );
        });
        
        test('Can execute JSCAD and serialize to STL ASCII', async () => {
            const filePath = path.join(fixturesPath, 'valid-cube.jscad');
            
            const geometries = await executeJscadFile(filePath, mockOutputChannel);
            
            const extensionRequire = getExtensionRequire();
            const modeling = extensionRequire('@jscad/modeling');
            const jscadGeometries = convertGeometries(geometries, modeling);
            
            const stlSerializer = extensionRequire('@jscad/stl-serializer');
            const stlData = stlSerializer.serialize({ binary: false }, ...jscadGeometries);
            
            assert.ok(Array.isArray(stlData), 'Should return array');
            assert.ok(stlData.length > 0, 'Should return data');
            assert.ok(typeof stlData[0] === 'string', 'ASCII STL should be string');
            assert.ok(stlData[0].includes('solid'), 'ASCII STL should contain "solid" keyword');
        });
        
        test('Can execute JSCAD and serialize to OBJ', async () => {
            const filePath = path.join(fixturesPath, 'valid-cube.jscad');
            
            const geometries = await executeJscadFile(filePath, mockOutputChannel);
            
            const extensionRequire = getExtensionRequire();
            const modeling = extensionRequire('@jscad/modeling');
            const jscadGeometries = convertGeometries(geometries, modeling);
            
            const objSerializer = extensionRequire('@jscad/obj-serializer');
            const objData = objSerializer.serialize({ triangulate: true }, ...jscadGeometries);
            
            assert.ok(Array.isArray(objData), 'Should return array');
            assert.ok(objData.length > 0, 'Should return data');
            assert.ok(typeof objData[0] === 'string', 'OBJ should be string');
            assert.ok(objData[0].includes('v '), 'OBJ should contain vertex data');
            assert.ok(objData[0].includes('f '), 'OBJ should contain face data');
        });
        
        test('Can execute JSCAD and serialize to JSON', async () => {
            const filePath = path.join(fixturesPath, 'valid-cube.jscad');
            
            const geometries = await executeJscadFile(filePath, mockOutputChannel);
            
            const extensionRequire = getExtensionRequire();
            const modeling = extensionRequire('@jscad/modeling');
            const jscadGeometries = convertGeometries(geometries, modeling);
            
            const jsonSerializer = extensionRequire('@jscad/json-serializer');
            const jsonData = jsonSerializer.serialize({}, ...jscadGeometries);
            
            assert.ok(Array.isArray(jsonData), 'Should return array');
            assert.ok(jsonData.length > 0, 'Should return data');
            assert.ok(typeof jsonData[0] === 'string', 'JSON should be string');
            
            // Verify it's valid JSON
            assert.doesNotThrow(() => {
                JSON.parse(jsonData[0]);
            }, 'Should be valid JSON');
        });
        
        test('Can execute 2D JSCAD and serialize to SVG', async () => {
            const filePath = path.join(fixturesPath, 'valid-2d.jscad');
            
            const geometries = await executeJscadFile(filePath, mockOutputChannel);
            
            const extensionRequire = getExtensionRequire();
            const modeling = extensionRequire('@jscad/modeling');
            const jscadGeometries = convertGeometries(geometries, modeling);
            
            // Filter to only 2D geometries for SVG
            const geom2Objects = jscadGeometries.filter(g => 
                modeling.geometries.geom2.isA(g)
            );
            
            if (geom2Objects.length > 0) {
                const svgSerializer = extensionRequire('@jscad/svg-serializer');
                const svgData = svgSerializer.serialize({ unit: 'mm' }, ...geom2Objects);
                
                assert.ok(Array.isArray(svgData), 'Should return array');
                assert.ok(svgData.length > 0, 'Should return data');
                assert.ok(typeof svgData[0] === 'string', 'SVG should be string');
                assert.ok(svgData[0].includes('<svg'), 'SVG should contain svg tag');
            }
        });
        
        test('Can write exported file to disk', async () => {
            const filePath = path.join(fixturesPath, 'valid-cube.jscad');
            const outputPath = path.join(fixturesPath, 'test-export.stl');
            
            try {
                // Execute and serialize
                const geometries = await executeJscadFile(filePath, mockOutputChannel);
                
                const extensionRequire = getExtensionRequire();
                const modeling = extensionRequire('@jscad/modeling');
                const jscadGeometries = convertGeometries(geometries, modeling);
                
                const stlSerializer = extensionRequire('@jscad/stl-serializer');
                const stlData = stlSerializer.serialize({ binary: false }, ...jscadGeometries);
                
                // Write to file
                fs.writeFileSync(outputPath, stlData[0], 'utf8');
                
                // Verify file exists and has content
                assert.ok(fs.existsSync(outputPath), 'Output file should exist');
                const stats = fs.statSync(outputPath);
                assert.ok(stats.size > 0, 'Output file should have content');
                
                // Verify it's valid STL ASCII
                const content = fs.readFileSync(outputPath, 'utf8');
                assert.ok(content.includes('solid'), 'Should contain STL solid keyword');
                assert.ok(content.includes('endsolid'), 'Should contain STL endsolid keyword');
            } finally {
                // Clean up
                if (fs.existsSync(outputPath)) {
                    fs.unlinkSync(outputPath);
                }
            }
        });
    });
});
