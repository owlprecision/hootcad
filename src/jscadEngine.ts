import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { createRequire } from 'module';

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

/**
 * Executes a JSCAD file and returns renderer-ready entities
 */
export async function executeJscadFile(filePath: string, outputChannel: vscode.OutputChannel): Promise<any[]> {
    // Use eval to get the real Node.js require (bypasses webpack)
    const nodeRequire = eval('require');
    
    // Create a require function from the extension's context so it can find @jscad modules
    const extensionRequire = createRequire(path.join(__dirname, '..', 'package.json'));
    
    try {
        outputChannel.appendLine(`Executing JSCAD file: ${filePath}`);

        // Read the file content
        const fileContent = fs.readFileSync(filePath, 'utf8');
        
        // Create a custom require that tries both the file's directory and extension's node_modules
        const customRequire = (moduleName: string) => {
            try {
                // First try to require from the file's directory
                return nodeRequire(moduleName);
            } catch (e) {
                // Fallback to extension's node_modules
                return extensionRequire(moduleName);
            }
        };
        
        // Execute the JSCAD file in a custom context
        const module = { exports: {} };
        const wrapper = new Function('require', 'module', 'exports', '__filename', '__dirname', fileContent);
        wrapper(customRequire, module, module.exports, filePath, path.dirname(filePath));
        
        const jscadModule = module.exports as any;

        // Check if main function exists
        if (!jscadModule.main || typeof jscadModule.main !== 'function') {
            throw new Error('JSCAD file must export a main() function');
        }

        // Execute main with empty parameters
        const params = {};
        const result = jscadModule.main(params);

        outputChannel.appendLine('JSCAD main() executed successfully');

        // Ensure result is an array
        const geometries = Array.isArray(result) ? result : [result];
        
        // Import entitiesFromSolids at runtime using native require
        const { entitiesFromSolids } = extensionRequire('@jscad/regl-renderer');
        
        // Log what the geometries look like
        outputChannel.appendLine(`Raw geometries (${geometries.length}):`);
        geometries.forEach((geom: any, i: number) => {
            outputChannel.appendLine(`  [${i}] type: ${typeof geom}, keys: ${Object.keys(geom).join(', ')}`);
            if (geom.polygons) outputChannel.appendLine(`      polygons: ${geom.polygons.length}`);
            if (geom.sides) outputChannel.appendLine(`      sides: ${geom.sides}`);
        });
        
        // Convert geometries to renderer entities
        // This handles geometry type detection (2D vs 3D) and assigns proper draw commands
        const entities = entitiesFromSolids({}, ...geometries);
        
        outputChannel.appendLine(`Converted ${geometries.length} geometry object(s) to ${entities.length} render entit${entities.length === 1 ? 'y' : 'ies'}`);
        
        // Log what the entities look like
        entities.forEach((entity: any, i: number) => {
            outputChannel.appendLine(`  Entity[${i}]: geometry.type=${entity.geometry?.type}, positions=${entity.geometry?.positions?.length || 'none'}, normals=${entity.geometry?.normals?.length || 'none'}, indices=${entity.geometry?.indices?.length || 'none'}`);
            if (entity.geometry?.positions) {
                outputChannel.appendLine(`    First 12 positions: ${Array.from(entity.geometry.positions.slice(0, 12)).join(', ')}`);
            }
            if (entity.geometry?.indices) {
                outputChannel.appendLine(`    All indices: ${Array.from(entity.geometry.indices).join(', ')}`);
            }
        });
        
        // Serialize entities for webview (convert typed arrays to regular arrays)
        const serializedEntities = entities.map((entity: any) => {
            const serialized: any = {
                visuals: entity.visuals,
                geometry: {
                    type: entity.geometry.type,
                    isTransparent: entity.geometry.isTransparent
                }
            };
            
            // Convert typed arrays to regular arrays for JSON serialization
            if (entity.geometry.positions) {
                serialized.geometry.positions = Array.from(entity.geometry.positions);
            }
            if (entity.geometry.normals) {
                serialized.geometry.normals = Array.from(entity.geometry.normals);
            }
            if (entity.geometry.indices) {
                serialized.geometry.indices = Array.from(entity.geometry.indices);
            }
            if (entity.geometry.colors) {
                serialized.geometry.colors = Array.from(entity.geometry.colors);
            }
            if (entity.geometry.transforms) {
                serialized.geometry.transforms = Array.from(entity.geometry.transforms);
            }
            if (entity.geometry.points) {
                serialized.geometry.points = Array.from(entity.geometry.points);
            }
            
            return serialized;
        });
        
        return serializedEntities;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        outputChannel.appendLine(`Error executing JSCAD file: ${errorMessage}`);
        if (error instanceof Error && error.stack) {
            outputChannel.appendLine(error.stack);
        }
        throw error;
    }
}
