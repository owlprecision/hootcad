/**
 * Export Command Handler
 * 
 * Implements the HootCAD export workflow:
 * 1. Format selection (Quick Pick)
 * 2. Format-specific options (when required)
 * 3. Save location selection
 * 4. Export execution with progress feedback
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { createRequire } from 'module';
import { 
    ExportFormat, 
    ExportFormatOption,
    getFormatPickItems,
    getFormatByLabel
} from './exportFormatRegistry';
import { resolveJscadEntrypoint, executeJscadFile } from './jscadEngine';
import { ErrorReporter } from './errorReporter';
import { extractFilename } from './utilities';

/**
 * Execute the export command
 */
export async function executeExportCommand(
    errorReporter: ErrorReporter,
    outputChannel: vscode.OutputChannel
): Promise<void> {
    try {
        // Step 1: Resolve the JSCAD entrypoint
        const entrypoint = resolveJscadEntrypoint();
        if (!entrypoint) {
            vscode.window.showErrorMessage(
                'No JSCAD file found. Please open a .jscad file or configure a workspace with a JSCAD entry point.'
            );
            return;
        }

        errorReporter.logInfo(`Export from: ${entrypoint.filePath}`);

        // Step 2: Format selection
        const selectedFormat = await selectExportFormat();
        if (!selectedFormat) {
            return; // User cancelled
        }

        errorReporter.logInfo(`Selected format: ${selectedFormat.label}`);

        // Step 3: Collect format-specific options
        const options = await collectFormatOptions(selectedFormat);
        if (options === null) {
            return; // User cancelled
        }

        // Step 4: Select save location
        const savePath = await selectSaveLocation(entrypoint.filePath, selectedFormat);
        if (!savePath) {
            return; // User cancelled
        }

        errorReporter.logInfo(`Save to: ${savePath}`);

        // Step 5: Execute export
        await performExport(
            entrypoint.filePath,
            savePath,
            selectedFormat,
            options,
            errorReporter,
            outputChannel
        );

    } catch (error) {
        errorReporter.reportError(error, 'Export failed');
    }
}

/**
 * Step 1: Show format selection Quick Pick
 */
async function selectExportFormat(): Promise<ExportFormat | undefined> {
    const items = getFormatPickItems();
    
    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select export format',
        title: 'HootCAD Export',
        ignoreFocusOut: false
    });

    if (!selected) {
        return undefined;
    }

    return getFormatByLabel(selected.label);
}

/**
 * Step 2: Collect format-specific options
 */
async function collectFormatOptions(
    format: ExportFormat
): Promise<Record<string, any> | null> {
    const optionValues: Record<string, any> = {};

    // If no options are defined, return empty object
    if (!format.options || format.options.length === 0) {
        return optionValues;
    }

    // Collect each option
    for (const option of format.options) {
        const value = await collectSingleOption(format, option);
        if (value === null) {
            return null; // User cancelled
        }
        optionValues[option.name] = value;
    }

    return optionValues;
}

/**
 * Collect a single option value from the user
 */
async function collectSingleOption(
    format: ExportFormat,
    option: ExportFormatOption
): Promise<any | null> {
    switch (option.type) {
        case 'boolean':
            return await collectBooleanOption(format, option);
        case 'choice':
            return await collectChoiceOption(format, option);
        case 'string':
            return await collectStringOption(format, option);
        default:
            return option.default;
    }
}

/**
 * Collect boolean option using Quick Pick
 */
async function collectBooleanOption(
    format: ExportFormat,
    option: ExportFormatOption
): Promise<boolean | null> {
    const items: vscode.QuickPickItem[] = [
        {
            label: 'Yes',
            description: 'Enable this option',
            picked: option.default === true
        },
        {
            label: 'No',
            description: 'Disable this option',
            picked: option.default === false
        }
    ];

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: option.description,
        title: `${format.label} - ${option.name}`,
        ignoreFocusOut: false
    });

    if (!selected) {
        return null;
    }

    return selected.label === 'Yes';
}

/**
 * Collect choice option using Quick Pick
 */
async function collectChoiceOption(
    format: ExportFormat,
    option: ExportFormatOption
): Promise<any | null> {
    if (!option.choices || option.choices.length === 0) {
        return option.default;
    }

    const items: vscode.QuickPickItem[] = option.choices.map(choice => ({
        label: choice.label,
        picked: choice.value === option.default
    }));

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: option.description,
        title: `${format.label} - ${option.name}`,
        ignoreFocusOut: false
    });

    if (!selected) {
        return null;
    }

    // Find the value for the selected label
    const choice = option.choices.find(c => c.label === selected.label);
    return choice ? choice.value : option.default;
}

/**
 * Collect string option using Input Box
 */
async function collectStringOption(
    format: ExportFormat,
    option: ExportFormatOption
): Promise<string | null> {
    const value = await vscode.window.showInputBox({
        prompt: option.description,
        placeHolder: option.default?.toString() || '',
        value: option.default?.toString() || '',
        title: `${format.label} - ${option.name}`,
        ignoreFocusOut: false
    });

    return value || null;
}

/**
 * Step 3: Select save location
 */
