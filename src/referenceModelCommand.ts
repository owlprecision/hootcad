/**
 * Reference Model Command Handler
 *
 * Implements the reference-geometry workflow (filed in the HootCAD background
 * project's ROADMAP as "Reference geometry"): pick an existing glTF model
 * file, read its bytes in the extension host, and hand them to the preview
 * webview, which adds the model to the Photonic scene alongside the designed
 * part. The model is reference only — it never enters the JSCAD model, its
 * parameters, or its exports.
 */

import * as vscode from 'vscode';
import { WebviewManager } from './webviewManager';
import { ErrorReporter } from './errorReporter';
import { extractFilename } from './utilities';

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
			filters: { 'glTF Model': ['glb', 'gltf'] },
			title: 'HootCAD: Load Reference Model',
			openLabel: 'Load as Reference'
		});
		if (!picked || picked.length === 0) {
			return; // User cancelled
		}

		const fileUri = picked[0];
		const bytes = await vscode.workspace.fs.readFile(fileUri);
		errorReporter.logInfo(`Loading reference model: ${fileUri.fsPath} (${bytes.length} bytes)`);
		webviewManager.sendReferenceModel(extractFilename(fileUri.fsPath), bytes);
	} catch (error) {
		errorReporter.reportError(error, 'Load reference model failed');
	}
}
