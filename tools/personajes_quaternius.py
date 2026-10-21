"""Arma los personajes del Taller de personaje (estudio 3D) a partir de los
paquetes LIBRES de Quaternius (CC0 1.0, dominio público):

  - Universal Base Characters [Standard]   → hombre.glb, mujer.glb
  - Universal Animation Library [Standard] → maniqui.glb y poses.json

Uso (una vez, con los .zip ya descomprimidos en una carpeta):

    python -I tools/personajes_quaternius.py <carpeta_descomprimida>

Escribe en ui/estudio3d/personajes/. Lo que hace:
  - junta cada .gltf + .bin en un .glb único;
  - saca lo que el estudio no usa (UV extra, colores por vértice, la textura de
    rugosidad y las animaciones) y achica las texturas a 1024 (JPG la piel,
    PNG con alfa las cejas): de ~25 MB a unos pocos;
  - de la biblioteca de animaciones toma UN cuadro de cada una (caminar,
    correr, sentado…) como POSE: la rotación local de cada hueso. Hombre,
    mujer y maniquí tienen el mismo esqueleto (65 huesos, estilo Unreal), así
    que una pose sirve para los tres.
"""
import io
import json
import os
import struct
import sys

from PIL import Image

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SALIDA = os.path.join(RAIZ, 'ui', 'estudio3d', 'personajes')

# las poses de fábrica: (id, nombre, animación, fracción del clip)
POSES = [
    ('parado', 'Parado', 'Idle_Loop', 0.0),
    ('hablando', 'Hablando', 'Idle_Talking_Loop', 0.35),
    ('caminando', 'Caminando', 'Walk_Loop', 0.25),
    ('paso-formal', 'Caminando (formal)', 'Walk_Formal_Loop', 0.25),
    ('trotando', 'Trotando', 'Jog_Fwd_Loop', 0.25),
    ('corriendo', 'Corriendo', 'Sprint_Loop', 0.3),
    ('saltando', 'Saltando', 'Jump_Loop', 0.5),
    ('sentado', 'Sentado', 'Sitting_Idle_Loop', 0.0),
    ('sentado-hablando', 'Sentado hablando', 'Sitting_Talking_Loop', 0.4),
    ('agachado', 'Agachado', 'Crouch_Idle_Loop', 0.0),
    ('arrodillado', 'Arrodillado', 'Fixing_Kneeling', 0.3),
    ('levantando', 'Levantando algo', 'PickUp_Table', 0.45),
    ('empujando', 'Empujando', 'Push_Loop', 0.3),
    ('bailando', 'Bailando', 'Dance_Loop', 0.2),
    ('golpe', 'Golpe', 'Punch_Cross', 0.4),
    ('espada', 'Con espada', 'Sword_Idle', 0.0),
    ('hechizo', 'Hechizo', 'Spell_Simple_Idle_Loop', 0.0),
    ('apuntando', 'Apuntando', 'Pistol_Aim_Neutral', 0.0),
    ('manejando', 'Manejando', 'Driving_Loop', 0.0),
    ('nadando', 'Nadando', 'Swim_Fwd_Loop', 0.3),
    ('tendido', 'Tendido', 'Death01', 1.0),
    ('t', 'Pose T', 'A_TPose', 0.0),
]

LICENCIA = """Personajes del Taller de personaje de LOW

hombre.glb, mujer.glb: «Universal Base Characters» [Standard], de Quaternius.
maniqui.glb y poses.json: «Universal Animation Library» [Standard], de Quaternius.
https://quaternius.com

Licencia de los paquetes (tal como vienen en License_Standard.txt / License.txt):
CC0 1.0 Universal (CC0 1.0) Public Domain Dedication
https://creativecommons.org/publicdomain/zero/1.0/

Convertidos para LOW con tools/personajes_quaternius.py: .gltf + .bin a .glb,
sin atributos ni texturas que el estudio no usa, texturas a 1024, y un cuadro de
cada animación como pose.
"""


def leer(ruta):
    """(json, binario) de un .gltf (con su .bin al lado) o de un .glb."""
    if ruta.endswith('.glb'):
        f = open(ruta, 'rb').read()
        n = struct.unpack('<I', f[12:16])[0]
        g = json.loads(f[20:20 + n])
        m = 20 + n
        nb = struct.unpack('<I', f[m:m + 4])[0]
        return g, f[m + 8:m + 8 + nb]
    g = json.load(open(ruta, encoding='utf-8'))
    return g, open(os.path.join(os.path.dirname(ruta), g['buffers'][0]['uri']), 'rb').read()


def datos_accessor(g, binario, i):
    a = g['accessors'][i]
    bv = g['bufferViews'][a['bufferView']]
    assert not bv.get('byteStride'), 'vista intercalada: no soportado'
    comp = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}[a['componentType']]
    n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[a['type']]
    ini = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    return binario[ini:ini + comp * n * a['count']]


