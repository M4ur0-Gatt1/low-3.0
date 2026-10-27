# EL CUERPO REALISTA CON EL ESQUELETO DEL TALLER (Human Base Meshes de Blender Studio, CC0)
#
#   blender -b bundle.blend --python rig.py -- <hombre.glb del Taller> <cuerpo> <juntas.json> <salida.glb> <tris objetivo>
#
# El esqueleto final es el del Taller (los mismos 65 huesos, con la MISMA orientación
# de cada hueso, en pose T): sólo cambian los lugares de las articulaciones. Así las
# poses y las animaciones del Taller (rotaciones locales de cada hueso) valen igual.
#   1. Las articulaciones de la malla (juntas.json, medidas en las vistas con
#      cuadrícula) se afinan con el centro de la sección del miembro.
#   2. El esqueleto R (pose T) y su copia RA, con brazos y piernas girados a la pose
#      de la malla (A).
#   3. Pesos automáticos (calor de huesos) contra RA; RA se posa de vuelta a T y la
#      malla queda en pose T, con el detalle del Multires aplicado y reducida.
#   4. La malla (y sus ojos) pasan a R y se exporta el .glb.
import bpy, json, sys, math
from mathutils import Vector, Matrix

glb, cuerpo, juntas_json, salida, tris_obj = sys.argv[sys.argv.index("--") + 1:][:5]
tris_obj = int(tris_obj)
J = {k: Vector(v) for k, v in json.load(open(juntas_json)).items()}
def log(*a): print("RIG:", *a, flush=True)

# ── la malla: al centro y al piso (con sus ojos) ─────────────────────────────
N = bpy.data.objects[cuerpo]
ojos = [o for o in bpy.data.objects if o.name.startswith(cuerpo + ".eye.")]
bb = [N.matrix_world @ Vector(c) for c in N.bound_box]
corr = Vector(((min(v.x for v in bb) + max(v.x for v in bb)) / 2, (min(v.y for v in bb) + max(v.y for v in bb)) / 2, min(v.z for v in bb)))
for o in [N] + ojos:
    o.matrix_world = Matrix.Translation(-corr) @ o.matrix_world
bpy.context.view_layer.update()
for o in bpy.data.objects:
    o.select_set(False)
for o in [N] + ojos:
    o.select_set(True)
bpy.context.view_layer.objects.active = N
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
P = [v.co.copy() for v in N.data.vertices]          # nivel base, ya centrado
log("malla", cuerpo, len(P), "vértices · alto", round(max(p.z for p in P), 3))

def centro_cerca(c, r, lado=None):
    pts = [p for p in P if (p - c).length < r and (lado is None or p.x * lado > 0)]
    if len(pts) < 8: return c
    s = Vector((0, 0, 0))
    for p in pts: s += p
    return s / len(pts)

# afinar las articulaciones de los miembros (izquierda: +x) y espejar a la derecha
# (el tobillo no: el centro de lo que lo rodea se va hacia el pie; medido: 2,3 cm afuera)
for nombre, r in (("lowerarm_l", 0.05), ("hand_l", 0.035), ("calf_l", 0.06)):
    antes = J[nombre].copy(); c = centro_cerca(J[nombre], r, 1)
    J[nombre] = Vector((c.x, c.y, antes.z)) if nombre in ("calf_l",) else c
    log("afinado", nombre, [round(x, 3) for x in antes], "->", [round(x, 3) for x in J[nombre]])
for k in list(J):
    if k.endswith("_l"):
        v = J[k]; J[k[:-2] + "_r"] = Vector((-v.x, v.y, v.z))

# ── el esqueleto del Taller ───────────────────────────────────────────────────
previos = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=glb)
importados = [o for o in bpy.data.objects if o not in previos]
Q = next(o for o in importados if o.type == "ARMATURE")
for o in importados:
    if o.type == "MESH": bpy.data.objects.remove(o, do_unlink=True)
