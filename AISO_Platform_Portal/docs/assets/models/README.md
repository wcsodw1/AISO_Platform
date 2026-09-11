# Web 3D model assets

This directory stores web-delivery 3D assets separately from the fallback catalog images in `assets/products/`.

The current `.glb` files are web-ready prototypes generated from single-view product images. They are approximate 3D/2.5D presentation assets, not CAD-accurate models. Use constrained hero motion or a limited orbit; do not present unseen sides as verified product geometry.

| Model | Product image source | Intended product |
|---|---|---|
| `aiso1-ai-max395.glb` | `aiso1-ai-max395-3d.png` | AISO1 AI MAX395 |
| `dgx-b300.glb` | `dgx-b300-cutout.png` | NVIDIA DGX B300 |
| `gb10-ai-workstation.glb` | `gb10-ai-workstation-cutout.png` | GB10 AI Workstation |
| `pro6000-8gpu-server.glb` | `pro6000-8gpu-server-cutout.png` | PRO6000 TPI 8-GPU system |
| `pro6000-server-chassis.glb` | `pro6000-server-chassis-cutout.png` | PRO6000 HPE 2-GPU chassis reference |
| `rog-flow-z13-gz302.glb` | `rog-flow-z13-gz302.webp` | ASUS ROG Flow Z13 GZ302 |
| `rtx-pro-6000-server-edition.glb` | `nvidia-rtx-pro-6000-server.jpeg` | NVIDIA RTX PRO 6000 Server Edition GPU reference |
| `tuf-gaming-a14-fa401ea.glb` | `tuf-gaming-a14-fa401ea.webp` | ASUS TUF Gaming A14 FA401EA |

`manifest.json` records the source filename, byte size, and generated geometry count. The recommended renderer is Three.js `GLTFLoader` for cinematic integration, or `<model-viewer>` for a simpler product viewer.

Keep the original product image as a loading poster and fallback for reduced-motion, low-power, or WebGL-unavailable clients.
