/**
 * Report generation for the CADGenBench harness: writes a machine-readable
 * `report.json` and a human-readable `report.html` summarizing per-sample
 * and aggregate results.
 */

const fs = require('fs');
const path = require('path');

function escapeHtml(value) {
	return String(value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/**
 * @param {Array<object>} results Per-sample result objects (see runBench.js).
 * @returns {{ totalSamples: number, gatedValid: number, averageScore: number, passRate: number }}
 */
function summarize(results) {
	const totalSamples = results.length;
	const gatedValid = results.filter(r => r.valid).length;
	const averageScore = totalSamples === 0
		? 0
		: results.reduce((sum, r) => sum + r.score, 0) / totalSamples;
	const passRate = totalSamples === 0 ? 0 : gatedValid / totalSamples;
	return { totalSamples, gatedValid, averageScore, passRate };
}

function toHtml(results, summary) {
	const rows = results.map(r => `
		<tr class="${r.error ? 'row-error' : r.valid ? 'row-valid' : 'row-invalid'}">
			<td>${escapeHtml(r.id)}</td>
			<td>${escapeHtml(r.task)}</td>
			<td>${r.error ? 'ERROR' : (r.valid ? 'valid' : 'invalid')}</td>
			<td>${(r.score * 100).toFixed(1)}%</td>
			<td>${r.error ? escapeHtml(r.error) : r.reasons.join('; ') || '-'}</td>
			<td>${r.checks.map(c => `${c.passed ? '✅' : '❌'} ${escapeHtml(c.name)}: ${escapeHtml(c.detail)}`).join('<br/>') || '-'}</td>
		</tr>`).join('\n');

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>HootCAD - CADGenBench local harness report</title>
<style>
	body { font-family: -apple-system, Segoe UI, sans-serif; margin: 2rem; color: #1c1c1c; }
	h1 { margin-bottom: 0; }
	.subtitle { color: #555; margin-top: 0.25rem; }
	table { border-collapse: collapse; width: 100%; margin-top: 1.5rem; }
	th, td { border: 1px solid #ddd; padding: 0.5rem 0.75rem; text-align: left; vertical-align: top; }
	th { background: #f2f2f2; }
	.row-valid { background: #f2fff2; }
	.row-invalid { background: #fff6f2; }
	.row-error { background: #fff2f2; }
	.summary { display: flex; gap: 2rem; margin-top: 1rem; }
	.summary div { background: #f7f7f7; border-radius: 6px; padding: 0.75rem 1rem; }
	.summary strong { display: block; font-size: 1.4rem; }
</style>
</head>
<body>
	<h1>HootCAD - CADGenBench local harness report</h1>
	<p class="subtitle">Generated ${escapeHtml(new Date().toISOString())}. This is a local proxy for
		<a href="https://huggingface.co/spaces/HuggingAI4Engineering/CADGenBench">CADGenBench</a>,
		not the official scoring pipeline. See scripts/cadgenbench/README.md for scope and limitations.</p>
	<div class="summary">
		<div><strong>${summary.totalSamples}</strong>samples</div>
		<div><strong>${summary.gatedValid}/${summary.totalSamples}</strong>passed validity gate</div>
		<div><strong>${(summary.averageScore * 100).toFixed(1)}%</strong>average requirement score</div>
	</div>
	<table>
		<thead>
			<tr><th>Sample</th><th>Task</th><th>Validity</th><th>Score</th><th>Validity notes</th><th>Requirement checks</th></tr>
		</thead>
		<tbody>
			${rows}
		</tbody>
	</table>
</body>
</html>
`;
}

/**
 * Writes report.json and report.html into outDir.
 *
 * @param {string} outDir Absolute path to the output directory (created if missing).
 * @param {Array<object>} results Per-sample results.
 * @returns {{ summary: object, jsonPath: string, htmlPath: string }}
 */
function writeReport(outDir, results) {
	fs.mkdirSync(outDir, { recursive: true });

	const summary = summarize(results);
	const jsonPath = path.join(outDir, 'report.json');
	const htmlPath = path.join(outDir, 'report.html');

	fs.writeFileSync(jsonPath, JSON.stringify({ summary, results }, null, 2), 'utf8');
	fs.writeFileSync(htmlPath, toHtml(results, summary), 'utf8');

	return { summary, jsonPath, htmlPath };
}

module.exports = {
	summarize,
	writeReport
};
