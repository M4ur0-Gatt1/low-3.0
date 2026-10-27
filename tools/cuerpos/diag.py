# Busca dónde se rompe la piel al posar: aristas que se estiran mucho con los brazos abajo,
# y los pesos de sus puntas.   blender -b --factory-startup --python diag.py -- <in.glb>
import bpy, math, sys
from mathutils import Quaternion, Vector
glb = sys.argv[sys.argv.index("--") + 1]
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.import_scene.gltf(filepath=glb)
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
N = max((o for o in bpy.data.objects if o.type == "MESH"), key=lambda o: len(o.data.vertices))
me = N.data
print("DIAG malla", len(me.vertices), "v · islas?", "aristas", len(me.edges))
# puntos repetidos en el mismo lugar (costuras del glTF) con pesos distintos
from mathutils import kdtree
kd = kdtree.KDTree(len(me.vertices))
for v in me.vertices: kd.insert(v.co, v.index)
kd.balance()
def pesos(v): return {N.vertex_groups[g.group].name: round(g.weight, 2) for g in v.groups if g.weight > 0.02}
rep = 0; malos = 0
for v in me.vertices:
    for (co, j, d) in kd.find_range(v.co, 1e-5):
        if j > v.index:
            rep += 1
            a, b = pesos(v), pesos(me.vertices[j])
            if any(abs(a.get(k, 0) - b.get(k, 0)) > 0.1 for k in set(a) | set(b)):
                malos += 1
                if malos <= 5: print("DIAG costura con pesos distintos", [round(x, 3) for x in v.co], a, b)
print("DIAG puntos repetidos", rep, "· con pesos distintos", malos)
rest = [N.matrix_world @ v.co for v in me.vertices]
bpy.context.view_layer.objects.active = arm; bpy.ops.object.mode_set(mode="POSE")
def girar(hueso, eje_mundo, grados):
    pb = arm.pose.bones[hueso]
    m = arm.matrix_world.to_3x3() @ pb.matrix.to_3x3()
    pb.rotation_mode = "QUATERNION"
    pb.rotation_quaternion = pb.rotation_quaternion @ Quaternion((m.inverted() @ Vector(eje_mundo)).normalized(), math.radians(grados))
    bpy.context.view_layer.update()
girar("upperarm_l", (0, 1, 0), 70); girar("upperarm_r", (0, 1, 0), -70)
bpy.ops.object.mode_set(mode="OBJECT")
dg = bpy.context.evaluated_depsgraph_get(); ev = N.evaluated_get(dg).to_mesh()
pos = [N.matrix_world @ v.co for v in ev.vertices]
peor = []
for e in me.edges:
    a, b = e.vertices; l0 = (rest[a] - rest[b]).length
    if l0 < 0.004: continue                 # las astillas del reductor no cuentan
    r = (pos[a] - pos[b]).length / l0
    if r > 1.6 or r < 0.4: peor.append((r, a, b))
peor.sort(reverse=True)
print("DIAG aristas rotas", len(peor))
for r, a, b in peor[:8]:
    print("DIAG", round(r, 2), [round(x, 3) for x in rest[a]], pesos(me.vertices[a]), "|", pesos(me.vertices[b]))
print("DIAG OK")
