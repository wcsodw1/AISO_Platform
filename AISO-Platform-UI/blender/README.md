# AISO Blender Agent

Verified Blender 5.2.1 LTS integration for generating Blender Python with an OpenAI-compatible local inference endpoint. Generated code is syntax-checked, executed in Blender, and automatically repaired with traceback feedback when execution fails.

## Private endpoint configuration

No private LAN address is stored in this public repository or exported to the Portal. Configure the endpoint in either of these ways:

1. Enter the full URL in the Blender N Panel, for example `http://<PRO6000-LAN-IP>:8090/v1/chat/completions`.
2. Set `AISO_BLENDER_ENDPOINT` before launching Blender. The optional `AISO_BLENDER_MODEL` variable overrides the default `gpt-oss-120b` model name.

The safe fallback endpoint is `http://127.0.0.1:8090/v1/chat/completions`.

## Files

- `script/aiso_blender_agent.py`
  - Core PRO6000 request
  - Blender Python generation
  - Syntax validation
  - Runtime execution
  - Auto-repair with traceback feedback

- `script/aiso_blender_agent_panel.py`
  - Blender N-panel UI
  - Endpoint, model, and Auto-Repair controls
  - Generate Scene
  - Preview Code
  - Render
  - Clear Console

- `output/`
  - Reserved for `.blend`, `.glb`, and rendered output.

## Run Panel

In Blender:

1. Scripting
2. Text > Open
3. Open `script/aiso_blender_agent_panel.py`
4. Run Script
5. Return to 3D Viewport
6. Press `N`
7. Open `AISO AI`

## Agent flow

```text
Scene request
  → local model generates Blender Python
  → syntax validation
  → Blender runtime execution
  → traceback-guided Auto-Repair (up to the configured limit)
  → generated code remains available as PRO6000_RESPONSE.py
```

## Security and publishing

- Keep actual LAN addresses, credentials, and customer prompts out of commits.
- The public Portal documents capability and workflow only; it does not publish endpoint configuration.
- Generated `.blend`, `.glb`, renders, and transient output belong under `output/` and should be reviewed before publication.
