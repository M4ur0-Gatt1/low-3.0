# La mano izquierda de cerca (frente: x-z; perfil: y-z) con cuadrícula de 1 cm,
# para ubicar las articulaciones de los dedos.
#   blender -b bundle.blend --python mano.py -- <cuerpo> <carpeta> <x> <y> <z>   (centro de la vista)
import bpy, math, sys
from mathutils import Vector, Matrix
a = sys.argv[sys.argv.index("--") + 1:]
cuerpo, carpeta = a[0], a[1]; c = Vector((float(a[2]), float(a[3]), float(a[4])))
N = bpy.data.objects[cuerpo]
for o in bpy.data.objects: o.hide_render = o is not N
for m in N.modifiers:
    if m.type == "MULTIRES": m.render_levels = 2
bb = [N.matrix_world @ Vector(k) for k in N.bound_box]
corr = Vector(((min(v.x for v in bb) + max(v.x for v in bb)) / 2, (min(v.y for v in bb) + max(v.y for v in bb)) / 2, min(v.z for v in bb)))
N.matrix_world = Matrix.Translation(-corr) @ N.matrix_world
def mat(n, col): m = bpy.data.materials.new(n); m.diffuse_color = col; return m
gris, rojo = mat("g", (0.5, 0.55, 0.65, 1)), mat("r", (0.9, 0.15, 0.1, 1))
def barra(p, q, r, m):
    p, q = Vector(p), Vector(q); d = q - p
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=r, depth=d.length, location=(p + q) / 2)
    o = bpy.context.object; o.rotation_euler = d.to_track_quat("Z", "Y").to_euler(); o.data.materials.append(m); o.hide_render = False
L = 0.14
for k in range(-14, 15):
    r = 0.0004 if k % 5 else 0.0008; m = rojo if k == 0 else gris
    barra((c.x - L, c.y + 0.12, c.z + k / 100), (c.x + L, c.y + 0.12, c.z + k / 100), r, m)   # frente: horizontales
    barra((c.x + k / 100, c.y + 0.12, c.z - L), (c.x + k / 100, c.y + 0.12, c.z + L), r, m)   # frente: verticales
    barra((c.x - 0.15, c.y - L, c.z + k / 100), (c.x - 0.15, c.y + L, c.z + k / 100), r, m)   # perfil: horizontales
    barra((c.x - 0.15, c.y + k / 100, c.z - L), (c.x - 0.15, c.y + k / 100, c.z + L), r, m)   # perfil: verticales
esc = bpy.context.scene
esc.render.engine = "BLENDER_WORKBENCH"; esc.display.shading.light = "STUDIO"; esc.display.shading.color_type = "MATERIAL"
esc.render.resolution_x = esc.render.resolution_y = 1000
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); esc.collection.objects.link(cam); esc.camera = cam
cam.data.type = "ORTHO"; cam.data.ortho_scale = 0.28
for nombre, pos, rot in (("frente", c + Vector((0, -2, 0)), (math.pi / 2, 0, 0)), ("perfil", c + Vector((2, 0, 0)), (math.pi / 2, 0, math.pi / 2))):
    cam.location = pos; cam.rotation_euler = rot
    esc.render.filepath = f"{carpeta}/mano-{nombre}.png"; bpy.ops.render.render(write_still=True)
print("MANO OK")