QW = Q.matrix_world.copy()
qb = {b.name: b for b in Q.data.bones}
qhead = {n: QW @ b.head_local for n, b in qb.items()}
qtail = {n: QW @ b.tail_local for n, b in qb.items()}
escala = max(p.z for p in P) / max(qtail["Head"].z, qhead["Head"].z + 0.1)
log("esqueleto del Taller:", len(qb), "huesos · escala general", round(escala, 3))

def cadena(raiz):
    out = []; pila = [qb[raiz]]
    while pila:
        b = pila.pop(); out.append(b.name); pila.extend(b.children)
    return out
# giro de cada miembro: de la dirección del Taller (pose T) a la de la malla (pose A)
giros = {}
for lado in ("l", "r"):
    for raiz, fin in (("upperarm", "hand"), ("thigh", "foot")):
        a, b = raiz + "_" + lado, fin + "_" + lado
        dq = (qhead[b] - qhead[a]).normalized(); dn = (J[b] - J[a]).normalized()
        giros[a] = dq.rotation_difference(dn)
        log("giro", a, round(math.degrees(giros[a].angle), 1), "°")

# las articulaciones en pose T (R): lo de la malla, con los miembros girados a T
cabezaR = {}
def en_T(n, p):
    for raiz, q in giros.items():
        if n in cadena(raiz):
            piv = J[raiz]
            return piv + q.inverted() @ (p - piv)
    return p
for n in qb:
    if n in J: cabezaR[n] = en_T(n, J[n])
# los huesos sin medida (dedos, puntas): la forma del Taller, escalada desde su padre
def escala_de(n):
    if any(n.startswith(x) for x in ("thumb", "index", "middle", "ring", "pinky")) or n.startswith("hand"):
        lado = n[-1]; hq = (qhead["middle_04_leaf_" + lado] - qhead["hand_" + lado]).length
        mano = 0.19 * max(p.z for p in P) / 1.7      # de la muñeca a la punta del dedo medio, en la malla
        return mano / hq
    return escala
orden = []; pila = [b for b in Q.data.bones if not b.parent]
while pila:
    b = pila.pop(0); orden.append(b.name); pila.extend(b.children)
for n in orden:
    if n in cabezaR: continue
    b = qb[n]
    if b.parent is None: cabezaR[n] = qhead[n] * escala; continue
    p = b.parent.name
    cabezaR[n] = cabezaR[p] + (qhead[n] - qhead[p]) * escala_de(n)

# las falanges (medidas en la vista de la mano): cada hueso apunta a la articulación
# siguiente, así el dedo dobla sobre su eje y los pesos siguen al dedo de la malla
DEDOS = ("thumb", "index", "middle", "ring", "pinky")
direccion = {}
for n in qb:
    if not n.startswith(DEDOS) or n not in J: continue
    hijos = [c.name for c in qb[n].children if c.name in J]
    if hijos: direccion[n] = cabezaR[hijos[0]] - cabezaR[n]
    elif qb[n].parent and qb[n].parent.name in direccion: direccion[n] = direccion[qb[n].parent.name].normalized() * 0.008

def largo(n):
    if n in direccion: return direccion[n].length
    lq = (qtail[n] - qhead[n]).length
    if n == "Head": return 0.2 * max(p.z for p in P) / 1.7
    return lq * escala_de(n)

def armar(nombre, girado):
    """Una copia del esqueleto del Taller con las articulaciones de la malla.
    girado: brazos y piernas en la pose de la malla (para los pesos)."""
    data = Q.data.copy(); ob = bpy.data.objects.new(nombre, data)
    bpy.context.scene.collection.objects.link(ob); ob.matrix_world = QW
    for o in bpy.data.objects: o.select_set(False)
    bpy.context.view_layer.objects.active = ob; ob.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    inv = QW.inverted(); rot_inv = inv.to_3x3()
    eb = data.edit_bones
    for e in eb: e.use_connect = False
    for e in eb:
        n = e.name
        M = (QW @ qb[n].matrix_local).to_3x3()          # orientación del Taller (en el mundo)
        if n in direccion:                              # la falange, girada lo mínimo hacia su dedo
            M = M.col[1].rotation_difference(direccion[n]).to_matrix() @ M
        h = cabezaR[n]
        if girado:
            for raiz, q in giros.items():
                if n in cadena(raiz):
                    piv = J[raiz]; h = piv + q @ (h - piv); M = q.to_matrix() @ M; break
        y = M.col[1].normalized(); z = M.col[2].normalized()
        cola = h + y * largo(n)
        e.head = inv @ h; e.tail = inv @ cola
        e.align_roll(rot_inv @ z)
    bpy.ops.object.mode_set(mode="OBJECT")
    return ob

