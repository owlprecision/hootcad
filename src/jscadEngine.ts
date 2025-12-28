import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

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

        // Ensure result is an array
        const geometries = Array.isArray(result) ? result : [result];
        
        // Import entitiesFromSolids at runtime to avoid webpack bundling issues
        const { entitiesFromSolids } = require('@jscad/regl-renderer');
        
        // Convert geometries to renderer entities
        // This handles geometry type detection (2D vs 3D) and assigns proper draw commands
        const entities = entitiesFromSolids({}, ...geometries);
        
        outputChannel.appendLine(`Converted ${geometries.length} geometry object(s) to ${entities.length} render entit${entities.length === 1 ? 'y' : 'ies'}`);
        
        return entities;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        outputChannel.appendLine(`Error executing JSCAD file: ${errorMessage}`);
        if (error instanceof Error && error.stack) {
            outputChannel.appendLine(error.stack);
        }
        throw error;
    }
}
