/**
 * Export Format Registry
 * 
 * Defines available export formats based on JSCAD serializer capabilities.
 * Each format is backed by an actual JSCAD serializer package and includes
 * only the options that are documented and supported by that serializer.
 */

import * as vscode from 'vscode';

export interface ExportFormatOption {
    name: string;
    type: 'boolean' | 'string' | 'choice';
    description: string;
    default?: any;
    choices?: Array<{ label: string; value: any }>;
}

export interface ExportFormat {
    /** Format identifier (e.g., 'stl', 'obj') */
    id: string;
    
    /** Display name for the format */
    label: string;
    
    /** File extension (without dot) */
    extension: string;
    
    /** NPM package name of the JSCAD serializer */
    serializerPackage: string;
    
    /** MIME type for the format */
    mimeType: string;
    
    /** Supported geometry types (2D, 3D, or both) */
    geometryTypes: Array<'2D' | '3D'>;
    
    /** Format-specific options (only when required by the serializer) */
    options?: ExportFormatOption[];
    
    /** Description shown to the user */
    description?: string;
}

/**
 * Registry of all supported export formats.
 * This list is derived from inspecting the actual JSCAD serializer packages.
 */
export const EXPORT_FORMATS: ExportFormat[] = [
    {
        id: 'stl',
        label: 'STL - Stereolithography',
        extension: 'stl',
        serializerPackage: '@jscad/stl-serializer',
        mimeType: 'application/sla',
        geometryTypes: ['3D'],
        description: 'Common format for 3D printing (3D geometries only)',
        options: [
            {
                name: 'binary',
                type: 'boolean',
                description: 'Use binary STL format (smaller file size)',
                default: true
            }
        ]
    },
    {
        id: 'obj',
        label: 'OBJ - Wavefront Object',
        extension: 'obj',
        serializerPackage: '@jscad/obj-serializer',
        mimeType: 'application/object',
        geometryTypes: ['3D'],
        description: 'Common 3D mesh format (3D geometries only)',
        options: [
            {
                name: 'triangulate',
                type: 'boolean',
                description: 'Convert all faces to triangles',
                default: true
            }
        ]
    },
    {
        id: 'amf',
        label: 'AMF - Additive Manufacturing Format',
        extension: 'amf',
        serializerPackage: '@jscad/amf-serializer',
        mimeType: 'application/amf+xml',
        geometryTypes: ['3D'],
        description: 'Advanced format for 3D printing (3D geometries only)',
        options: [
            {
                name: 'unit',
                type: 'choice',
                description: 'Unit of measurement',
                default: 'millimeter',
                choices: [
                    { label: 'Millimeter', value: 'millimeter' },
                    { label: 'Inch', value: 'inch' },
                    { label: 'Feet', value: 'feet' },
                    { label: 'Meter', value: 'meter' },
                    { label: 'Micrometer', value: 'micrometer' }
                ]
            }
        ]
    },
    {
        id: 'dxf',
        label: 'DXF - Drawing Exchange Format',
        extension: 'dxf',
        serializerPackage: '@jscad/dxf-serializer',
        mimeType: 'application/dxf',
        geometryTypes: ['2D', '3D'],
        description: 'CAD interchange format (supports 2D and 3D)',
        // DXF has complex options (geom2To, geom3To, pathTo), but defaults work well
        // Omit options in v1 to keep the UX simple
        options: []
    },
    {
        id: 'svg',
        label: 'SVG - Scalable Vector Graphics',
        extension: 'svg',
        serializerPackage: '@jscad/svg-serializer',
        mimeType: 'image/svg+xml',
        geometryTypes: ['2D'],
        description: 'Vector graphics format (2D geometries only)',
        options: [
            {
                name: 'unit',
                type: 'choice',
                description: 'Unit of measurement',
                default: 'mm',
                choices: [
                    { label: 'Millimeters (mm)', value: 'mm' },
                    { label: 'Centimeters (cm)', value: 'cm' },
                    { label: 'Inches (in)', value: 'in' },
                    { label: 'Pixels (px)', value: 'px' },
                    { label: 'Points (pt)', value: 'pt' },
                    { label: 'Picas (pc)', value: 'pc' },
                    { label: 'Em units (em)', value: 'em' },
                    { label: 'Ex units (ex)', value: 'ex' }
                ]
            }
        ]
    },
    {
        id: 'json',
        label: 'JSON - JSCAD Geometry',
        extension: 'json',
        serializerPackage: '@jscad/json-serializer',
        mimeType: 'application/json',
        geometryTypes: ['2D', '3D'],
        description: 'JSCAD native geometry format (supports all geometry types)',
        // JSON serializer has no required options
        options: []
    },
    {
        id: 'x3d',
        label: 'X3D - Extensible 3D',
        extension: 'x3d',
        serializerPackage: '@jscad/x3d-serializer',
        mimeType: 'model/x3d+xml',
        geometryTypes: ['3D'],
        description: 'ISO standard for 3D graphics (3D geometries only)',
        // X3D serializer has no required options in the package
        options: []
    }
];

/**
 * Get format by ID
 */
export function getFormatById(id: string): ExportFormat | undefined {
    return EXPORT_FORMATS.find(format => format.id === id);
}

/**
 * Get all format labels for Quick Pick
 */
export function getFormatPickItems(): vscode.QuickPickItem[] {
    return EXPORT_FORMATS.map(format => ({
        label: format.label,
        description: format.extension.toUpperCase(),
        detail: format.description,
        // Store the format ID in the picked item
        alwaysShow: false,
        picked: false
    }));
}

/**
 * Find format by Quick Pick label
 */
export function getFormatByLabel(label: string): ExportFormat | undefined {
    return EXPORT_FORMATS.find(format => format.label === label);
}
