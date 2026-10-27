# Vistas ortogonales de un cuerpo con cuadrícula (cada 5 cm; cada 10 cm más gruesa;
# el piso y el centro en rojo), para ubicar las articulaciones a ojo.
#   blender -b bundle.blend --python vistas.py -- <cuerpo> <nivel multires> <carpeta salida> [juntas.json]
# Con juntas.json dibuja una esfera en cada articulación (para verificarlas).
import bpy, json, math, sys
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:]
cuerpo, nivel, carpeta = args[0], int(args[1]), args[2]
juntas = json.load(open(args[3])) if len(args) > 3 else None

N = bpy.data.objects[cuerpo]
# solo el cuerpo a la vista
for o in bpy.data.objects:
    o.hide_render = o is not N
for m in N.modifiers:
    if m.type == "MULTIRES": m.render_levels = nivel; m.levels = nivel
bb = [N.matrix_world @ Vector(c) for c in N.bound_box]
cx = (min(v.x for v in bb) + max(v.x for v in bb)) / 2
cy = (min(v.y for v in bb) + max(v.y for v in bb)) / 2
z0 = min(v.z for v in bb)
N.location.x -= cx; N.location.y -= cy; N.location.z -= z0

def material(nombre, color):
    m = bpy.data.materials.new(nombre); m.diffuse_color = color; return m
gris, rojo, azul = material("g", (0.55, 0.6, 0.7, 1)), material("r", (0.9, 0.15, 0.1, 1)), material("a", (0.1, 0.5, 1, 1))
def barra(a, b, r, mat):
    a, b = Vector(a), Vector(b); d = b - a
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=r, depth=d.length, location=(a + b) / 2)
    o = bpy.context.object; o.rotation_euler = d.to_track_quat("Z", "Y").to_euler(); o.data.materials.append(mat); o.hide_render = False
    return o
# cuadrícula de frente (plano y = 0.3, detrás del cuerpo) y de perfil (plano x = -0.6)
for k in range(0, 40):
    z = k * 0.05; r = 0.0016 if k % 2 else 0.003; mat = rojo if k == 0 else gris
    barra((-0.9, 0.3, z), (0.9, 0.3, z), r, mat); barra((-0.6, -0.4, z), (-0.6, 0.4, z), r, mat)
for k in range(-18, 19):
    x = k * 0.05; r = 0.0016 if k % 2 else 0.003; mat = rojo if k == 0 else gris
    barra((x, 0.3, 0), (x, 0.3, 1.95), r, mat)
for k in range(-8, 9):
    y = k * 0.05; r = 0.0016 if k % 2 else 0.003; mat = rojo if k == 0 else gris
    barra((-0.6, y, 0), (-0.6, y, 1.95), r, mat)
if juntas:
    for nombre, p in juntas.items():
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.012, location=p); s = bpy.context.object; s.data.materials.append(azul); s.hide_render = False

esc = bpy.context.scene
esc.render.engine = "BLENDER_WORKBENCH"
esc.display.shading.light = "STUDIO"; esc.display.shading.color_type = "MATERIAL"
esc.display.shading.show_xray = bool(juntas); esc.display.shading.xray_alpha = 0.55
esc.render.resolution_x, esc.render.resolution_y = 1100, 1100
esc.render.film_transparent = False
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); esc.collection.objects.link(cam); esc.camera = cam
cam.data.type = "ORTHO"; cam.data.ortho_scale = 2.0
for nombre, pos, rot in (("frente", (0, -4, 0.98), (math.pi / 2, 0, 0)), ("perfil", (4, 0, 0.98), (math.pi / 2, 0, math.pi / 2))):
    cam.location = pos; cam.rotation_euler = rot
    esc.render.filepath = f"{carpeta}/{cuerpo}-n{nivel}-{nombre}.png"
    bpy.ops.render.render(write_still=True)
print("VISTAS OK", cuerpo, "nivel", nivel)
