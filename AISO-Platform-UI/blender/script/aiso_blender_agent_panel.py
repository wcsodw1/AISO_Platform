import bpy
import importlib.util
from pathlib import Path

CORE_PATH = Path(__file__).resolve().with_name("aiso_blender_agent.py")

spec = importlib.util.spec_from_file_location(
    "aiso_blender_agent_core",
    CORE_PATH
)

core = importlib.util.module_from_spec(spec)
spec.loader.exec_module(core)


class AISOAgentProperties(bpy.types.PropertyGroup):
    prompt: bpy.props.StringProperty(
        name="Prompt",
        default="Create a premium compact AI workstation product scene.",
    )

    status: bpy.props.StringProperty(
        name="Status",
        default="Ready",
    )

    endpoint: bpy.props.StringProperty(
        name="Endpoint",
        description="OpenAI-compatible chat completions endpoint",
        default=core.ENDPOINT,
    )

    model: bpy.props.StringProperty(
        name="Model",
        default=core.MODEL,
    )

    max_repair_attempts: bpy.props.IntProperty(
        name="Auto-Repair",
        description="Maximum traceback-guided repair attempts",
        default=core.MAX_REPAIR_ATTEMPTS,
        min=0,
        max=4,
    )


class AISO_OT_GenerateScene(bpy.types.Operator):
    bl_idname = "aiso.generate_scene"
    bl_label = "Generate Scene"

    def execute(self, context):
        props = context.scene.aiso_agent
        task = props.prompt.strip()

        if not task:
            self.report({"ERROR"}, "Prompt is empty")
            return {"CANCELLED"}

        props.status = "Generating..."

        try:
            result = core.run_agent(
                task,
                max_repair_attempts=props.max_repair_attempts,
                endpoint=props.endpoint,
                model=props.model,
            )
        except Exception as error:
            props.status = "Connection failed"
            print(f"AISO Blender Agent: {error}")
            self.report({"ERROR"}, "Agent request failed. See Console.")
            return {"CANCELLED"}

        if result["success"]:
            props.status = (
                f"Success · Attempts {result['attempts']}"
            )

            self.report(
                {"INFO"},
                f"Scene generated in "
                f"{result['attempts']} attempt(s)"
            )

            return {"FINISHED"}

        props.status = "Failed"
        print(result.get("error", "Unknown error"))

        self.report(
            {"ERROR"},
            "Generation failed. See Console."
        )

        return {"CANCELLED"}


class AISO_OT_PreviewCode(bpy.types.Operator):
    bl_idname = "aiso.preview_code"
    bl_label = "Preview Code"

    def execute(self, context):
        text = bpy.data.texts.get("PRO6000_RESPONSE.py")

        if not text:
            self.report(
                {"WARNING"},
                "No generated code yet"
            )
            return {"CANCELLED"}

        context.area.type = "TEXT_EDITOR"
        context.area.spaces.active.text = text

        return {"FINISHED"}


class AISO_OT_RenderScene(bpy.types.Operator):
    bl_idname = "aiso.render_scene"
    bl_label = "Render"

    def execute(self, context):
        bpy.ops.render.render("INVOKE_DEFAULT")
        return {"FINISHED"}


class AISO_OT_ClearConsole(bpy.types.Operator):
    bl_idname = "aiso.clear_console"
    bl_label = "Clear Console"

    def execute(self, context):
        for area in context.screen.areas:
            if area.type == "CONSOLE":
                with context.temp_override(area=area):
                    bpy.ops.console.clear()

        return {"FINISHED"}


class AISO_PT_Panel(bpy.types.Panel):
    bl_label = "AISO AI"
    bl_idname = "AISO_PT_panel"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "AISO AI"

    def draw(self, context):
        layout = self.layout
        props = context.scene.aiso_agent

        header = layout.row(align=True)
        header.label(text="Blender AI Agent", icon="NODE_MATERIAL")
        header.label(text=props.status, icon="CHECKMARK" if props.status.startswith("Success") else "INFO")

        layout.separator()

        connection = layout.box()
        connection.label(text="Inference", icon="NETWORK_DRIVE")
        connection.prop(props, "endpoint")
        connection.prop(props, "model")
        connection.prop(props, "max_repair_attempts")

        layout.separator()

        prompt_box = layout.box()
        prompt_box.label(text="Scene Request", icon="OUTLINER_OB_FONT")
        prompt_box.prop(props, "prompt", text="")

        primary = layout.column(align=True)
        primary.operator(
            "aiso.generate_scene",
            text="Generate Scene",
            icon="PLAY",
        )

        tools = layout.row(align=True)
        tools.operator(
            "aiso.preview_code",
            text="Preview Code",
            icon="TEXT",
        )

        tools.operator(
            "aiso.render_scene",
            text="Render",
            icon="RENDER_STILL",
        )

        layout.operator(
            "aiso.clear_console",
            text="Clear Console",
            icon="TRASH",
        )


classes = (
    AISOAgentProperties,
    AISO_OT_GenerateScene,
    AISO_OT_PreviewCode,
    AISO_OT_RenderScene,
    AISO_OT_ClearConsole,
    AISO_PT_Panel,
)


def register():
    for cls in classes:
        bpy.utils.register_class(cls)

    bpy.types.Scene.aiso_agent = (
        bpy.props.PointerProperty(
            type=AISOAgentProperties
        )
    )


def unregister():
    if hasattr(
        bpy.types.Scene,
        "aiso_agent",
    ):
        del bpy.types.Scene.aiso_agent

    for cls in reversed(classes):
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
