import bpy
import json
import os
import urllib.request
import re
import traceback

ENDPOINT = os.environ.get(
    "AISO_BLENDER_ENDPOINT",
    "http://127.0.0.1:8090/v1/chat/completions",
).strip()
MODEL = os.environ.get("AISO_BLENDER_MODEL", "gpt-oss-120b").strip()
MAX_REPAIR_ATTEMPTS = 2

SYSTEM_PROMPT = """
You generate production-safe Blender Python.

Target environment:
- Blender 5.2.1 LTS
- Python 3.13
- macOS

Rules:
- Use only Blender 5.2.1-compatible bpy APIs.
- Do not use removed or deprecated EEVEE properties from older Blender versions.
- Before using object-level bpy operators, ensure Blender is in Object Mode.
- Prefer Blender data API over UI-context-sensitive bpy.ops where possible.
- Prefer bpy.data.objects.remove(obj, do_unlink=True) when clearing the scene.
- Do not modify viewport shading, UI areas, editors, or workspace state unless explicitly requested.
- Return only complete executable Blender Python code.
- Do not use Markdown.
- Do not explain anything.
- Make sure the script is syntactically complete before finishing.
"""

def call_pro6000(messages, max_tokens=8000, endpoint=None, model=None):
    endpoint = (endpoint or ENDPOINT).strip()
    model = (model or MODEL).strip()
    if not endpoint.startswith(("http://", "https://")):
        raise ValueError("Endpoint must start with http:// or https://")
    if not model:
        raise ValueError("Model name is required")

    payload = {
        "model": model,
        "messages": messages,
        "temperature": 0.1,
        "max_tokens": max_tokens,
    }

    req = urllib.request.Request(
        endpoint,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    with urllib.request.urlopen(req, timeout=180) as response:
        data = json.loads(response.read().decode("utf-8"))

    choice = data["choices"][0]
    code = choice["message"]["content"]

    code = re.sub(r"^```(?:python)?\s*", "", code.strip())
    code = re.sub(r"\s*```$", "", code)

    return code, data


def save_response(code):
    text_name = "PRO6000_RESPONSE.py"

    if text_name in bpy.data.texts:
        text = bpy.data.texts[text_name]
        text.clear()
    else:
        text = bpy.data.texts.new(text_name)

    text.write(code)


def execute_code(code):
    compiled = compile(
        code,
        "PRO6000_RESPONSE.py",
        "exec",
    )

    exec(
        compiled,
        {
            "__name__": "__main__",
            "bpy": bpy,
        },
    )


def repair_code(user_task, code, error_text, endpoint=None, model=None):
    prompt = f"""
The Blender Python script below failed.

USER TASK:
{user_task}

FAILED SCRIPT:
{code}

ERROR:
{error_text}

Fix the script.

Rules:
- Preserve the user's intended scene.
- Fix the actual runtime failure.
- Use only Blender 5.2.1-compatible bpy APIs.
- Avoid removed EEVEE properties.
- Avoid UI-context-dependent operations when possible.
- Return the COMPLETE corrected script.
- Return only executable Python.
- No Markdown.
- No explanation.
"""

    code, data = call_pro6000([
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": prompt},
    ], endpoint=endpoint, model=model)

    return code, data


def run_agent(
    user_task,
    max_repair_attempts=MAX_REPAIR_ATTEMPTS,
    endpoint=None,
    model=None,
):
    code, data = call_pro6000([
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_task},
    ], endpoint=endpoint, model=model)

    for attempt in range(max_repair_attempts + 1):
        try:
            save_response(code)
            execute_code(code)

            return {
                "success": True,
                "attempts": attempt + 1,
                "code": code,
                "api_response": data,
            }

        except Exception:
            error_text = traceback.format_exc()
            print(error_text)

            if attempt >= max_repair_attempts:
                return {
                    "success": False,
                    "attempts": attempt + 1,
                    "code": code,
                    "error": error_text,
                    "api_response": data,
                }

            print("Sending traceback back to PRO6000 for repair...")

            code, data = repair_code(
                user_task,
                code,
                error_text,
                endpoint=endpoint,
                model=model,
            )


if __name__ == "__main__":
    task = """
Create a product photography scene for a compact AI workstation.

Requirements:
1. Delete all existing objects safely.
2. Create a compact rectangular workstation chassis.
3. Use a brushed silver aluminum material.
4. Add subtle rounded bevels.
5. Add a dark studio floor.
6. Add one large soft Area Light from the front-left.
7. Add one blue rim light from the rear-right.
8. Add a 50mm camera.
9. Point the camera toward the workstation.
10. Make the scene render-ready.
"""

    result = run_agent(task)

    if result["success"]:
        print(
            f"SUCCESS: Scene generated in "
            f"{result['attempts']} attempt(s)."
        )
    else:
        print("FAILED")
        print(result["error"])