R = armar("Armature", False)
RA = armar("ArmaturePoseA", True)
log("esqueletos armados")

# ── pesos con los brazos y piernas como en la malla ──────────────────────────
for m in N.modifiers:
    if m.type == "MULTIRES": m.levels = 2; m.sculpt_levels = 2; m.render_levels = 2
for o in bpy.data.objects: o.select_set(False)
N.select_set(True); RA.select_set(True); bpy.context.view_layer.objects.active = RA
bpy.ops.object.parent_set(type="ARMATURE_AUTO")
grupos = [g.name for g in N.vertex_groups]
usados = set()
for i in range(0, len(N.data.vertices), 3):
    for x in N.data.vertices[i].groups:
        if x.weight > 0.01: usados.add(x.group)
vacios = [g.name for g in N.vertex_groups if g.index not in usados]
log("pesos automáticos:", len(grupos), "grupos · sin peso:", len(vacios), vacios[:12])

# ── limpiar los pesos ─────────────────────────────────────────────────────────
# El calor de los huesos no llega a algunos puntos (la axila con el brazo pegado al
# cuerpo, en pose A): quedaban quietos y al bajar el brazo el pecho se cortaba.
# Cada punto sin peso toma los del vecino más cercano que sí tiene.
from mathutils import kdtree
me = N.data
def total(v): return sum(g.weight for g in v.groups)
con = [v.index for v in me.vertices if total(v) > 0.01]
sin = [v.index for v in me.vertices if total(v) <= 0.01]
kd = kdtree.KDTree(len(con))
for i in con: kd.insert(me.vertices[i].co, i)
kd.balance()
for i in sin:
    _, j, _ = kd.find(me.vertices[i].co)
    for g in me.vertices[j].groups:
        N.vertex_groups[g.group].add([i], g.weight, "REPLACE")
log("puntos sin peso:", len(sin), "-> tomaron el peso del vecino")

# El calor se filtra: en pose A el brazo cuelga junto al torso y la mano junto al muslo,
# y el pecho, la cintura y el muslo heredaban un 4-7 % del brazo (y la cintura, del muslo).
# Poco, pero lejos de la articulación: al bajar el brazo esos puntos se movían un cm y
# sus vecinos no. Cada región se queda con sus huesos; en el borde, el peso se apaga suave.
def clamp(t): return max(0.0, min(1.0, t))
BRAZO = ("upperarm", "lowerarm", "hand", "thumb", "index", "middle", "ring", "pinky")
PIERNA = ("thigh", "calf", "foot", "ball")
nombre_g = {g.index: g.name for g in N.vertex_groups}
hombro = J["upperarm_l"]
quitados = 0
for v in me.vertices:
    w = {nombre_g[g.group]: g.weight for g in v.groups}
    brazo = sum(x for k, x in w.items() if k.startswith(BRAZO))
    pierna = sum(x for k, x in w.items() if k.startswith(PIERNA))
    p = v.co; ax = abs(p.x)
    for k, x in w.items():
        f = 1.0
        if k.startswith(BRAZO) and brazo < 0.5:
            f = 0.0 if pierna > 0.3 else clamp((ax - (hombro.x - 0.08)) / 0.08) * clamp((p.z - (hombro.z - 0.12)) / 0.09)
        elif k.startswith(PIERNA) and pierna < 0.5:
            f = 0.0 if brazo > 0.3 else clamp((J["pelvis"].z + 0.13 - p.z) / 0.10)
        elif k.startswith(PIERNA) and brazo >= 0.5:
            f = 0.0
        if f < 1.0:
            N.vertex_groups[k].add([v.index], x * f, "REPLACE"); quitados += 1
