
import bpy
import importlib.util
import json
import os
import urllib.request
from pathlib import Path


# ============================================================
# CONFIG
# ============================================================

CORE_PATH = Path(__file__).resolve().with_name("aiso_blender_agent.py")

PROMPT_TEXT_NAME = "AISO_AGENT_PROMPT"
RESPONSE_TEXT_NAME = "PRO6000_RESPONSE.py"


# IMPORTANT:
# GPT-OSS host port 8090 is confirmed.
# Other host ports still need to be confirmed from Docker.
#
# When confirmed, ONLY edit the endpoint values in this block.

MODEL_PROFILES = {
    "GPT_OSS": {
        "label": "GPT-OSS-120B",
        "endpoint": os.environ.get("AISO_BLENDER_GPT_OSS_ENDPOINT", "http://127.0.0.1:8090/v1/chat/completions"),
        "model": "gpt-oss-120b",
    },

    "DEVSTRAL": {
        "label": "Devstral-2-123B-Instruct-2512",
        "endpoint": os.environ.get("AISO_BLENDER_DEVSTRAL_ENDPOINT", "http://127.0.0.1:8060/v1/chat/completions"),
        "model": "Devstral-2-123B-Instruct-2512",
    },

    "QWEN": {
        "label": "Qwen3.8-27B",
        "endpoint": os.environ.get("AISO_BLENDER_QWEN_ENDPOINT", "http://127.0.0.1:8101/v1/chat/completions"),
        "model": "qwen3.8-27b",
    },

    "GEMMA": {
        "label": "Gemma-4-26B-A4B-it",
        "endpoint": os.environ.get("AISO_BLENDER_GEMMA_ENDPOINT", "http://127.0.0.1:8100/v1/chat/completions"),
        "model": "gemma4-thinking",
    },

    "NEMOTRON": {
        "label": "Nemotron-3-Super",
        "endpoint": os.environ.get("AISO_BLENDER_NEMOTRON_ENDPOINT", "http://127.0.0.1:8098/v1/chat/completions"),
        "model": "nemotron-3-super",
    },

    "GLM": {
        "label": "GLM-4.7-Flash-Q8",
        "endpoint": os.environ.get("AISO_BLENDER_GLM_ENDPOINT", "http://127.0.0.1:8061/v1/chat/completions"),
        "model": "GLM-4.7-Flash-Q8",
    },
}


MODEL_PROFILE_ITEMS = [
    ("GPT_OSS", "GPT-OSS-120B", ""),
    ("DEVSTRAL", "Devstral-2-123B", ""),
    ("QWEN", "Qwen3.8-27B", ""),
    ("GEMMA", "Gemma-4-26B", ""),
    ("NEMOTRON", "Nemotron-3-Super", ""),
    ("GLM", "GLM-4.7-Flash-Q8", ""),
]


DEFAULT_PROMPT = """You are a Blender AI Agent.

Generate complete executable Blender Python code.

Target:
- Blender 5.2.1 LTS
- Python 3.13
- macOS

Rules:
- Return only complete executable Python code.
- Do not use Markdown.
- Use Blender 5.2.1-compatible bpy APIs.
- Prefer Blender data APIs over context-sensitive bpy.ops.
- Ensure Blender is in Object Mode before object operations.
- Do not modify Blender UI or workspace state.
"""


# ============================================================
# CORE
# ============================================================

def load_core():
    spec = importlib.util.spec_from_file_location(
        "aiso_blender_agent_core",
        CORE_PATH,
    )

    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load core: {CORE_PATH}")

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    return module


core = load_core()


# ============================================================
# PROMPT
# ============================================================

def get_prompt_text():
    text = bpy.data.texts.get(PROMPT_TEXT_NAME)

    if text is None:
        text = bpy.data.texts.new(PROMPT_TEXT_NAME)
        text.write(DEFAULT_PROMPT)

    return text


# ============================================================
# MODEL PROFILE
# ============================================================

def apply_profile(props):
    profile = MODEL_PROFILES[props.model_profile]

    props.endpoint = profile["endpoint"]
    props.model = profile["model"]


def model_profile_updated(self, context):
    apply_profile(self)


# ============================================================
# PROPERTIES
# ============================================================

class AISOAgentProperties(bpy.types.PropertyGroup):

    model_profile: bpy.props.EnumProperty(
        name="Model Profile",
        items=MODEL_PROFILE_ITEMS,
        default="GPT_OSS",
        update=model_profile_updated,
    )

    endpoint: bpy.props.StringProperty(
        name="Endpoint",
        default=MODEL_PROFILES["GPT_OSS"]["endpoint"],
    )

    model: bpy.props.StringProperty(
        name="Model",
        default=MODEL_PROFILES["GPT_OSS"]["model"],
    )

    status: bpy.props.StringProperty(
        name="Status",
        default="Ready",
    )

    last_attempts: bpy.props.IntProperty(
        name="Last Attempts",
        default=0,
    )


