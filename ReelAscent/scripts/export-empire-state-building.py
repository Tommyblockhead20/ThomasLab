"""Export the UV-textured building from the original packed Blender source.

Run with Blender 2.83+:
  blender -b third_party/empire-state-building/empire-state-building.blend \
    --python scripts/export-empire-state-building.py -- OUTPUT.glb

The original .blend is read-only; this changes only the in-memory shader graph so
glTF can carry its image texture. The original Blender Mix Shader/Invert graph is
not directly expressible as a glTF material.
"""

import bpy
import sys


output = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else None
if not output:
    raise RuntimeError("Provide an output .glb path after --")

building = bpy.data.objects.get("ESB")
facade = bpy.data.images.get("UV_ESB_DAY.png")
if building is None or facade is None or not facade.packed_file:
    raise RuntimeError("The Blender source must contain ESB and its packed UV_ESB_DAY.png image")
if not building.data.uv_layers:
    raise RuntimeError("ESB has no UV map; exporting a texture would not be meaningful")

windows = bpy.data.materials["windows"]
windows.use_nodes = True
nodes = windows.node_tree.nodes
nodes.clear()
links = windows.node_tree.links
output_node = nodes.new("ShaderNodeOutputMaterial")
shader = nodes.new("ShaderNodeBsdfPrincipled")
shader.inputs["Roughness"].default_value = 0.88
texture = nodes.new("ShaderNodeTexImage")
texture.image = facade
links.new(texture.outputs["Color"], shader.inputs["Base Color"])
links.new(shader.outputs["BSDF"], output_node.inputs["Surface"])

bpy.ops.object.select_all(action="DESELECT")
building.select_set(True)
bpy.context.view_layer.objects.active = building
bpy.ops.export_scene.gltf(filepath=output, export_format="GLB", use_selection=True)
print("EXPORTED_TEXTURED_ESB", output, facade.name, tuple(facade.size))