log("pesos fuera de su región, apagados:", quitados)
for o in bpy.data.objects: o.select_set(False)
bpy.context.view_layer.objects.active = N; N.select_set(True)
bpy.ops.object.mode_set(mode="WEIGHT_PAINT")
# el hombro y el pecho, suaves (la axila no se pellizca); después, 4 huesos por punto y que sumen 1
for g in ("clavicle_l", "clavicle_r", "upperarm_l", "upperarm_r", "spine_03", "spine_02"):
    if g in N.vertex_groups:
        N.vertex_groups.active_index = N.vertex_groups[g].index
        bpy.ops.object.vertex_group_smooth(group_select_mode="ACTIVE", factor=0.5, repeat=4)
# los pesos chicos fuera; y al cortar a 4 huesos por punto (lo que lleva el glTF), un
# vecino se quedaba con un hueso y el otro no: la piel se cuarteaba. Suavizar todo
# después del corte reparte el salto.
bpy.ops.object.vertex_group_clean(group_select_mode="ALL", limit=0.04)
bpy.ops.object.vertex_group_smooth(group_select_mode="ALL", factor=0.5, repeat=3)
bpy.ops.object.vertex_group_limit_total(group_select_mode="ALL", limit=4)
bpy.ops.object.vertex_group_smooth(group_select_mode="ALL", factor=0.5, repeat=2)
bpy.ops.object.vertex_group_clean(group_select_mode="ALL", limit=0.02)
bpy.ops.object.vertex_group_limit_total(group_select_mode="ALL", limit=4)
bpy.ops.object.vertex_group_normalize_all(group_select_mode="ALL", lock_active=False)
bpy.ops.object.mode_set(mode="OBJECT")
# la cabeza, firme: el suavizado dejaba el mentón a medias con el cuello (la cara se
# estiraba al girar la cabeza y el canon del Taller medía la cabeza corta). Una curva
# en S, continua: lo que ya era casi todo cabeza pasa a ser cabeza; el cuello sigue suave.
gH = N.vertex_groups["Head"]
def s(h): return h * h * (3 - 2 * h)
for v in me.vertices:
    w = {g.group: g.weight for g in v.groups}
    h = w.get(gH.index, 0.0)
    if h <= 0.0 or h >= 1.0: continue
    h2 = s(s(s(h)))
    resto = 1 - h
    for k, x in w.items():
        N.vertex_groups[k].add([v.index], h2 if k == gH.index else (x * (1 - h2) / resto if resto > 1e-6 else 0.0), "REPLACE")
# y la cara entera es cabeza: en la mujer (el mentón casi a la altura de la articulación)
# la mandíbula quedaba con el cuello y al girar la cabeza la boca se quedaba atrás.
# De 7,5 a 2,5 cm debajo de la articulación de la cabeza (el mentón de la mujer está a
# 2,5 cm; medido: quedaba mitad cuello), y de la articulación a 4 cm hacia adelante,
# la cabeza sube a 1.
zH = J["Head"].z
for v in me.vertices:
    # sólo adelante (la mandíbula; la nuca sigue suave con el cuello)
    f = clamp((v.co.z - (zH - 0.075)) / 0.05) * clamp((J["Head"].y - v.co.y) / 0.04)
    if f <= 0: continue
    w = {g.group: g.weight for g in v.groups}
    h = w.get(gH.index, 0.0)
    if h >= f: continue
    resto = 1 - h
    for k, x in w.items():
        if k != gH.index: N.vertex_groups[k].add([v.index], x * (1 - f) / resto if resto > 1e-6 else 0.0, "REPLACE")
    gH.add([v.index], f, "REPLACE")
log("pesos suavizados, 4 por punto, normalizados; la cabeza firme")