# ============================================================
# OPEN PROMPT
# ============================================================

class AISO_OT_OpenPromptEditor(bpy.types.Operator):
    bl_idname = "aiso.open_prompt_editor"
    bl_label = "Open Prompt Editor"

    def execute(self, context):
        text = get_prompt_text()

        for area in context.screen.areas:
            if area.type == "TEXT_EDITOR":
                area.spaces.active.text = text
                return {"FINISHED"}

        self.report({"WARNING"}, "No Text Editor open")
        return {"CANCELLED"}


# ============================================================
# RESET PROMPT
# ============================================================

class AISO_OT_ResetPrompt(bpy.types.Operator):
    bl_idname = "aiso.reset_prompt"
    bl_label = "Reset Prompt"

    def execute(self, context):
        text = get_prompt_text()
        text.clear()
        text.write(DEFAULT_PROMPT)

        context.scene.aiso_agent.status = "Prompt Reset"

        return {"FINISHED"}


# ============================================================
# TEST CONNECTION
# ============================================================

class AISO_OT_TestConnection(bpy.types.Operator):
    bl_idname = "aiso.test_connection"
    bl_label = "Test Connection"

    def execute(self, context):
        props = context.scene.aiso_agent

        try:
            endpoint = props.endpoint.strip()

            if "PORT_" in endpoint:
                raise RuntimeError(
                    "This model host port has not been configured yet."
                )

            models_url = endpoint.replace(
                "/v1/chat/completions",
                "/v1/models",
            )

            with urllib.request.urlopen(
                models_url,
                timeout=15,
            ) as response:
                body = response.read().decode(
                    "utf-8",
                    errors="replace",
                )

            data = json.loads(body)

            models = [
                item.get("id", "")
                for item in data.get("data", [])
            ]

            props.status = "Connected"

            if models:
                self.report(
                    {"INFO"},
                    f"Connected: {', '.join(models[:3])}",
                )
            else:
                self.report(
                    {"INFO"},
                    "Endpoint connected",
                )

            return {"FINISHED"}

        except Exception as exc:
            props.status = "Connection Failed"
            self.report({"ERROR"}, str(exc))

            return {"CANCELLED"}


# ============================================================
# GENERATE
# ============================================================

class AISO_OT_GenerateScene(bpy.types.Operator):
    bl_idname = "aiso.generate_scene"
    bl_label = "Generate Scene"

    def execute(self, context):
        props = context.scene.aiso_agent

        try:
            if "PORT_" in props.endpoint:
                raise RuntimeError(
                    "Selected model host port has not been configured."
                )

            prompt = get_prompt_text().as_string().strip()

            if not prompt:
                raise RuntimeError("Prompt is empty")

            props.status = "Generating..."

            result = core.run_agent(
                prompt,
                max_repair_attempts=core.MAX_REPAIR_ATTEMPTS,
                endpoint=props.endpoint,
                model=props.model,
            )

            if isinstance(result, dict):
                attempts = result.get("attempts", 0)
                success = result.get("success", False)

                props.last_attempts = attempts

                if success:
                    props.status = f"Success · Attempts {attempts}"
                    return {"FINISHED"}

                props.status = "Failed"

                error = result.get("error")

                if error:
                    print(error)

                return {"CANCELLED"}

            props.status = "Success"
            return {"FINISHED"}

        except Exception as exc:
            import traceback

            traceback.print_exc()

            props.status = "Connection / Agent Error"

            self.report({"ERROR"}, str(exc))

            return {"CANCELLED"}


# ============================================================
# PREVIEW CODE
# ============================================================

class AISO_OT_PreviewCode(bpy.types.Operator):
    bl_idname = "aiso.preview_code"
    bl_label = "Preview Code"

    def execute(self, context):
        text = bpy.data.texts.get(RESPONSE_TEXT_NAME)

        if text is None:
            self.report({"WARNING"}, "No generated code")
            return {"CANCELLED"}

        for area in context.screen.areas:
            if area.type == "TEXT_EDITOR":
                area.spaces.active.text = text
                return {"FINISHED"}

        self.report({"WARNING"}, "No Text Editor open")
        return {"CANCELLED"}


# ============================================================
# RENDER
# ============================================================

class AISO_OT_RenderScene(bpy.types.Operator):
    bl_idname = "aiso.render_scene"
    bl_label = "Render"

    def execute(self, context):
        bpy.ops.render.render("INVOKE_DEFAULT")

        context.scene.aiso_agent.status = "Render Started"

        return {"FINISHED"}


