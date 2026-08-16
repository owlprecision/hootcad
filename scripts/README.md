# Scripts

This folder contains utility scripts for the HootCAD extension.

## cadgenbench/

A local, offline harness for scoring HootCAD/JSCAD solutions against
benchmark-style tasks inspired by
[CADGenBench](https://huggingface.co/spaces/HuggingAI4Engineering/CADGenBench).
See [`cadgenbench/README.md`](cadgenbench/README.md) for details, or run:

```bash
npm run bench:cadgen
```

## generate-roughness-map.js

Generates a procedural roughness map texture for realistic CAD surface rendering.

### Usage

**Using Node.js directly:**
```bash
node scripts/generate-roughness-map.js
```

**Using PowerShell (Windows):**
```powershell
.\scripts\generate-roughness-map.ps1
```

**Using Bash (macOS/Linux):**
```bash
./scripts/generate-roughness-map.sh
```

### What it does

- Generates a 512x512 grayscale PNG texture
- Uses multi-octave Perlin-like noise for realistic surface variation
- Outputs to `src/webview/roughness-map.png`
- The texture is automatically used by the 3D renderer for surface roughness variation

### Customization

You can modify the script parameters:
- `width` / `height`: Texture resolution (default: 512x512)
- Noise octaves and scales for different texture patterns
- Value range (180-255) for roughness intensity

### When to regenerate

- If you want to change the surface texture appearance
- To experiment with different noise patterns
- After cleaning build artifacts