async function selectSaveLocation(
    sourceFilePath: string,
    format: ExportFormat
): Promise<string | undefined> {
    // Derive default filename from source file
    const sourceFilename = extractFilename(sourceFilePath);
    const baseName = sourceFilename.replace(/\.jscad$/, '');
    const defaultFilename = `${baseName}.${format.extension}`;

    // Get workspace root or source file directory
    const defaultUri = vscode.workspace.workspaceFolders?.[0]?.uri || 
                       vscode.Uri.file(path.dirname(sourceFilePath));

    const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.joinPath(defaultUri, defaultFilename),
        filters: {
            [format.label]: [format.extension]
        },
        title: `Export as ${format.label}`,
        saveLabel: 'Export'
    });

    return uri?.fsPath;
}

/**
 * Step 4: Perform the actual export
 */
async function performExport(
    sourceFilePath: string,
    targetFilePath: string,
    format: ExportFormat,
    options: Record<string, any>,
    errorReporter: ErrorReporter,
    outputChannel: vscode.OutputChannel
): Promise<void> {
    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: `Exporting to ${format.label}...`,
            cancellable: false
        },
        async (progress) => {
            try {
                let lastProgressValue = 0;
                
                progress.report({ increment: 0, message: 'Loading JSCAD file...' });

                // Execute the JSCAD file to get geometries
                const geometries = await executeJscadFile(sourceFilePath, outputChannel);
                
                if (!geometries || geometries.length === 0) {
                    throw new Error('No geometries generated from JSCAD file');
                }

                lastProgressValue = 30;
                progress.report({ increment: 30, message: 'Serializing...' });

                // Dynamically load the serializer using the same pattern as jscadEngine.ts
                const extensionRequire = createRequire(path.join(__dirname, '..', 'package.json'));
                let serializer: any;
                try {
                    serializer = extensionRequire(format.serializerPackage);
                } catch (loadError) {
                    throw new Error(
                        `Cannot load export serializer '${format.serializerPackage}'. ` +
                        `If you're developing locally, run 'npm install' in the extension folder. ` +
                        `If this is an installed VSIX/Marketplace extension, it may be missing bundled dependencies.`,
                        { cause: loadError }
                    );
                }

                // Convert serialized geometries back to JSCAD modeling objects
                const modeling = extensionRequire('@jscad/modeling');
                const jscadGeometries = convertToJscadGeometries(geometries, modeling);

                // Prepare serializer options with status callback
                const serializerOptions = {
                    ...options,
                    statusCallback: (status: { progress: number }) => {
                        // Map serializer progress (0-100) to our remaining progress (30-90)
                        const targetProgress = 30 + (status.progress / 100) * 60;
                        const increment = targetProgress - lastProgressValue;
                        if (increment > 0) {
                            lastProgressValue = targetProgress;
                            progress.report({ 
                                increment, 
                                message: `Serializing... ${status.progress}%` 
                            });
                        }
                    }
                };

                // Serialize
                const data = serializer.serialize(serializerOptions, ...jscadGeometries);

                // Report remaining progress to 90%
                const remaining = 90 - lastProgressValue;
                if (remaining > 0) {
                    progress.report({ increment: remaining, message: 'Writing file...' });
                    lastProgressValue = 90;
                }

                // Write to file
                if (Array.isArray(data) && data.length > 0) {
                    // Most serializers return an array with one element
                    const content = data[0];
                    
                    if (typeof content === 'string') {
                        // Text format (STL ASCII, OBJ, SVG, DXF, JSON, X3D)
                        fs.writeFileSync(targetFilePath, content, 'utf8');
                    } else if (content instanceof ArrayBuffer) {
                        // Binary formats often return ArrayBuffer
                        fs.writeFileSync(targetFilePath, Buffer.from(content));
                    } else if (content instanceof Uint8Array || Buffer.isBuffer(content)) {
                        // Binary format (STL binary)
                        fs.writeFileSync(targetFilePath, content);
                    } else {
                        throw new Error('Unexpected serializer output format');
                    }
                } else {
                    throw new Error('Serializer returned empty result');
                }

                progress.report({ increment: 10, message: 'Complete!' });

                // Show success message
                const filename = extractFilename(targetFilePath);
                vscode.window.showInformationMessage(
                    `Successfully exported to ${filename}`,
                    'Open File'
                ).then(selection => {
                    if (selection === 'Open File') {
                        vscode.commands.executeCommand('vscode.open', vscode.Uri.file(targetFilePath));
                    }
                });

                errorReporter.logInfo(`Export complete: ${targetFilePath}`);

            } catch (error) {
                errorReporter.reportError(error, `Export to ${format.label} failed`);
                throw error;
            }
        }
    );
}

/**
 * Serialized geometry from JSCAD execution
 */
interface SerializedGeometry {
    type: 'geom3' | 'geom2' | 'unknown';
    polygons?: any[];
    sides?: any[];
    transforms?: any;
    color?: any;
    data?: any;
}

/**
 * Convert serialized geometries back to JSCAD modeling objects
 */
function convertToJscadGeometries(serializedGeometries: SerializedGeometry[], modeling: any): any[] {
    return serializedGeometries.map(serialized => {
        if (serialized.type === 'geom3' && serialized.polygons) {
            // Reconstruct geom3 from serialized data
            return modeling.geometries.geom3.create(serialized.polygons);
        } else if (serialized.type === 'geom2' && serialized.sides) {
            // Reconstruct geom2 from serialized data
            return modeling.geometries.geom2.create(serialized.sides);
        } else {
            // Unknown type - return as-is and let serializer handle it
            return serialized;
        }
    });
}
