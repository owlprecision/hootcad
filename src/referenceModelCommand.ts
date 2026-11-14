/**
 * Reference Model Command Handler
 *
 * Implements the reference-geometry workflow (filed in the HootCAD background
 * project's ROADMAP as "Reference geometry"): pick an existing model file —
 * glTF, STL, or OBJ, the formats Photonic's scene.loadModel speaks — read
 * its bytes in the extension host, and hand them to the preview webview,
 * which adds the model to the Photonic scene alongside the designed part.
 * The model is reference only — it never enters the JSCAD model, its
 * parameters, or its exports.
 *
 * An OBJ file's material file travels with it: when the material file its
 * mtllib line names sits in the same folder — or a same-named .mtl sits
 * there instead — its bytes ride along so the webview can supply them
 * through Photonic's mtlData option. When no material file is found, the
 * OBJ still loads, without materials, and the hand-off to the preview
 * says so.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { WebviewManager } from './webviewManager';
import { ErrorReporter } from './errorReporter';
import { extractFilename } from './utilities';

/** The load format Photonic names for a picked model file */
export type ReferenceModelFormat = 'glb' | 'gltf' | 'stl' | 'obj';

/**
 * The load format for a picked file, from its extension
 */
export function referenceModelFormatForFile(fileName: string): ReferenceModelFormat | undefined {
	switch (fileName.split('.').pop()?.toLowerCase()) {
		case 'glb':
			return 'glb';
		case 'gltf':
			return 'gltf';
		case 'stl':
			return 'stl';
		case 'obj':
			return 'obj';
		default:
			return undefined;
	}
}

/**
 * The material file names an OBJ text declares on its mtllib lines
 */
export function parseMtlLibNames(objText: string): string[] {
	const names: string[] = [];
	for (const line of objText.split(/\r?\n/)) {
		const match = /^\s*mtllib\s+(.+?)\s*$/.exec(line);
		if (match) {
			for (const name of match[1].split(/\s+/)) {
				if (name && !names.includes(name)) {
					names.push(name);
				}
			}
		}
	}
	return names;
}

/** A material file found beside the picked OBJ */
export interface ObjMaterialCompanion {
	name: string;
	data: Uint8Array;
}

/**
 * Find the material file that travels with a picked OBJ: the file its
 * mtllib line names, resolved in the OBJ's own folder, or the same-named
 * .mtl in that folder when the named file is not there. Returns the names
 * the OBJ declared either way, so a miss can be reported honestly.
 */
export async function findObjMaterialCompanion(
	objUri: vscode.Uri,
	objBytes: Uint8Array
): Promise<{ declared: string[]; companion?: ObjMaterialCompanion }> {
	const declared = parseMtlLibNames(new TextDecoder().decode(objBytes));
	const folderUri = vscode.Uri.file(path.dirname(objUri.fsPath));

	const candidates = [...declared];
	const sameBasename = extractFilename(objUri.fsPath).replace(/\.[^.]*$/, '.mtl');
	if (!candidates.includes(sameBasename)) {
		candidates.push(sameBasename);
	}

	for (const candidate of candidates) {
		// mtllib names are folder-relative and may use either separator
		const relative = candidate.replace(/\\/g, '/');
		try {
			const data = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(folderUri, relative));
			return { declared, companion: { name: extractFilename(relative), data } };
		} catch {
			// Not in the folder under this name; try the next candidate
		}
	}
	return { declared };
}

/**
 * Execute the Load Reference Model command
 */
export async function executeLoadReferenceModelCommand(
	webviewManager: WebviewManager,
	errorReporter: ErrorReporter
): Promise<void> {
	try {
		// The preview is where the model lands; open it the way the Open
		// Preview command does when it is not already open.
		if (!webviewManager.isPanelOpen()) {
			await webviewManager.createOrShowPreview();
			if (!webviewManager.isPanelOpen()) {
				return; // createOrShowPreview already reported why not
			}
		}

		const picked = await vscode.window.showOpenDialog({
			canSelectFiles: true,
			canSelectFolders: false,
			canSelectMany: false,
			filters: { '3D Model': ['glb', 'gltf', 'stl', 'obj'] },
			title: 'HootCAD: Load Reference Model',
			openLabel: 'Load as Reference'
		});
		if (!picked || picked.length === 0) {
			return; // User cancelled
		}

		const fileUri = picked[0];
		const bytes = await vscode.workspace.fs.readFile(fileUri);
		errorReporter.logInfo(`Loading reference model: ${fileUri.fsPath} (${bytes.length} bytes)`);

		// An OBJ's material file travels with it when one can be found in
		// the same folder; without one the model still loads, and the
		// preview is told the materials are missing.
		let mtlData: Uint8Array | undefined;
		let mtlName: string | undefined;
		let missingMaterial: string | undefined;
		if (referenceModelFormatForFile(fileUri.fsPath) === 'obj') {
			const lookup = await findObjMaterialCompanion(fileUri, bytes);
			if (lookup.companion) {
				mtlData = lookup.companion.data;
				mtlName = lookup.companion.name;
				errorReporter.logInfo(`Reference model materials: ${mtlName}`);
			} else if (lookup.declared.length > 0) {
				missingMaterial = lookup.declared[0];
				errorReporter.logInfo(
					`Reference model material file not found beside the OBJ: ${missingMaterial} (loading without materials)`
				);
			}
		}

		webviewManager.sendReferenceModel(extractFilename(fileUri.fsPath), bytes, {
			format: referenceModelFormatForFile(fileUri.fsPath),
			mtlData,
			mtlName,
			missingMaterial
		});
	} catch (error) {
		errorReporter.reportError(error, 'Load reference model failed');
	}
}
