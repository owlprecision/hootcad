import * as assert from 'assert';
import { 
    EXPORT_FORMATS, 
    getFormatById, 
    getFormatPickItems,
    getFormatByLabel 
} from '../exportFormatRegistry';

suite('Export Format Registry Test Suite', () => {
    
    test('All formats should have required fields', () => {
        EXPORT_FORMATS.forEach(format => {
            assert.ok(format.id, `Format should have ID: ${JSON.stringify(format)}`);
            assert.ok(format.label, `Format ${format.id} should have label`);
            assert.ok(format.extension, `Format ${format.id} should have extension`);
            assert.ok(format.serializerPackage, `Format ${format.id} should have serializer package`);
            assert.ok(format.mimeType, `Format ${format.id} should have MIME type`);
            assert.ok(Array.isArray(format.geometryTypes), `Format ${format.id} should have geometry types`);
            assert.ok(format.geometryTypes.length > 0, `Format ${format.id} should support at least one geometry type`);
        });
    });

    test('All formats should have JSCAD serializer packages', () => {
        EXPORT_FORMATS.forEach(format => {
            assert.ok(
                format.serializerPackage.startsWith('@jscad/'),
                `Format ${format.id} should use JSCAD serializer package`
            );
        });
    });

    test('Format options should be well-formed', () => {
        EXPORT_FORMATS.forEach(format => {
            if (format.options && format.options.length > 0) {
                format.options.forEach(option => {
                    assert.ok(option.name, `Option should have name in format ${format.id}`);
                    assert.ok(option.type, `Option should have type in format ${format.id}`);
                    assert.ok(option.description, `Option should have description in format ${format.id}`);
                    
                    if (option.type === 'choice') {
                        assert.ok(
                            option.choices && option.choices.length > 0,
                            `Choice option ${option.name} in format ${format.id} should have choices`
                        );
                        option.choices?.forEach(choice => {
                            assert.ok(choice.label, `Choice should have label`);
                            assert.ok(choice.value !== undefined, `Choice should have value`);
                        });
                    }
                });
            }
        });
    });

    test('STL format should be present with binary option', () => {
        const stl = getFormatById('stl');
        assert.ok(stl, 'STL format should exist');
        assert.strictEqual(stl?.extension, 'stl');
        assert.strictEqual(stl?.serializerPackage, '@jscad/stl-serializer');
        assert.ok(stl?.geometryTypes.includes('3D'));
        
        // STL should have binary option
        const binaryOption = stl?.options?.find(opt => opt.name === 'binary');
        assert.ok(binaryOption, 'STL should have binary option');
        assert.strictEqual(binaryOption?.type, 'boolean');
        assert.strictEqual(binaryOption?.default, true);
    });

    test('OBJ format should be present with triangulate option', () => {
        const obj = getFormatById('obj');
        assert.ok(obj, 'OBJ format should exist');
        assert.strictEqual(obj?.extension, 'obj');
        assert.strictEqual(obj?.serializerPackage, '@jscad/obj-serializer');
        assert.ok(obj?.geometryTypes.includes('3D'));
        
        // OBJ should have triangulate option
        const triangulateOption = obj?.options?.find(opt => opt.name === 'triangulate');
        assert.ok(triangulateOption, 'OBJ should have triangulate option');
        assert.strictEqual(triangulateOption?.type, 'boolean');
    });

    test('AMF format should be present with unit option', () => {
        const amf = getFormatById('amf');
        assert.ok(amf, 'AMF format should exist');
        assert.strictEqual(amf?.extension, 'amf');
        assert.strictEqual(amf?.serializerPackage, '@jscad/amf-serializer');
        assert.ok(amf?.geometryTypes.includes('3D'));
        
        // AMF should have unit option
        const unitOption = amf?.options?.find(opt => opt.name === 'unit');
        assert.ok(unitOption, 'AMF should have unit option');
        assert.strictEqual(unitOption?.type, 'choice');
        assert.ok(unitOption?.choices && unitOption.choices.length > 0);
    });

    test('SVG format should be present with unit option for 2D', () => {
        const svg = getFormatById('svg');
        assert.ok(svg, 'SVG format should exist');
        assert.strictEqual(svg?.extension, 'svg');
        assert.strictEqual(svg?.serializerPackage, '@jscad/svg-serializer');
        assert.ok(svg?.geometryTypes.includes('2D'));
        
        // SVG should have unit option
        const unitOption = svg?.options?.find(opt => opt.name === 'unit');
        assert.ok(unitOption, 'SVG should have unit option');
        assert.strictEqual(unitOption?.type, 'choice');
    });

    test('DXF format should be present', () => {
        const dxf = getFormatById('dxf');
        assert.ok(dxf, 'DXF format should exist');
        assert.strictEqual(dxf?.extension, 'dxf');
        assert.strictEqual(dxf?.serializerPackage, '@jscad/dxf-serializer');
        assert.ok(dxf?.geometryTypes.includes('2D'));
        assert.ok(dxf?.geometryTypes.includes('3D'));
    });

    test('JSON format should be present', () => {
        const json = getFormatById('json');
        assert.ok(json, 'JSON format should exist');
        assert.strictEqual(json?.extension, 'json');
        assert.strictEqual(json?.serializerPackage, '@jscad/json-serializer');
        assert.ok(json?.geometryTypes.includes('2D'));
        assert.ok(json?.geometryTypes.includes('3D'));
    });

    test('X3D format should be present', () => {
        const x3d = getFormatById('x3d');
        assert.ok(x3d, 'X3D format should exist');
        assert.strictEqual(x3d?.extension, 'x3d');
        assert.strictEqual(x3d?.serializerPackage, '@jscad/x3d-serializer');
        assert.ok(x3d?.geometryTypes.includes('3D'));
    });

    test('getFormatPickItems should return all formats', () => {
        const items = getFormatPickItems();
        assert.strictEqual(items.length, EXPORT_FORMATS.length);
        
        items.forEach(item => {
            assert.ok(item.label);
            assert.ok(item.description);
        });
    });

    test('getFormatByLabel should find formats correctly', () => {
        EXPORT_FORMATS.forEach(format => {
            const found = getFormatByLabel(format.label);
            assert.ok(found, `Should find format by label: ${format.label}`);
            assert.strictEqual(found?.id, format.id);
        });
    });

    test('getFormatByLabel should return undefined for non-existent label', () => {
        const found = getFormatByLabel('Non Existent Format');
        assert.strictEqual(found, undefined);
    });

    test('getFormatById should return undefined for non-existent ID', () => {
        const found = getFormatById('non-existent-format');
        assert.strictEqual(found, undefined);
    });

    test('All 3D formats should only support 3D geometry', () => {
        const formats3D = EXPORT_FORMATS.filter(f => 
            f.geometryTypes.includes('3D') && !f.geometryTypes.includes('2D')
        );
        
        formats3D.forEach(format => {
            assert.strictEqual(format.geometryTypes.length, 1);
            assert.strictEqual(format.geometryTypes[0], '3D');
        });
    });

    test('All 2D formats should include 2D geometry', () => {
        const formats2D = EXPORT_FORMATS.filter(f => f.geometryTypes.includes('2D'));
        
        formats2D.forEach(format => {
            assert.ok(format.geometryTypes.includes('2D'));
        });
    });

    test('Format IDs should be unique', () => {
        const ids = EXPORT_FORMATS.map(f => f.id);
        const uniqueIds = new Set(ids);
        assert.strictEqual(ids.length, uniqueIds.size, 'All format IDs should be unique');
    });

    test('Format labels should be unique', () => {
        const labels = EXPORT_FORMATS.map(f => f.label);
        const uniqueLabels = new Set(labels);
        assert.strictEqual(labels.length, uniqueLabels.size, 'All format labels should be unique');
    });

    test('Format extensions should be lowercase', () => {
        EXPORT_FORMATS.forEach(format => {
            assert.strictEqual(
                format.extension,
                format.extension.toLowerCase(),
                `Format ${format.id} extension should be lowercase`
            );
        });
    });

    test('Serializer packages should be valid npm package names', () => {
        EXPORT_FORMATS.forEach(format => {
            // Valid npm package name pattern
            const validPattern = /^@[a-z0-9-]+\/[a-z0-9-]+$/;
            assert.ok(
                validPattern.test(format.serializerPackage),
                `Format ${format.id} has invalid serializer package name: ${format.serializerPackage}`
            );
        });
    });
});
