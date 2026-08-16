# CADGenBench local harness (HootCAD)

A local, offline harness for exercising HootCAD-authored CAD solutions
against benchmark-style tasks inspired by
[CADGenBench](https://huggingface.co/spaces/HuggingAI4Engineering/CADGenBench)
(source: [huggingface/cadgenbench](https://github.com/huggingface/cadgenbench)).

It lets a developer:

1. Ask an agent (e.g. GitHub Copilot with the HootCAD MCP server enabled,
   which exposes `cad_advice` and `cad_math`) to author a `.jscad` solution
   for a benchmark-style sample.
2. Run this harness to headlessly evaluate that solution, check its
   geometric validity, score it against the sample's declared requirements,
   and get a report.

## Scope and limitations

This is **not** the official CADGenBench scoring pipeline and does not
produce CADGenBench-submittable output:

- CADGenBench submissions are STEP/BREP files (`output.step`), scored with
  a validity gate plus shape-similarity, interface-match, and topology
  metrics against privately-held ground truth (see the
  [CADGenBench docs](https://github.com/huggingface/cadgenbench/blob/main/docs/metrics.md)).
- HootCAD is built on [JSCAD](https://openjscad.xyz/), which represents
  solids as tessellated meshes (`geom3`), not BREP solids. There is no STEP
  serializer in the JSCAD ecosystem this project depends on.
- This harness therefore approximates only what it can compute locally from
  a mesh: a validity gate (non-empty, non-degenerate, finite, positive
  volume) and simple shape metrics (bounding box dimensions, volume) checked
  against requirements you declare per sample. It does not compute surface
  distance F1, volume IoU, or Betti-number topology matching, and it never
  contacts the Hugging Face Space or its private ground-truth dataset.

Use it as a fast, local feedback loop while developing HootCAD/JSCAD
solutions - not as a substitute for submitting to the real leaderboard.

## Usage

```bash
# Run against the bundled example samples/solutions
npm run bench:cadgen

# Run against your own samples and solutions
node scripts/cadgenbench/run-bench.js \
  --samples path/to/samples \
  --solutions path/to/solutions \
  --out path/to/report-output
```

The report is written as both `report.json` (machine-readable) and
`report.html` (human-readable) in the output directory (default:
`scripts/cadgenbench/out/`, which is git-ignored).

The command exits with a non-zero status if any sample errored or failed
the validity gate, so it can be used as a local CI-style check.

## Directory layout

```
scripts/cadgenbench/
  run-bench.js         CLI entry point
  lib/
    loadSample.js       Loads description.json/description.yaml sample files
    evaluateJscad.js    Headlessly evaluates a .jscad solution's main()
    validity.js         Validity gate + bounding box/volume metrics + scoring
    report.js           JSON + HTML report writer
  samples/<id>/description.json|.yaml   One folder per benchmark-style sample
  solutions/<id>/index.jscad            One folder per candidate solution
  out/                 Generated reports (git-ignored)
```

### Sample description schema

Each sample folder contains a `description.json` or `description.yaml` file:

```yaml
id: bracket-001
task: generation   # or "editing"
prompt: "A solid rectangular mounting bracket, 50mm x 30mm x 10mm, with no holes."
requirements:
  mustBeWatertight: true
  boundingBox:
    x: 50
    y: 30
    z: 10
    tolerance: 0.5
  volume:
    min: 14500
    max: 15500
```

All `requirements` fields are optional; only declared checks are scored.

`description.yaml` support is a small parser covering the subset of YAML
used by these sample files (flat/nested maps, lists, scalars) - it is not a
general-purpose YAML parser. Prefer `description.json` for anything beyond
this simple schema.

### Solution files

For a sample with id `<id>`, the harness looks for a solution at (in
order):

- `solutions/<id>.jscad`
- `solutions/<id>/index.jscad`
- `solutions/<id>/<id>.jscad`

Each solution file must export a `main()` function returning a `geom3`
solid (or an array including one), exactly like a normal HootCAD/JSCAD
entrypoint file.

## Suggested workflow

1. Enable the HootCAD MCP server (`HootCAD: Enable MCP Server`) in your
   agent (e.g. GitHub Copilot).
2. For each sample's `prompt`, ask the agent to author a `.jscad` solution,
   using `cad_advice` and `cad_math` as it iterates.
3. Save the solution under `scripts/cadgenbench/solutions/<id>/index.jscad`
   (or point `--solutions` at wherever you keep them).
4. Run `npm run bench:cadgen` (or with custom `--samples`/`--solutions`) and
   review `report.html`.
