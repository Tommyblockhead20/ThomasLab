"""Re-export the supplied Empire State Building with explicit opaque materials."""

from pathlib import Path

import bpy


REPO_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_PATH = REPO_ROOT / "public" / "assets" / "models" / "empire-state-building.glb"


def configure_principled_material(material, base_color, roughness, metallic, emission):
    material.use_nodes = True
    material.diffuse_color = (*base_color, 1.0)
    material.blend_method = "OPAQUE"
    material.use_screen_refraction = False
    if hasattr(material, "show_transparent_back"):
        material.show_transparent_back = False

    # Rebuild the tiny node graph instead of mutating the source graph: the supplied
    # materials contain additional emission nodes that otherwise keep winning export.
    material.node_tree.nodes.clear()
    output = material.node_tree.nodes.new("ShaderNodeOutputMaterial")
    principled = material.node_tree.nodes.new("ShaderNodeBsdfPrincipled")
    material.node_tree.links.new(principled.outputs["BSDF"], output.inputs["Surface"])
    values = {
        "Base Color": (*base_color, 1.0),
        "Roughness": roughness,
        "Metallic": metallic,
        "Emission": (*emission, 1.0),
        "Alpha": 1.0,
    }
    for name, value in values.items():
        socket = principled.inputs.get(name)
        if socket is not None:
            socket.default_value = value


building = bpy.data.objects.get("ESB")
if building is None:
    raise RuntimeError("The supplied Blender file does not contain the expected ESB object")

# The source's two materials exported with no PBR base color and near-white emissive
# output, which made the entire facade render as a washed-out ghost in PlayCanvas.
windows = bpy.data.materials.get("windows")
light = bpy.data.materials.get("light")
if windows is None or light is None:
    raise RuntimeError("The supplied ESB materials were not found")

# Bake the source object's non-uniform scale and offset into the complete original
# mesh before export. PlayCanvas applies runtime scale to the instantiated root; leaving
# Blender's transform on that same root meant runtime placement overwrote it, shrinking,
# widening, and offsetting the actual architecture.
bpy.ops.object.select_all(action="DESELECT")
building.select_set(True)
bpy.context.view_layer.objects.active = building
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# Normalize the asset pivot from the complete mesh bounds: footprint center at X/Y zero,
# lowest source vertex at Z zero. No vertices or faces are removed or simplified.
minimum = [min(vertex.co[axis] for vertex in building.data.vertices) for axis in range(3)]
maximum = [max(vertex.co[axis] for vertex in building.data.vertices) for axis in range(3)]
center_x = (minimum[0] + maximum[0]) * 0.5
center_y = (minimum[1] + maximum[1]) * 0.5
base_z = minimum[2]
for vertex in building.data.vertices:
    vertex.co.x -= center_x
    vertex.co.y -= center_y
    vertex.co.z -= base_z
building.data.update()

configure_principled_material(
    windows,
    base_color=(0.25, 0.29, 0.31),
    roughness=0.72,
    metallic=0.06,
    emission=(0.0, 0.0, 0.0),
)
configure_principled_material(
    light,
    base_color=(0.56, 0.44, 0.13),
    roughness=0.48,
    metallic=0.18,
    emission=(0.035, 0.025, 0.004),
)

OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=str(OUTPUT_PATH),
    export_format="GLB",
    use_selection=True,
    export_apply=True,
    export_materials=True,
    export_texcoords=True,
    export_normals=True,
    export_colors=True,
)
dimensions = building.dimensions
print(
    "[reel-ascent] source-detail audit: "
    f"{len(building.data.vertices)} vertices, {len(building.data.polygons)} polygons, "
    f"bounds {dimensions.x:.6f} x {dimensions.y:.6f} x {dimensions.z:.6f}"
)
print(f"[reel-ascent] exported opaque Empire State Building to {OUTPUT_PATH}")
