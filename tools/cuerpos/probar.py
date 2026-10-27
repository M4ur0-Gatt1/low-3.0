# Abre el .glb exportado en una escena vacía y lo dibuja en pose T y posado
# (brazos abajo, un codo doblado, una rodilla doblada), de frente y en 3/4.
#   blender -b --factory-startup --python probar.py -- <in.glb> <carpeta> <prefijo>
import bpy, math, sys
from mathutils import Euler, Quaternion, Vector

glb, carpeta, pref = sys.argv[sys.argv.index("--") + 1:][:3]
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.import_scene.gltf(filepath=glb)
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
esc = bpy.context.scene
esc.render.engine = "BLENDER_WORKBENCH"; esc.display.shading.light = "STUDIO"; esc.display.shading.color_type = "SINGLE"
esc.display.shading.single_color = (0.8, 0.78, 0.74)
esc.render.resolution_x, esc.render.resolution_y = 900, 1000
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); esc.collection.objects.link(cam); esc.camera = cam
cam.data.type = "ORTHO"; cam.data.ortho_scale = 2.0

def foto(nombre, giro):
    a = math.radians(giro)
    cam.location = (4 * math.sin(a), -4 * math.cos(a), 0.95); cam.rotation_euler = (math.pi / 2, 0, a)
    esc.render.filepath = f"{carpeta}/{pref}-{nombre}.png"; bpy.ops.render.render(write_still=True)

foto("T-frente", 0); foto("T-34", 35)
bpy.context.view_layer.objects.active = arm; bpy.ops.object.mode_set(mode="POSE")
def girar(hueso, eje_mundo, grados):
    pb = arm.pose.bones[hueso]
    m = arm.matrix_world.to_3x3() @ pb.matrix.to_3x3()        # orientación del hueso en el mundo
    eje_local = (m.inverted() @ Vector(eje_mundo)).normalized()
    pb.rotation_mode = "QUATERNION"
    pb.rotation_quaternion = pb.rotation_quaternion @ Quaternion(eje_local, math.radians(grados))
    bpy.context.view_layer.update()
girar("upperarm_l", (0, 1, 0), 70); girar("upperarm_r", (0, 1, 0), -70)
girar("lowerarm_l", (0, 0, 1), 60)
girar("thigh_r", (1, 0, 0), -35); girar("calf_r", (1, 0, 0), 60)
girar("Head", (0, 0, 1), 25)
for d in ("index", "middle", "ring", "pinky"):          # la mano derecha, cerrada
    for k in ("01", "02", "03"):
        pb = arm.pose.bones[f"{d}_{k}_r"]; pb.rotation_mode = "QUATERNION"
        pb.rotation_quaternion = Quaternion((0, 0, 1), math.radians(55))
bpy.context.view_layer.update()
bpy.ops.object.mode_set(mode="OBJECT")
foto("pose-frente", 0); foto("pose-34", 35)
print("PRUEBA OK")
