#!/usr/bin/env node
/**
 * Local CADGenBench-style harness for HootCAD.
 *
 * Runs a dev's/agent's JSCAD solutions (e.g. authored with help from the
 * HootCAD MCP server's `cad_advice` and `cad_math` tools) against a set of
 * benchmark-style sample descriptions, checks geometric validity, scores
 * them against declared requirements, and writes a JSON + HTML report.
 *
 * This is NOT the official CADGenBench scoring pipeline - see
 * scripts/cadgenbench/README.md for scope and limitations.
 *
 * Usage:
 *   node scripts/cadgenbench/run-bench.js \
 *     [--samples <dir>] [--solutions <dir>] [--out <dir>]
 */

const fs = require('fs');
const path = require('path');

const { discoverSamples } = require('./lib/loadSample');
const { evaluateJscadFile } = require('./lib/evaluateJscad');
const { isGeom3, checkGeom3Validity, computeMetrics, scoreRequirements } = require('./lib/validity');
const { writeReport } = require('./lib/report');

function parseArgs(argv) {
	const args = {
		samples: path.join(__dirname, 'samples'),
		solutions: path.join(__dirname, 'solutions'),
		out: path.join(__dirname, 'out')
	};

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === '--samples') { args.samples = path.resolve(argv[++i]); }
		else if (arg === '--solutions') { args.solutions = path.resolve(argv[++i]); }
		else if (arg === '--out') { args.out = path.resolve(argv[++i]); }
		else if (arg === '--help' || arg === '-h') { args.help = true; }
	}

	return args;
}

function findSolutionFile(solutionsDir, sampleId) {
	const sampleSolutionDir = path.join(solutionsDir, sampleId);
	const candidates = [
		path.join(solutionsDir, `${sampleId}.jscad`),
		path.join(sampleSolutionDir, 'index.jscad'),
		path.join(sampleSolutionDir, `${sampleId}.jscad`)
	];
	return candidates.find(candidate => fs.existsSync(candidate)) || null;
}

function runSample(sample, solutionsDir) {
	const solutionFile = findSolutionFile(solutionsDir, sample.id);

	if (!solutionFile) {
		return {
			id: sample.id,
			task: sample.description.task || 'generation',
			valid: false,
			score: 0,
			reasons: [],
			checks: [],
			error: `No solution .jscad file found for sample "${sample.id}" in ${solutionsDir}`
		};
	}

	try {
		const startedAt = Date.now();
		const geometries = evaluateJscadFile(solutionFile, sample.description.params);
		const durationMs = Date.now() - startedAt;

		const solids = geometries.filter(isGeom3);
		if (solids.length === 0) {
			return {
				id: sample.id,
				task: sample.description.task || 'generation',
				valid: false,
				score: 0,
				reasons: ['main() did not return any 3D solid (geom3) geometry'],
				checks: [],
				durationMs
			};
		}

		// Aggregate metrics across all returned solids as one candidate part.
		const validities = solids.map(checkGeom3Validity);
		const valid = validities.every(v => v.valid);
		const reasons = validities.flatMap(v => v.reasons);

		// Use the first solid for metrics; multi-solid assemblies are out of
		// scope for this lightweight harness (see README).
		const metrics = computeMetrics(solids[0]);
		const { score, checks } = scoreRequirements(sample.description.requirements, metrics, valid);

		return {
			id: sample.id,
			task: sample.description.task || 'generation',
			valid,
			score,
			reasons,
			checks,
			metrics,
			durationMs
		};
	} catch (error) {
		return {
			id: sample.id,
			task: sample.description.task || 'generation',
			valid: false,
			score: 0,
			reasons: [],
			checks: [],
			error: error.message
		};
	}
}

function main() {
	const args = parseArgs(process.argv.slice(2));

	if (args.help) {
		console.log([
			'Usage: node scripts/cadgenbench/run-bench.js [options]',
			'',
			'Options:',
			'  --samples <dir>    Directory containing one subdirectory per sample with a description.json/yaml (default: scripts/cadgenbench/samples)',
			'  --solutions <dir>  Directory containing candidate .jscad solutions (default: scripts/cadgenbench/solutions)',
			'  --out <dir>        Directory to write report.json/report.html into (default: scripts/cadgenbench/out)',
			'  --help             Show this help message'
		].join('\n'));
		return;
	}

	const samples = discoverSamples(args.samples);
	if (samples.length === 0) {
		console.error(`No samples found in ${args.samples}`);
		process.exitCode = 1;
		return;
	}

	const results = samples.map(sample => runSample(sample, args.solutions));
	const { summary, jsonPath, htmlPath } = writeReport(args.out, results);

	console.log(`CADGenBench local harness: ${summary.gatedValid}/${summary.totalSamples} samples passed the validity gate, average requirement score ${(summary.averageScore * 100).toFixed(1)}%`);
	console.log(`Report written to:\n  ${jsonPath}\n  ${htmlPath}`);

	const anyErrors = results.some(r => r.error);
	if (anyErrors || summary.gatedValid < summary.totalSamples) {
		process.exitCode = 1;
	}
}

main();
