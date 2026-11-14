import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { WebviewManager } from '../webviewManager';
import { WebviewContentProvider } from '../webviewContentProvider';
import { ErrorReporter } from '../errorReporter';
import { ParameterCache } from '../parameterCache';
import {
	referenceModelFormatForFile,
	parseMtlLibNames,
	findObjMaterialCompanion
} from '../referenceModelCommand';

suite('Reference Model Test Suite', () => {
	let extensionPath: string;

	suiteSetup(async () => {
		const ext = vscode.extensions.getExtension('owlprecision.hootcad');
		assert.ok(ext, 'Extension should be available');
		if (!ext.isActive) {
			await ext.activate();
		}
		extensionPath = ext.extensionPath;
	});

	test('Load Reference Model command should be registered', async () => {
		const commands = await vscode.commands.getCommands(true);
		assert.ok(
			commands.includes('hootcad.loadReferenceModel'),
			'Load Reference Model command should be registered'
		);
	});

	test('Clear Reference Model command should be registered', async () => {
		const commands = await vscode.commands.getCommands(true);
		assert.ok(
			commands.includes('hootcad.clearReferenceModel'),
			'Clear Reference Model command should be registered'
		);
	});

	test('Manifest should contribute the reference model commands and activation events', () => {
		const ext = vscode.extensions.getExtension('owlprecision.hootcad');
		assert.ok(ext, 'Extension should be available');

		const contributed = (ext.packageJSON.contributes.commands as Array<{ command: string }>).map(c => c.command);
		assert.ok(contributed.includes('hootcad.loadReferenceModel'), 'Manifest should contribute hootcad.loadReferenceModel');
		assert.ok(contributed.includes('hootcad.clearReferenceModel'), 'Manifest should contribute hootcad.clearReferenceModel');

		const activationEvents = ext.packageJSON.activationEvents as string[];
		assert.ok(
			activationEvents.includes('onCommand:hootcad.loadReferenceModel'),
			'Manifest should activate on hootcad.loadReferenceModel'
		);
		assert.ok(
			activationEvents.includes('onCommand:hootcad.clearReferenceModel'),
			'Manifest should activate on hootcad.clearReferenceModel'
		);
	});

	test('Clear Reference Model command should run safely when no preview is open', async () => {
		// The command only talks to the preview panel; with nothing to clear
		// it must complete without throwing.
		await vscode.commands.executeCommand('hootcad.clearReferenceModel');
	});

	test('WebviewManager should accept and clear a reference model with no panel open', () => {
		const manager = createWebviewManager();
		assert.strictEqual(manager.isPanelOpen(), false, 'No panel should be open');
		// Both calls are no-ops without a panel and must not throw: the load
		// command guarantees a panel before sending, and clear is always safe.
		manager.sendReferenceModel('part.glb', new Uint8Array([0x67, 0x6c, 0x54, 0x46]));
		manager.clearReferenceModel();
	});

	test('WebviewManager should accept an OBJ format hand-off with no panel open', () => {
		const manager = createWebviewManager();
		// The widened hand-off — explicit format, material bytes, or a
		// declared-but-missing material name — is a no-op without a panel
		// and must not throw, like the plain glTF hand-off.
		manager.sendReferenceModel('knob.obj', new TextEncoder().encode('mtllib knob.mtl\n'), {
			format: 'obj',
			mtlData: new TextEncoder().encode('newmtl body\n'),
			mtlName: 'knob.mtl'
		});
		manager.sendReferenceModel('knob.obj', new TextEncoder().encode('mtllib lost.mtl\n'), {
			format: 'obj',
			missingMaterial: 'lost.mtl'
		});
		manager.sendReferenceModel('bracket.stl', new Uint8Array([0x73, 0x6f, 0x6c]), { format: 'stl' });
	});

	test('Format should be named from the picked file extension', () => {
		assert.strictEqual(referenceModelFormatForFile('part.glb'), 'glb');
		assert.strictEqual(referenceModelFormatForFile('part.gltf'), 'gltf');
		assert.strictEqual(referenceModelFormatForFile('bracket.stl'), 'stl');
		assert.strictEqual(referenceModelFormatForFile('knob.obj'), 'obj');
		assert.strictEqual(referenceModelFormatForFile('KNOB.OBJ'), 'obj');
		assert.strictEqual(referenceModelFormatForFile('/some/folder/Wedge.Stl'), 'stl');
		assert.strictEqual(referenceModelFormatForFile('notes.txt'), undefined);
	});

	test('Compiled command should offer STL and OBJ in the picker', () => {
		const commandPath = path.join(extensionPath, 'out', 'referenceModelCommand.js');
		const commandCode = fs.readFileSync(commandPath, 'utf8');

		assert.ok(commandCode.includes("'glb'"), 'Picker should offer glb');
		assert.ok(commandCode.includes("'gltf'"), 'Picker should offer gltf');
		assert.ok(commandCode.includes("'stl'"), 'Picker should offer stl');
		assert.ok(commandCode.includes("'obj'"), 'Picker should offer obj');
	});

	test('mtllib names should be parsed from OBJ text', () => {
		assert.deepStrictEqual(parseMtlLibNames('mtllib knob.mtl\no Knob\n'), ['knob.mtl']);
		assert.deepStrictEqual(
			parseMtlLibNames('mtllib body.mtl top.mtl\nmtllib extra.mtl\n'),
			['body.mtl', 'top.mtl', 'extra.mtl']
		);
		assert.deepStrictEqual(parseMtlLibNames('  mtllib spaced.mtl  \n'), ['spaced.mtl']);
		assert.deepStrictEqual(parseMtlLibNames('o Plain\nv 0 0 0\n'), []);
	});

	test('OBJ material companion should be found beside the OBJ', async () => {
		await withTempDir(async dir => {
			const objPath = path.join(dir, 'knob.obj');
			fs.writeFileSync(objPath, 'mtllib knob.mtl\no Knob\n');
			fs.writeFileSync(path.join(dir, 'knob.mtl'), 'newmtl body\n');

			const lookup = await findObjMaterialCompanion(
				vscode.Uri.file(objPath),
				fs.readFileSync(objPath)
			);
			assert.deepStrictEqual(lookup.declared, ['knob.mtl']);
			assert.ok(lookup.companion, 'The declared material file should be found');
			assert.strictEqual(lookup.companion.name, 'knob.mtl');
			assert.strictEqual(new TextDecoder().decode(lookup.companion.data), 'newmtl body\n');
		});
	});

	test('OBJ material companion should resolve an mtllib name in a subfolder', async () => {
		await withTempDir(async dir => {
			const objPath = path.join(dir, 'knob.obj');
			fs.writeFileSync(objPath, 'mtllib materials/knob.mtl\no Knob\n');
			fs.mkdirSync(path.join(dir, 'materials'));
			fs.writeFileSync(path.join(dir, 'materials', 'knob.mtl'), 'newmtl body\n');

			const lookup = await findObjMaterialCompanion(
				vscode.Uri.file(objPath),
				fs.readFileSync(objPath)
			);
			assert.ok(lookup.companion, 'The subfolder material file should be found');
			assert.strictEqual(lookup.companion.name, 'knob.mtl');
		});
	});

	test('OBJ material companion should fall back to the same-named .mtl', async () => {
		await withTempDir(async dir => {
			const objPath = path.join(dir, 'knob.obj');
			fs.writeFileSync(objPath, 'mtllib lost.mtl\no Knob\n');
			fs.writeFileSync(path.join(dir, 'knob.mtl'), 'newmtl body\n');

			const lookup = await findObjMaterialCompanion(
				vscode.Uri.file(objPath),
				fs.readFileSync(objPath)
			);
			assert.deepStrictEqual(lookup.declared, ['lost.mtl']);
			assert.ok(lookup.companion, 'The same-named .mtl should be found');
			assert.strictEqual(lookup.companion.name, 'knob.mtl');
		});
	});

	test('OBJ material companion should report declared names when nothing is found', async () => {
		await withTempDir(async dir => {
			const objPath = path.join(dir, 'knob.obj');
			fs.writeFileSync(objPath, 'mtllib lost.mtl\no Knob\n');

			const lookup = await findObjMaterialCompanion(
				vscode.Uri.file(objPath),
				fs.readFileSync(objPath)
			);
			assert.deepStrictEqual(lookup.declared, ['lost.mtl']);
			assert.strictEqual(lookup.companion, undefined, 'No companion should be invented');
		});
	});

	test('Bundled renderer should wire the reference model messages', () => {
		const rendererPath = path.join(extensionPath, 'dist', 'webview', 'renderer.js');
		const rendererCode = fs.readFileSync(rendererPath, 'utf8');

		assert.ok(rendererCode.includes('function loadReferenceModel'), 'Renderer should define loadReferenceModel');
		assert.ok(rendererCode.includes('function clearReferenceModel'), 'Renderer should define clearReferenceModel');
		assert.ok(rendererCode.includes('function placeReferenceModel'), 'Renderer should define placeReferenceModel');
		assert.ok(rendererCode.includes("'loadReferenceModel'"), 'Renderer should handle the loadReferenceModel message');
		assert.ok(rendererCode.includes("'clearReferenceModel'"), 'Renderer should handle the clearReferenceModel message');
		assert.ok(rendererCode.includes('referenceModelLoaded'), 'Renderer should report referenceModelLoaded to the host');
		assert.ok(rendererCode.includes('referenceModelError'), 'Renderer should report referenceModelError to the host');
		assert.ok(rendererCode.includes('loadModel'), 'Renderer should call Photonic loadModel');
		assert.ok(rendererCode.includes('getModelInfo'), 'Renderer should read the loaded model info');
		assert.ok(rendererCode.includes('loadOptions.format'), 'Renderer should hand the named format to the loader');
		assert.ok(rendererCode.includes('loadOptions.mtlData'), 'Renderer should supply an OBJ material file as mtlData');
		assert.ok(rendererCode.includes('materialFile'), 'Renderer should report the material file that travelled');
		assert.ok(rendererCode.includes('materialsMissing'), 'Renderer should report a declared material file that was not found');
	});

	test('Preview HTML should include the Clear Reference button', () => {
		const ext = vscode.extensions.getExtension('owlprecision.hootcad');
		assert.ok(ext, 'Extension should be available');
		const mockContext = {
			extensionUri: ext.extensionUri,
			extensionPath: ext.extensionPath,
		} as vscode.ExtensionContext;
		const provider = new WebviewContentProvider(mockContext);

		const html = provider.getWebviewContent(createMockWebview());
		assert.ok(html.includes('id="snapshot-button"'), 'Should keep the Snapshot button');
		assert.ok(html.includes('id="clear-reference-button"'), 'Should have the Clear Reference button');
	});
});

