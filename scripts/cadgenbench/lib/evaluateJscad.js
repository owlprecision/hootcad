/**
 * Headless JSCAD file evaluator for the CADGenBench harness.
 *
 * This mirrors the loading approach used by `src/jscadEngine.ts` (execute the
 * .jscad source in a small VM sandbox with a `require` that can resolve both
 * relative files and installed packages) but has no dependency on the VS Code
 * API, so it can run in a plain Node.js CLI.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createRequire } = require('module');

/**
 * Loads a .jscad file's CommonJS exports, recursively resolving relative
 * `.jscad` requires the same way the HootCAD extension does.
 *
 * @param {string} filePath Absolute path to the .jscad file.
 * @returns {any} The module's exports object.
 */
function loadJscadModuleFromFile(filePath) {
	// Resolves @jscad/* packages against this repo's node_modules, since the
	// solution files themselves live outside of any node_modules tree.
	const harnessRequire = createRequire(path.join(__dirname, '..', 'package.json'));
	const fileContent = fs.readFileSync(filePath, 'utf8');
	const dirname = path.dirname(filePath);

	const customRequire = (moduleName) => {
		if (moduleName.startsWith('./') || moduleName.startsWith('../')) {
			const resolvedPath = path.resolve(dirname, moduleName);
			if (resolvedPath.endsWith('.jscad')) {
				return loadJscadModuleFromFile(resolvedPath);
			}
			return require(resolvedPath);
		}
		try {
			return require(moduleName);
		} catch (e) {
			return harnessRequire(moduleName);
		}
	};

	const module = { exports: {} };
	const context = vm.createContext({
		require: customRequire,
		module,
		exports: module.exports,
		__filename: filePath,
		__dirname: dirname,
		console
	});

	const script = new vm.Script(fileContent, { filename: filePath });
	script.runInContext(context);

	return module.exports;
}

/**
 * Executes a .jscad solution file's `main()` and returns the raw JSCAD
 * geometries it produced.
 *
 * @param {string} filePath Absolute path to the .jscad file.
 * @param {Record<string, any>} [params] Optional parameters passed to main().
 * @returns {any[]} Array of geom2/geom3 objects.
 */
function evaluateJscadFile(filePath, params) {
	const jscadModule = loadJscadModuleFromFile(filePath);

	if (!jscadModule.main || typeof jscadModule.main !== 'function') {
		throw new Error('JSCAD file must export a main() function');
	}

	const result = jscadModule.main(params || {});
	return Array.isArray(result) ? result : [result];
}

module.exports = {
	loadJscadModuleFromFile,
	evaluateJscadFile
};