# ── de vuelta a pose T: la malla queda como el esqueleto del Taller ──────────
bpy.context.view_layer.objects.active = RA
bpy.ops.object.mode_set(mode="POSE")
for raiz, q in giros.items():
    pb = RA.pose.bones[raiz]
    piv = RA.matrix_world.inverted() @ J[raiz]
    Mq = RA.matrix_world.inverted().to_3x3() @ q.inverted().to_matrix() @ RA.matrix_world.to_3x3()
    G = Matrix.Translation(piv) @ Mq.to_4x4() @ Matrix.Translation(-piv)
    pb.matrix = G @ pb.matrix
    bpy.context.view_layer.update()
bpy.ops.object.mode_set(mode="OBJECT")
for o in bpy.data.objects: o.select_set(False)
bpy.context.view_layer.objects.active = N; N.select_set(True)
for m in list(N.modifiers):
    bpy.ops.object.modifier_apply(modifier=m.name)
tris0 = sum(len(p.vertices) - 2 for p in N.data.polygons)
dec = N.modifiers.new("reducir", "DECIMATE"); dec.ratio = min(1.0, tris_obj / max(1, tris0))
bpy.ops.object.modifier_apply(modifier=dec.name)
tris1 = sum(len(p.vertices) - 2 for p in N.data.polygons)
log("malla en pose T · detalle aplicado:", tris0, "triángulos ->", tris1)

# ── todo al esqueleto final (R) ───────────────────────────────────────────────
mat = bpy.data.materials.new("MI_Realista"); mat.use_nodes = True
bsdf = mat.node_tree.nodes.get("Principled BSDF")
if bsdf: bsdf.inputs["Base Color"].default_value = (0.8, 0.72, 0.64, 1); bsdf.inputs["Roughness"].default_value = 0.6
N.data.materials.clear(); N.data.materials.append(mat)
# piel lisa: la mujer venía con caras planas y el glTF partía cada punto en cada cara (2,6 veces más puntos)
for p in N.data.polygons: p.use_smooth = True
N.parent = R; N.matrix_parent_inverse = R.matrix_world.inverted()
am = N.modifiers.new("Armature", "ARMATURE"); am.object = R
matojo = bpy.data.materials.new("MI_Eyes"); matojo.use_nodes = True
for o in ojos:
    for m in list(o.modifiers):
        bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier=m.name)
    # el ojo, entero de la cabeza; en su lugar de pose T (la cabeza no se giró)
    g = o.vertex_groups.new(name="Head"); g.add(list(range(len(o.data.vertices))), 1.0, "REPLACE")
    o.data.materials.clear(); o.data.materials.append(matojo)
    o.parent = R; o.matrix_parent_inverse = R.matrix_world.inverted()
    a = o.modifiers.new("Armature", "ARMATURE"); a.object = R
bpy.data.objects.remove(RA, do_unlink=True)
bpy.data.objects.remove(Q, do_unlink=True)
# los dos ojos en UNA malla con el material «MI_Eyes» (el Taller los busca así para los gestos)
for m in list(bpy.data.materials):
    if m.name == "MI_Eyes" and m is not matojo: m.name = "MI_Eyes_Taller"
matojo.name = "MI_Eyes"
if len(ojos) > 1:
    for o in bpy.data.objects: o.select_set(False)
    for o in ojos: o.select_set(True)
    bpy.context.view_layer.objects.active = ojos[0]
    bpy.ops.object.join()
    ojos = [ojos[0]]
ojos[0].name = "Ojos"

for o in bpy.data.objects: o.select_set(False)
for o in [R, N] + ojos: o.select_set(True)
bpy.context.view_layer.objects.active = R
bpy.ops.export_scene.gltf(filepath=salida, export_format="GLB", use_selection=True, export_skins=True, export_animations=False,
                          export_yup=True, export_apply=False, export_morph=False, export_def_bones=False, export_texcoords=True, export_normals=True)
json.dump({k: list(v) for k, v in cabezaR.items()}, open(salida + ".juntas.json", "w"))
log("EXPORTADO OK", salida, "·", tris1, "triángulos ·", len(ojos), "ojos")