/**
 * Run a test body inside a fresh temporary folder, removed afterwards
 */
async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hootcad-refmodel-'));
	try {
		await run(dir);
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
}

/**
 * Build a WebviewManager against minimal mocks (no panel is ever created)
 */
function createWebviewManager(): WebviewManager {
	const outputChannel = {
		appendLine: () => {}
	} as unknown as vscode.OutputChannel;
	const errorReporter = new ErrorReporter(outputChannel);

	const mockContext = {
		extensionUri: vscode.Uri.file('/tmp'),
		subscriptions: [],
		workspaceState: {
			get: () => undefined,
			update: () => Promise.resolve()
		}
	} as unknown as vscode.ExtensionContext;
	const parameterCache = new ParameterCache(mockContext);

	const statusBarItem = {
		text: '',
		show: () => {},
		dispose: () => {}
	} as unknown as vscode.StatusBarItem;

	return new WebviewManager(mockContext, errorReporter, parameterCache, statusBarItem);
}

/**
 * Create a mock webview for testing
 */
function createMockWebview(): vscode.Webview {
	return {
		asWebviewUri: (uri: vscode.Uri) => {
			return vscode.Uri.parse(`vscode-webview://mock/${uri.path}`);
		},
		html: '',
		options: {},
		onDidReceiveMessage: () => ({ dispose: () => {} }),
		postMessage: () => Promise.resolve(true),
		cspSource: 'vscode-webview://mock'
	} as any;
}
