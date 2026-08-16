/**
 * Loads a CADGenBench-style sample description.
 *
 * Samples mirror the shape of CADGenBench's `description.yaml` (see
 * https://github.com/huggingface/cadgenbench): each sample declares a task
 * type ("generation" or "editing"), a natural-language prompt, and a set of
 * requirements used to score a candidate model.
 *
 * To avoid pulling in a YAML dependency, this harness accepts either
 * `description.json` or a minimal `description.yaml` subset (flat/nested
 * maps, lists, and scalars - no anchors, multi-doc, or block scalars).
 */

const fs = require('fs');
const path = require('path');

/**
 * Very small YAML-subset parser sufficient for description.yaml files
 * following CADGenBench's schema (nested maps + scalars, 2-space indent).
 * Not a general-purpose YAML parser.
 */
function parseMiniYaml(text) {
	const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0 && !line.trim().startsWith('#'));

	function parseValue(raw) {
		const value = raw.trim();
		if (value === '' || value === '~' || value === 'null') { return null; }
		if (value === 'true') { return true; }
		if (value === 'false') { return false; }
		if (/^-?\d+(\.\d+)?$/.test(value)) { return Number(value); }
		if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
			return value.slice(1, -1);
		}
		return value;
	}

	function indentOf(line) {
		return line.length - line.trimStart().length;
	}

	function parseBlock(startIndex, indent) {
		const result = {};
		let i = startIndex;
		while (i < lines.length) {
			const line = lines[i];
			const lineIndent = indentOf(line);
			if (lineIndent < indent) { break; }
			if (lineIndent > indent) { i++; continue; }

			const trimmed = line.trim();
			const colonIndex = trimmed.indexOf(':');
			if (colonIndex === -1) { i++; continue; }

			const key = trimmed.slice(0, colonIndex).trim();
			const rest = trimmed.slice(colonIndex + 1).trim();

			if (rest === '') {
				// Nested block or list follows
				const nextLine = lines[i + 1];
				const nextIndent = nextLine ? indentOf(nextLine) : -1;
				if (nextLine && nextIndent > indent && nextLine.trim().startsWith('- ')) {
					const [list, nextI] = parseList(i + 1, nextIndent);
					result[key] = list;
					i = nextI;
				} else if (nextLine && nextIndent > indent) {
					const [nested, nextI] = parseBlock(i + 1, nextIndent);
					result[key] = nested;
					i = nextI;
				} else {
					result[key] = null;
					i++;
				}
			} else {
				result[key] = parseValue(rest);
				i++;
			}
		}
		return [result, i];
	}

	function parseList(startIndex, indent) {
		const items = [];
		let i = startIndex;
		while (i < lines.length) {
			const line = lines[i];
			const lineIndent = indentOf(line);
			if (lineIndent !== indent || !line.trim().startsWith('- ')) { break; }
			const itemText = line.trim().slice(2);
			items.push(parseValue(itemText));
			i++;
		}
		return [items, i];
	}

	const [result] = parseBlock(0, 0);
	return result;
}

/**
 * Loads a single sample's description from a directory containing either
 * `description.json` or `description.yaml`.
 *
 * @param {string} sampleDir Absolute path to the sample directory.
 * @returns {object} The parsed sample description.
 */
function loadSampleDescription(sampleDir) {
	const jsonPath = path.join(sampleDir, 'description.json');
	const yamlPath = path.join(sampleDir, 'description.yaml');

	if (fs.existsSync(jsonPath)) {
		return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
	}
	if (fs.existsSync(yamlPath)) {
		return parseMiniYaml(fs.readFileSync(yamlPath, 'utf8'));
	}
	throw new Error(`No description.json or description.yaml found in ${sampleDir}`);
}

/**
 * Discovers all sample directories under a samples root, each containing a
 * description file.
 *
 * @param {string} samplesRoot Absolute path to the directory containing one subdirectory per sample.
 * @returns {Array<{ id: string, dir: string, description: object }>}
 */
function discoverSamples(samplesRoot) {
	if (!fs.existsSync(samplesRoot)) {
		throw new Error(`Samples directory not found: ${samplesRoot}`);
	}

	return fs.readdirSync(samplesRoot, { withFileTypes: true })
		.filter(entry => entry.isDirectory())
		.map(entry => {
			const dir = path.join(samplesRoot, entry.name);
			const description = loadSampleDescription(dir);
			return {
				id: description.id || entry.name,
				dir,
				description
			};
		})
		.sort((a, b) => a.id.localeCompare(b.id));
}

module.exports = {
	parseMiniYaml,
	loadSampleDescription,
	discoverSamples
};