# ============================================================
# CLEAR SCENE
# ============================================================

class AISO_OT_ClearScene(bpy.types.Operator):
    bl_idname = "aiso.clear_scene"
    bl_label = "Clear Scene"

    def invoke(self, context, event):
        return context.window_manager.invoke_confirm(self, event)

    def execute(self, context):
        if context.object is not None:
            if context.object.mode != "OBJECT":
                bpy.ops.object.mode_set(mode="OBJECT")

        for obj in list(bpy.data.objects):
            bpy.data.objects.remove(
                obj,
                do_unlink=True,
            )

        context.scene.aiso_agent.status = "Scene Cleared"

        return {"FINISHED"}


# ============================================================
# CLEAR CONSOLE
# ============================================================

class AISO_OT_ClearConsole(bpy.types.Operator):
    bl_idname = "aiso.clear_console"
    bl_label = "Clear Console"

    def execute(self, context):
        for area in context.screen.areas:
            if area.type == "CONSOLE":
                with context.temp_override(area=area):
                    bpy.ops.console.clear()

                context.scene.aiso_agent.status = "Console Cleared"

                return {"FINISHED"}

        self.report({"WARNING"}, "No Console open")
        return {"CANCELLED"}


# ============================================================
# PANEL
# ============================================================

class AISO_PT_Panel(bpy.types.Panel):

    bl_label = "AISO AI"
    bl_idname = "AISO_PT_panel"

    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "AISO AI"

    def draw(self, context):
        layout = self.layout
        props = context.scene.aiso_agent

        prompt = get_prompt_text()

        layout.label(text="PRO6000 Blender Agent")
        layout.label(text="Multi-Model · Blender 5.2.1")

        model_box = layout.box()

        model_box.label(text="Model Profile")

        model_box.prop(
            props,
            "model_profile",
            text="",
        )

        connection_box = layout.box()

        connection_box.label(text="Connection")

        connection_box.label(
            text=f"Endpoint: {props.endpoint}"
        )

        connection_box.label(
            text=f"Model: {props.model}"
        )

        connection_box.operator(
            "aiso.test_connection",
            text="Test Connection",
            icon="URL",
        )

        prompt_box = layout.box()

        prompt_box.label(text="Prompt")

        prompt_box.label(
            text=f"{len(prompt.as_string())} characters"
        )

        prompt_box.operator(
            "aiso.open_prompt_editor",
            text="Open Prompt Editor",
            icon="TEXT",
        )

        prompt_box.operator(
            "aiso.reset_prompt",
            text="Reset Prompt",
            icon="FILE_REFRESH",
        )

        agent_box = layout.box()

        agent_box.label(text="Agent")

        agent_box.operator(
            "aiso.generate_scene",
            text="Generate Scene",
            icon="PLAY",
        )

        agent_box.operator(
            "aiso.preview_code",
            text="Preview Code",
            icon="SCRIPT",
        )

        scene_box = layout.box()

        scene_box.label(text="Scene")

        scene_box.operator(
            "aiso.render_scene",
            text="Render",
            icon="RENDER_STILL",
        )

        row = scene_box.row(align=True)

        row.operator(
            "aiso.clear_scene",
            text="Clear Scene",
            icon="TRASH",
        )

        row.operator(
            "aiso.clear_console",
            text="Clear Console",
            icon="CONSOLE",
        )

        status_box = layout.box()

        status_box.label(text="Status")
        status_box.label(text=props.status)

        status_box.label(
            text=f"Last Attempts: {props.last_attempts}"
        )


# ============================================================
# REGISTER
# ============================================================

CLASSES = (
    AISOAgentProperties,
    AISO_OT_OpenPromptEditor,
    AISO_OT_ResetPrompt,
    AISO_OT_TestConnection,
    AISO_OT_GenerateScene,
    AISO_OT_PreviewCode,
    AISO_OT_RenderScene,
    AISO_OT_ClearScene,
    AISO_OT_ClearConsole,
    AISO_PT_Panel,
)


def register():
    for cls in CLASSES:
        bpy.utils.register_class(cls)

    bpy.types.Scene.aiso_agent = bpy.props.PointerProperty(
        type=AISOAgentProperties
    )

    get_prompt_text()


def unregister():
    if hasattr(bpy.types.Scene, "aiso_agent"):
        del bpy.types.Scene.aiso_agent

    for cls in reversed(CLASSES):
        try:
            bpy.utils.unregister_class(cls)
        except RuntimeError:
            pass


if __name__ == "__main__":
    try:
        unregister()
    except Exception:
        pass

    register()