def valores(g, binario, i):
    a = g['accessors'][i]
    assert a['componentType'] == 5126
    n = {'SCALAR': 1, 'VEC3': 3, 'VEC4': 4}[a['type']]
    d = datos_accessor(g, binario, i)
    flo = struct.unpack('<%df' % (len(d) // 4), d)
    return [flo[k * n:(k + 1) * n] for k in range(a['count'])]


def escribir_glb(g, binario, imagenes, ruta):
    """Rearma un .glb sólo con los accessors que se usan; `imagenes` es una lista
    de (bytes, mime) que pasan a ser g['images'] embebidas."""
    usados = []

    def marcar(i):
        if i is not None and i not in usados:
            usados.append(i)
    for m in g.get('meshes', []):
        for p in m['primitives']:
            for v in p['attributes'].values():
                marcar(v)
            marcar(p.get('indices'))
    for s in g.get('skins', []):
        marcar(s.get('inverseBindMatrices'))
    for an in g.get('animations', []):
        for sm in an['samplers']:
            marcar(sm['input'])
            marcar(sm['output'])
    nuevo_bin = bytearray()
    vistas, accs, mapa = [], [], {}
    for i in usados:
        d = datos_accessor(g, binario, i)
        while len(nuevo_bin) % 4:
            nuevo_bin.append(0)
        vistas.append({'buffer': 0, 'byteOffset': len(nuevo_bin), 'byteLength': len(d)})
        nuevo_bin += d
        a = dict(g['accessors'][i])
        a['bufferView'] = len(vistas) - 1
        a.pop('byteOffset', None)
        mapa[i] = len(accs)
        accs.append(a)
    imgs = []
    for datos, mime in imagenes:
        while len(nuevo_bin) % 4:
            nuevo_bin.append(0)
        vistas.append({'buffer': 0, 'byteOffset': len(nuevo_bin), 'byteLength': len(datos)})
        nuevo_bin += datos
        imgs.append({'bufferView': len(vistas) - 1, 'mimeType': mime})
    for m in g.get('meshes', []):
        for p in m['primitives']:
            p['attributes'] = {k: mapa[v] for k, v in p['attributes'].items()}
            if 'indices' in p:
                p['indices'] = mapa[p['indices']]
    for s in g.get('skins', []):
        if 'inverseBindMatrices' in s:
            s['inverseBindMatrices'] = mapa[s['inverseBindMatrices']]
    for an in g.get('animations', []):
        for sm in an['samplers']:
            sm['input'] = mapa[sm['input']]
            sm['output'] = mapa[sm['output']]
    g['accessors'] = accs
    g['bufferViews'] = vistas
    while len(nuevo_bin) % 4:
        nuevo_bin.append(0)
    g['buffers'] = [{'byteLength': len(nuevo_bin)}]
    if imgs:
        g['images'] = imgs
    else:
        for k in ('images', 'textures', 'samplers'):
            g.pop(k, None)
    j = json.dumps(g, separators=(',', ':')).encode('utf-8')
    while len(j) % 4:
        j += b' '
    total = 12 + 8 + len(j) + 8 + len(nuevo_bin)
    with open(ruta, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(j), 0x4E4F534A))
        f.write(j)
        f.write(struct.pack('<II', len(nuevo_bin), 0x004E4942))
        f.write(nuevo_bin)
    return os.path.getsize(ruta)


def textura(ruta, lado, formato, calidad=88):
    im = Image.open(ruta)
    if formato == 'JPEG':
        im = im.convert('RGB')
    if max(im.size) > lado:
        im = im.resize((lado, lado), Image.LANCZOS)
    b = io.BytesIO()
    if formato == 'JPEG':
        im.save(b, 'JPEG', quality=calidad, optimize=True)
        return b.getvalue(), 'image/jpeg'
    im.save(b, 'PNG', optimize=True)
    return b.getvalue(), 'image/png'


SIN_USO = ('TEXCOORD_1', 'TEXCOORD_2', 'TEXCOORD_3', 'COLOR_0', 'COLOR_1')


def cuerpo(carpeta, nombre, salida):
    base = os.path.join(carpeta, 'Universal Base Characters[Standard]', 'Base Characters', 'Godot - UE')
    tex = os.path.join(carpeta, 'Universal Base Characters[Standard]', 'Base Characters', 'Textures')
    g, b = leer(os.path.join(base, nombre + '_FullBody.gltf'))
    for m in g['meshes']:
        for p in m['primitives']:
            for k in SIN_USO:
                p['attributes'].pop(k, None)
    # las texturas, de nuevo y livianas: [piel color, piel relieve, ojos, cejas]
    uri = [im['uri'] for im in g['images']]
    def ruta_de(indice_textura):
        u = uri[g['textures'][indice_textura]['source']].replace('_png.png', '.png')
        for d in (tex, base):
            if os.path.exists(os.path.join(d, u)):
                return os.path.join(d, u)
        raise FileNotFoundError(u)
    imagenes, texturas, materiales = [], [], []
    for mat in g['materials']:
        pbr = mat['pbrMetallicRoughness']
        nuevo = {'name': mat['name'], 'doubleSided': mat.get('doubleSided', False),
                 'pbrMetallicRoughness': {'metallicFactor': 0, 'roughnessFactor': pbr.get('roughnessFactor', 0.75)}}
        es_pelo = 'Hair' in mat['name']
        color = ruta_de(pbr['baseColorTexture']['index'])
        dat = textura(color, 512 if es_pelo else 1024, 'PNG' if es_pelo or 'Eye' in mat['name'] else 'JPEG')
        imagenes.append(dat)
        texturas.append({'source': len(imagenes) - 1})
        nuevo['pbrMetallicRoughness']['baseColorTexture'] = {'index': len(texturas) - 1}
        if es_pelo:
            nuevo['alphaMode'] = 'MASK'
            nuevo['alphaCutoff'] = 0.4
        if not es_pelo and 'normalTexture' in mat:
            imagenes.append(textura(ruta_de(mat['normalTexture']['index']), 1024 if 'Eye' not in mat['name'] else 256, 'JPEG', 92))
            texturas.append({'source': len(imagenes) - 1})
            nuevo['normalTexture'] = {'index': len(texturas) - 1}
        materiales.append(nuevo)
    g['materials'] = materiales
    g['textures'] = texturas
    g.pop('samplers', None)
    return escribir_glb(g, b, imagenes, salida)


def slerp(a, b, t):
    d = sum(x * y for x, y in zip(a, b))
    if d < 0:
        b, d = [-x for x in b], -d
    if d > 0.9995:
        r = [x + (y - x) * t for x, y in zip(a, b)]
    else:
        import math
        th = math.acos(d)
        s = math.sin(th)
        wa, wb = math.sin((1 - t) * th) / s, math.sin(t * th) / s
        r = [wa * x + wb * y for x, y in zip(a, b)]
    n = sum(x * x for x in r) ** 0.5
    return [x / n for x in r]


def muestrear(g, b, an, frac):
    """La rotación local de cada hueso en esa fracción del clip."""
    fin = max(g['accessors'][sm['input']]['max'][0] for sm in an['samplers'])
    t = fin * frac
    out = {}
    for ch in an['channels']:
        if ch['target'].get('path') != 'rotation':
            continue
        sm = an['samplers'][ch['sampler']]
        ts = [x[0] for x in valores(g, b, sm['input'])]
        vs = valores(g, b, sm['output'])
        if sm.get('interpolation') == 'CUBICSPLINE':
            vs = vs[1::3]
        k = 0
        while k + 1 < len(ts) and ts[k + 1] <= t:
            k += 1
        if k + 1 < len(ts) and ts[k + 1] > ts[k]:
            q = slerp(list(vs[k]), list(vs[k + 1]), (t - ts[k]) / (ts[k + 1] - ts[k]))
        else:
            q = list(vs[k])
        out[g['nodes'][ch['target']['node']]['name']] = [round(x, 5) for x in q]
    return out


def biblioteca(carpeta, salida_maniqui, salida_poses):
    g, b = leer(os.path.join(carpeta, 'Universal Animation Library[Standard]', 'Unreal-Godot', 'UAL1_Standard.glb'))
    clips = {an['name']: an for an in g['animations']}
    poses = []
    for pid, nombre, clip, frac in POSES:
        if clip not in clips:
            print('falta la animación', clip)
            continue
        poses.append({'id': pid, 'nombre': nombre, 'huesos': muestrear(g, b, clips[clip], frac)})
    with open(salida_poses, 'w', encoding='utf-8') as f:
        json.dump({'origen': 'Quaternius · Universal Animation Library (CC0)', 'poses': poses}, f, ensure_ascii=False, separators=(',', ':'))
    # el maniquí, sin animaciones
    g.pop('animations', None)
    for m in g['meshes']:
        for p in m['primitives']:
            for k in SIN_USO:
                p['attributes'].pop(k, None)
    return escribir_glb(g, b, [], salida_maniqui)


def main():
    carpeta = sys.argv[1]
    os.makedirs(SALIDA, exist_ok=True)
    for nombre, archivo in (('Superhero_Male', 'hombre.glb'), ('Superhero_Female', 'mujer.glb')):
        print(archivo, cuerpo(carpeta, nombre, os.path.join(SALIDA, archivo)) // 1024, 'KB')
    print('maniqui.glb', biblioteca(carpeta, os.path.join(SALIDA, 'maniqui.glb'), os.path.join(SALIDA, 'poses.json')) // 1024, 'KB')
    print('poses.json', os.path.getsize(os.path.join(SALIDA, 'poses.json')) // 1024, 'KB')
    with open(os.path.join(SALIDA, 'LICENCIA.txt'), 'w', encoding='utf-8') as f:
        f.write(LICENCIA)


if __name__ == '__main__':
    main()
