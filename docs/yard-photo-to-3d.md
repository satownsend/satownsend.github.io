# Photo-real yard reconstruction

Research and existing-photo assessment: November 1, 2026.

The initial `/yard-3d/#viewpoints` scene is a flat aerial-map plane, schematic cameras, optional plant markers and rectangular photo cards. Those references do not contain measured 3D geometry. The scan viewer is a separate renderer and does not infer a complete yard from those cards.

## Existing photos

The visible yard-photo catalog contains 39 photos tagged to 17 viewpoints. No date has more than two yard photos. The recent two-photo session inspected (August 15, 2026) shows different parts of the yard in different directions, rather than a connected sequence of overlapping camera positions. This is useful reference photography, but it does not establish coverage of the unseen sides of trees, buildings and beds. This assessment is not a failed reconstruction run: no reconstruction model has been trained. Do not mix years and seasons into a single supposedly current scan.

No scan assets are in the repository. COLMAP, FFmpeg, PyTorch and Nerfstudio were not available in the working environment at assessment time. A high-detail scan still requires a suitable capture and reconstruction on appropriate compute.

## Approaches considered

| Approach | Use here | Limit |
| --- | --- | --- |
| COLMAP + Nerfstudio Splatfacto | Preferred reproducible photo/video-to-Gaussian-splat route | Needs overlapping sharp captures, camera alignment and GPU training |
| VGGT / VGGT-Ω | Candidate for testing sparse-photo camera/depth initialization | Inferred depth and sparse coverage do not establish a complete, accurate yard; still needs quality assessment and splat training |
| Spark 2.4.0 + Three.js 0.180.0 | Implemented local scan viewer; PLY, SPLAT, SPZ, KSPLAT and bundled SOG | Renderer, not a photo reconstruction service; large files can exceed device memory |
| PlayCanvas / SuperSplat | Clean/crop splats; SOG compression and streamed levels of detail for a large future hosted yard scan | Streaming needs prepared assets and a separate delivery integration; not implemented by this local importer |
| Three.js GaussianSplat addon | Promising native option for a future renderer migration | Requires WebGPURenderer (including its WebGL fallback), not the current WebGLRenderer + postprocessing stack |
| Textured photogrammetry mesh / GLB | Useful for measurable surfaces and collision geometry | Foliage is difficult; GLB is not a supported file in this Gaussian-only viewer |

The nine existing scenes keep Three.js 0.170.0. The scan viewer runs in an isolated frame, pins its own compatible versions, bypasses bloom/tone mapping and loads Spark only after file selection. It fits the scan bounds for portrait and landscape aspect ratios, exposes detail levels and can flip an upside-down export. Opening a local file does not upload or publish it. Closing the frame releases its renderer. No owner's yard scan is bundled or automatically loaded yet.

## Capture the missing coverage

Start with a small section around the island and shed, rather than promising the entire property from one pass. In calm weather and soft, even light, walk slowly along connected paths around and through that section. Keep substantial overlap between successive views, including transitions between paths. Circle important trees and beds at several angles. Include the shed corners and other stationary features for alignment. Avoid motion blur, digital zoom, sudden exposure changes and waving branches. Record one continuous session, or take a dense sequence of stills. Repeat for adjoining sections with shared overlap. Do not film private neighboring areas unnecessarily.

For this yard, a useful route is porch steps → island → shed → rear yard → back toward the porch, plus passes along both sides of the island and around the structures. A single forward-facing shot at each saved viewpoint is not enough. Inspect a small reconstructed section before committing to a whole-yard training run.

## Reconstruction and review

On a machine with the documented Nerfstudio dependencies, the documented command sequence is:

```sh
ns-process-data video --data yard-walk.mp4 --output-dir data/yard
# Alternatively: ns-process-data images --data photos/ --output-dir data/yard
ns-train splatfacto --data data/yard
ns-export gaussian-splat --load-config outputs/<run>/config.yml --output-dir exports/yard
```

These commands are a documented workflow, not commands already run on this yard. Review camera alignment and hold-out views; check shed straight lines, plant placement, floating artifacts and gaps. Crop irrelevant background in SuperSplat. Export a bundled SPZ, SOG or PLY and use **Load 3D yard scan** on Yard viewpoints. The current local importer accepts up to 512 MB of input bytes; that is not a guarantee that the decoded scan fits every phone's GPU memory. Prefer a cropped/compressed export. Test desktop and phone before publishing a hosted scan. Never publish a synthetic fixture as the owner's yard.

## Sources

- [Nerfstudio custom captures and overlap requirements](https://docs.nerf.studio/quickstart/custom_dataset.html)
- [Splatfacto training and export](https://docs.nerf.studio/nerfology/methods/splat.html)
- [VGGT reconstruction and COLMAP export](https://github.com/facebookresearch/vggt)
- [Spark SplatMesh formats and lifecycle](https://sparkjs.dev/docs/splat-mesh/)
- [Spark renderer detail controls](https://sparkjs.dev/docs/spark-renderer/)
- [Three.js native GaussianSplat renderer requirements](https://threejs.org/docs/pages/GaussianSplat.html)
- [SuperSplat import and export](https://developer.playcanvas.com/user-manual/supersplat/editor/import-export/)
- [SuperSplat streaming and device budgets](https://developer.playcanvas.com/user-manual/supersplat/streaming/)
