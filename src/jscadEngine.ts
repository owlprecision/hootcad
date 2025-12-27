import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

// Import JSCAD modeling at module level to avoid repeated require() calls
const modeling = require('@jscad/modeling');
const { geom2, geom3, path2 } = modeling.geometries;

export interface JscadEntrypoint {
    filePath: string;
    source: 'package.json' | 'index.jscad' | 'active-editor';
}

/**
 * Resolves the JSCAD entrypoint using the following priority:
 * 1. Workspace package.json "main" field (if it's a .jscad file)
 * 2. Workspace index.jscad
 * 3. Active editor .jscad file
 * 4. Error if none found
 */
export function resolveJscadEntrypoint(): JscadEntrypoint | null {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    
    if (!workspaceFolders || workspaceFolders.length === 0) {
        // No workspace, try active editor
        return resolveFromActiveEditor();
    }

    const workspaceRoot = workspaceFolders[0].uri.fsPath;

    // 1. Check package.json main field
    const packageJsonPath = path.join(workspaceRoot, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
        try {
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
            if (packageJson.main && typeof packageJson.main === 'string') {
                const mainPath = path.resolve(workspaceRoot, packageJson.main);
                if (mainPath.endsWith('.jscad') && fs.existsSync(mainPath)) {
                    return {
                        filePath: mainPath,
                        source: 'package.json'
                    };
                }
            }
        } catch (error) {
            // Invalid package.json, continue to next option
        }
    }

    // 2. Check for index.jscad at workspace root
    const indexJscadPath = path.join(workspaceRoot, 'index.jscad');
    if (fs.existsSync(indexJscadPath)) {
        return {
            filePath: indexJscadPath,
            source: 'index.jscad'
        };
    }

    // 3. Fallback to active editor
    return resolveFromActiveEditor();
}

function resolveFromActiveEditor(): JscadEntrypoint | null {
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor && activeEditor.document.fileName.endsWith('.jscad')) {
        return {
            filePath: activeEditor.document.fileName,
            source: 'active-editor'
        };
    }
    return null;
}

export interface GeometryData {
    type: string;
    positions: number[][];
    indices?: number[];
    colors?: number[][];
    transforms?: number[];
}

/**
 * Executes a JSCAD file and returns the serialized geometry
 */
export async function executeJscadFile(filePath: string, outputChannel: vscode.OutputChannel): Promise<GeometryData[]> {
    try {
        outputChannel.appendLine(`Executing JSCAD file: ${filePath}`);

        // Clear require cache to ensure fresh execution
        const absolutePath = path.resolve(filePath);
        delete require.cache[absolutePath];

        // Dynamically require the JSCAD file
        const jscadModule = require(absolutePath);

        // Check if main function exists
        if (!jscadModule.main || typeof jscadModule.main !== 'function') {
            throw new Error('JSCAD file must export a main() function');
        }

        // Execute main with empty parameters
        const params = {};
        const result = jscadModule.main(params);

        outputChannel.appendLine('JSCAD main() executed successfully');

        // Serialize the geometry
        const geometryData = await serializeGeometry(result, outputChannel);
        
        return geometryData;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        outputChannel.appendLine(`Error executing JSCAD file: ${errorMessage}`);
        if (error instanceof Error && error.stack) {
            outputChannel.appendLine(error.stack);
        }
        throw error;
    }
}

/**
 * Serializes JSCAD geometry into a format suitable for the webview renderer
 */
async function serializeGeometry(geometry: any, outputChannel: vscode.OutputChannel): Promise<GeometryData[]> {
    outputChannel.appendLine(`Serializing geometry...`);

    // Ensure geometry is an array
    const geometries = Array.isArray(geometry) ? geometry : [geometry];
    
    const serializedData: GeometryData[] = [];

    for (const geom of geometries) {
        if (geom3.isA(geom)) {
            // 3D geometry
            const polygons = geom3.toPolygons(geom);
            const positions: number[][] = [];
            const indices: number[] = [];
            let vertexIndex = 0;

            for (const polygon of polygons) {
                const vertices = polygon.vertices;
                const baseIndex = vertexIndex;

                // Add vertices
                for (const vertex of vertices) {
                    positions.push([vertex[0], vertex[1], vertex[2]]);
                    vertexIndex++;
                }

                // Create triangle fan for polygon
                for (let i = 1; i < vertices.length - 1; i++) {
                    indices.push(baseIndex, baseIndex + i, baseIndex + i + 1);
                }
            }

            serializedData.push({
                type: 'geom3',
                positions,
                indices
            });
            outputChannel.appendLine(`Serialized 3D geometry: ${positions.length} vertices, ${indices.length / 3} triangles`);
        } else if (geom2.isA(geom)) {
            // 2D geometry
            const outlines = geom2.toOutlines(geom);
            const positions: number[][] = [];

            for (const outline of outlines) {
                for (const point of outline) {
                    positions.push([point[0], point[1], 0]); // Add z=0 for 2D
                }
            }

            serializedData.push({
                type: 'geom2',
                positions
            });
            outputChannel.appendLine(`Serialized 2D geometry: ${positions.length} points`);
        } else if (path2.isA(geom)) {
            // Path geometry
            const points = path2.toPoints(geom);
            const positions: number[][] = points.map((p: number[]) => [p[0], p[1], 0]);

            serializedData.push({
                type: 'path2',
                positions
            });
            outputChannel.appendLine(`Serialized path: ${positions.length} points`);
        } else {
            outputChannel.appendLine(`Warning: Unknown geometry type, skipping`);
        }
    }

    return serializedData;
}
