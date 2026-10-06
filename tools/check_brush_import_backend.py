"""IMPORTADORES DE PINCELES: se ARMAN archivos de cada formato (con la misma
disposición de bytes que guardan Photoshop, GIMP, Krita, Procreate y
MyPaint) y se leen con brush_import.py. python tools/check_brush_import_backend.py

Pedido de Mauro (oct-2026): «que incorpores pinceles de otros softwares,
para instalar bibliotecas como las de Photoshop». Antes un .abr con la punta
comprimida (lo normal) se rechazaba: «Este ABR usa puntas comprimidas sin
preview compatible». Acá se exige que la punta salga IGUAL a la guardada:
se compara píxel a píxel la máscara."""
import base64
import io
import json
import plistlib
import struct
import sys
import zipfile
import zlib
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))
import brush_import as BI  # noqa: E402
from PIL import Image  # noqa: E402

fallas = []
total = 0


def prueba(nombre, fn):
    global total
    total += 1
    try:
        fn()
    except Exception as e:  # noqa: BLE001
        fallas.append(f"{nombre} :: {type(e).__name__}: {e}")


def mascara_de(tip_data, lado=None):
    """El alfa de una punta importada (data URL) como imagen L."""
    png = base64.b64decode(tip_data.split(",", 1)[1])
    img = Image.open(io.BytesIO(png)).convert("RGBA").getchannel("A")
    return img if lado is None else img.resize((lado, lado))


# una punta de prueba: un ANILLO asimétrico de 40x30 (no simétrico: si se lee
# corrida, invertida o transpuesta, no coincide)
ANCHO, ALTO = 40, 30
def anillo():
    out = bytearray()
    for y in range(ALTO):
        for x in range(ANCHO):
            d = ((x - 14) ** 2 / 14 ** 2 + (y - 15) ** 2 / 11 ** 2) ** .5
            out.append(255 if .55 < d < 1 else (90 if x > 33 else 0))
    return bytes(out)
MASCARA = anillo()


def packbits(fila: bytes) -> bytes:
    """Compresión PackBits honesta (corridas y literales), como Photoshop."""
    out, i = bytearray(), 0
    while i < len(fila):
        j = i
        while j + 1 < len(fila) and fila[j + 1] == fila[i] and j - i < 127:
            j += 1
        if j > i:
            out += bytes([257 - (j - i + 1), fila[i]]); i = j + 1
        else:
            k = i
            while k + 1 < len(fila) and fila[k + 1] != fila[k] and k - i < 127:
                k += 1
            out += bytes([k - i]) + fila[i:k + 1]; i = k + 1
    return bytes(out)


def coincide(tip_data, nombre):
    """La punta importada reproduce el anillo (centrado en un cuadrado)."""
    m = mascara_de(tip_data)
    lado = max(ANCHO, ALTO)
    assert m.size == (lado, lado), f"{nombre}: la punta mide {m.size}, esperaba {lado}x{lado}"
    oy = (lado - ALTO) // 2
    malos = 0
    for y in range(ALTO):
        for x in range(ANCHO):
            if abs(m.getpixel((x, y + oy)) - MASCARA[y * ANCHO + x]) > 2:
                malos += 1
    assert malos == 0, f"{nombre}: {malos} píxeles de la punta no coinciden con los guardados"


# ── Photoshop .abr v6 ──
def u(s):  # texto unicode de Photoshop
    return struct.pack(">I", len(s) + 1) + s.encode("utf-16-be") + b"\x00\x00"
def clave(k):
    return (struct.pack(">I", 0) + k.encode()) if len(k) == 4 else (struct.pack(">I", len(k)) + k.encode())
def desc(nombre, clase, items):
    out = u(nombre) + clave(clase) + struct.pack(">I", len(items))
    for k, tipo, valor in items:
        out += clave(k) + tipo.encode() + valor
    return out
def untf(unidad, v):
    return unidad.encode() + struct.pack(">d", v)


def abr_v6(subversion=2, rle=True):
    uuid = "$" + "a1b2c3d4-0000-1111-2222-333344445555"
    cuerpo = bytes([len(uuid)]) + uuid.encode()
    pad = (47 if subversion == 1 else 301) - len(cuerpo)
    cuerpo += b"\x00" * pad
    cuerpo += struct.pack(">iiii", 0, 0, ALTO, ANCHO) + struct.pack(">H", 8) + bytes([1 if rle else 0])
    if rle:
        filas = [packbits(MASCARA[y * ANCHO:(y + 1) * ANCHO]) for y in range(ALTO)]
        cuerpo += b"".join(struct.pack(">H", len(f)) for f in filas) + b"".join(filas)
    else:
        cuerpo += MASCARA
    pincel = struct.pack(">I", len(cuerpo)) + cuerpo + b"\x00" * ((4 - len(cuerpo) % 4) % 4)
    samp = b"8BIMsamp" + struct.pack(">I", len(pincel)) + pincel
    brsh = desc("", "sampledBrush", [("Dmtr", "UntF", untf("#Pxl", 52.0)), ("Spcn", "UntF", untf("#Prc", 15.0)),
                                       ("Angl", "UntF", untf("#Ang", 30.0)), ("Rndn", "UntF", untf("#Prc", 80.0)),
                                       ("sampledData", "TEXT", u(uuid))])
    preset = desc("", "brushPreset", [("Nm  ", "TEXT", u("Tinta de prueba")), ("Brsh", "Objc", brsh)])
    lista = b"Objc" + preset
    d = struct.pack(">I", 16) + desc("", "null", [("Brsh", "VlLs", struct.pack(">I", 1) + lista)])
    dsec = b"8BIMdesc" + struct.pack(">I", len(d)) + d
    return struct.pack(">HH", 6, subversion) + samp + dsec


def t_abr_v6():
    for sub in (1, 2):
        for rle in (True, False):
            ps = BI.importar("photoshop.abr", abr_v6(sub, rle))
            assert len(ps) == 1, f"v6.{sub} rle={rle}: {len(ps)} pinceles"
            p = ps[0]
            assert p["name"] == "Tinta de prueba", p["name"]
            assert abs(p["size"] - 52) < 1e-6 and abs(p["spacing"] - .15) < 1e-6 and abs(p["angle"] - 30) < 1e-6 and abs(p["roundness"] - .8) < 1e-6, p
            coincide(p["tipData"], f"abr v6.{sub} rle={rle}")
prueba("Photoshop .abr v6 (6.1 y 6.2, con y sin RLE): punta exacta y ajustes del descriptor", t_abr_v6)


def t_abr_v2():
    nombre = u("Viejo")
    cuerpo = struct.pack(">I", 0) + struct.pack(">H", 25) + nombre + b"\x01" + struct.pack(">hhhh", 0, 0, ALTO, ANCHO)
    filas = [packbits(MASCARA[y * ANCHO:(y + 1) * ANCHO]) for y in range(ALTO)]
    cuerpo += struct.pack(">iiii", 0, 0, ALTO, ANCHO) + struct.pack(">H", 8) + b"\x01"
    cuerpo += b"".join(struct.pack(">H", len(f)) for f in filas) + b"".join(filas)
    datos = struct.pack(">HH", 2, 1) + struct.pack(">HI", 2, len(cuerpo)) + cuerpo
    ps = BI.importar("viejo.abr", datos)
    assert len(ps) == 1 and ps[0]["name"] == "Viejo" and abs(ps[0]["spacing"] - .25) < 1e-6, ps
    coincide(ps[0]["tipData"], "abr v2")
prueba("Photoshop .abr v2 (Photoshop 6 y anteriores)", t_abr_v2)


def t_abr_roto():
    try:
        BI.importar("roto.abr", b"\x00\x09\x00\x01basura")
    except BI.ErrorDeFormato:
        return
    raise AssertionError("un .abr de versión desconocida no avisó")
prueba("un .abr desconocido avisa en vez de romperse", t_abr_roto)


# ── GIMP ──
def gbr(nombre="Punta GIMP", rgba=False):
    n = nombre.encode() + b"\x00"
    cab = 28 + len(n)
    datos = MASCARA if not rgba else b"".join(bytes([0, 0, 0, v]) for v in MASCARA)
    return struct.pack(">IIIII", cab, 2, ANCHO, ALTO, 4 if rgba else 1) + b"GIMP" + struct.pack(">I", 40) + n + datos

def t_gimp():
    for rgba in (False, True):
        p = BI.importar("punta.gbr", gbr(rgba=rgba))[0]
        assert p["name"] == "Punta GIMP" and abs(p["spacing"] - .4) < 1e-6, p
        coincide(p["tipData"], f"gbr rgba={rgba}")
    gih = b"Follaje\n3 ncells:3 cellwidth:40 cellheight:30 step:20 dim:1 rank0:3 sel0:random\n" + gbr("a") + gbr("b") + gbr("c")
    p = BI.importar("follaje.gih", gih)[0]
    assert p["name"] == "Follaje" and len(p.get("tipVariants", [])) == 3, p.keys()
    for v in p["tipVariants"]:
        coincide(v, "gih celda")
prueba("GIMP .gbr (gris y RGBA) y .gih (celdas como variantes)", t_gimp)


# ── Krita ──
def png_con_texto(clave_txt, texto):
    img = Image.new("RGB", (8, 8), "white"); b = io.BytesIO(); img.save(b, format="PNG"); png = b.getvalue()
    cuerpo = clave_txt.encode() + b"\x00\x00" + zlib.compress(texto.encode())
    chunk = struct.pack(">I", len(cuerpo)) + b"zTXt" + cuerpo + struct.pack(">I", zlib.crc32(b"zTXt" + cuerpo) & 0xffffffff)
    return png[:-12] + chunk + png[-12:]

KPP_XML = ('<Preset paintopid="paintbrush" name="Carbón de Krita"><param type="string" name="brush_definition"><![CDATA['
           '<Brush type="gbr_brush" filename="punta.gbr" spacing="0.07" angle="12" scale="1"/>]]></param>'
           '<param type="string" name="size">44</param></Preset>')
KPP_AUTO = ('<Preset paintopid="paintbrush" name="Redondo suave"><param type="string" name="brush_definition"><![CDATA['
            '<Brush type="auto_brush" spacing="0.1" angle="0"><MaskGenerator diameter="60" ratio="0.5" hfade="0.7" vfade="0.7" type="circle"/></Brush>]]></param></Preset>')

def t_krita():
    p = BI.importar("auto.kpp", png_con_texto("preset", KPP_AUTO))[0]
    assert p["name"] == "Redondo suave" and abs(p["size"] - 60) < 1e-6 and abs(p["roundness"] - .5) < 1e-6 and abs(p["hardness"] - .3) < 1e-6, p
    z = io.BytesIO()
    with zipfile.ZipFile(z, "w") as zf:
        zf.writestr("mimetype", "application/x-krita-resourcebundle")
        zf.writestr("brushes/punta.gbr", gbr())
        zf.writestr("paintoppresets/carbon.kpp", png_con_texto("preset", KPP_XML))
    ps = BI.importar("pack.bundle", z.getvalue())
    assert len(ps) == 1 and ps[0]["name"] == "Carbón de Krita" and abs(ps[0]["spacing"] - .07) < 1e-6 and abs(ps[0]["size"] - 44) < 1e-6, ps
    coincide(ps[0]["tipData"], "krita bundle → punta gbr")
prueba("Krita .kpp suelto (punta automática) y .bundle (preset + su punta)", t_krita)


# ── Procreate ──
def nskeyed(d):
    objetos = ["$null"]
    def agregar(v):
        objetos.append(v); return plistlib.UID(len(objetos) - 1)
    claves = [agregar(k) for k in d]
    valores = [agregar(v) for v in d.values()]
    raiz = agregar({"NS.keys": claves, "NS.objects": valores, "$class": plistlib.UID(0)})
    return plistlib.dumps({"$archiver": "NSKeyedArchiver", "$version": 100000, "$top": {"root": raiz}, "$objects": objetos}, fmt=plistlib.FMT_BINARY)

def forma_png(blanco_es_tinta=True):
    img = Image.frombytes("L", (ANCHO, ALTO), MASCARA)
    if not blanco_es_tinta:
        from PIL import ImageOps; img = ImageOps.invert(img)
    b = io.BytesIO(); img.convert("RGB").save(b, format="PNG"); return b.getvalue()

def t_procreate():
    z = io.BytesIO()
    with zipfile.ZipFile(z, "w") as zf:
        zf.writestr("brushset.plist", plistlib.dumps({"brushes": ["UUID-1"]}))
        zf.writestr("UUID-1/Shape.png", forma_png(True))
        zf.writestr("UUID-1/Grain.png", forma_png(True))
        zf.writestr("UUID-1/Brush.archive", nskeyed({"name": "Lápiz de Procreate", "plotSpacing": .2, "maxSize": .5,
                                                       "dynamicsPressureSize": .9, "dynamicsPressureOpacity": .4}))
    ps = BI.importar("set.brushset", z.getvalue())
    assert len(ps) == 1, ps
    p = ps[0]
    assert p["name"] == "Lápiz de Procreate" and abs(p["spacing"] - .2) < 1e-6 and abs(p["pressureSize"] - .9) < 1e-6 and abs(p["pressureOpacity"] - .4) < 1e-6, p
    assert p.get("grainData"), "no trajo el grano"
    coincide(p["tipData"], "procreate Shape.png (blanco = tinta)")
prueba("Procreate .brushset: Shape.png (blanco = tinta), Grain.png y los ajustes de Brush.archive", t_procreate)


# ── MyPaint ──
def t_mypaint():
    j = {"comment": "Tinta MyPaint", "settings": {"radius_logarithmic": {"base_value": 1.5}, "hardness": {"base_value": .9},
                                                    "opaque": {"base_value": .7}, "dabs_per_actual_radius": {"base_value": 4}}}
    p = BI.importar("tinta.myb", json.dumps(j).encode())[0]
    assert p["name"] == "Tinta MyPaint" and abs(p["hardness"] - .9) < 1e-6 and abs(p["opacity"] - .7) < 1e-6 and abs(p["spacing"] - .25) < 1e-6, p
prueba("MyPaint .myb (ajustes; punta redonda)", t_mypaint)


def t_desconocido():
    try:
        BI.importar("algo.xyz", b"123")
    except BI.ErrorDeFormato:
        return
    raise AssertionError("un formato desconocido no avisó")
prueba("un formato desconocido avisa", t_desconocido)

def t_gih_opaco():
    # celdas RGBA OPACAS (tinta oscura sobre blanco, alfa 255): en el bundle de
    # David Revoy salían como cuadrados negros (se tomaba el alfa entero)
    def gbr_opaco():
        n = b"opaca\x00"; cab = 28 + len(n)
        datos = b"".join(bytes([255 - v, 255 - v, 255 - v, 255]) for v in MASCARA)
        return struct.pack(">IIIII", cab, 2, ANCHO, ALTO, 4) + b"GIMP" + struct.pack(">I", 40) + n + datos
    p = BI.importar("opaca.gih", b"Opaca\n2 ncells:2\n" + gbr_opaco() + gbr_opaco())[0]
    for v in p["tipVariants"]:
        coincide(v, "gih RGBA opaco")
prueba("GIMP .gih con celdas RGBA opacas: la forma sale de la luminancia (no un cuadrado negro)", t_gih_opaco)


def t_zip():
    z = io.BytesIO()
    with zipfile.ZipFile(z, "w") as zf:
        zf.writestr("Mis pinceles/tinta.abr", abr_v6(2, True))
        zf.writestr("__MACOSX/Mis pinceles/._tinta.abr", b"basura de macOS")
        zf.writestr("Mis pinceles/leeme.txt", "CC0")
    ps = BI.importar("descarga.zip", z.getvalue())
    assert len(ps) == 1 and ps[0]["name"] == "Tinta de prueba", ps
    coincide(ps[0]["tipData"], "abr dentro de un zip")
prueba("un .zip tal como se descarga: lee el .abr de adentro e ignora la basura de macOS", t_zip)


def t_bibliotecas():
    import tempfile
    with tempfile.TemporaryDirectory() as d:
        B = BI.Bibliotecas(Path(d) / "pinceles")
        a = B.instalar("photoshop.abr", abr_v6(2, True))
        b = B.instalar("follaje.gih", b"Follaje\n2 ncells:2\n" + gbr("a") + gbr("b"))
        assert a["count"] == 1 and b["count"] == 1 and a["id"] != b["id"], (a, b)
        lista = B.listar()
        assert {x["id"] for x in lista} == {a["id"], b["id"]}, lista
        cargada = B.cargar(a["id"])
        assert cargada["brushes"][0]["name"] == "Tinta de prueba" and cargada["format"] == "abr"
        # instalar el MISMO archivo otra vez no duplica la biblioteca
        assert B.instalar("photoshop.abr", abr_v6(2, True))["id"] == a["id"] and len(B.listar()) == 2
        assert B.quitar(a["id"]) and [x["id"] for x in B.listar()] == [b["id"]]
        for malo in ("../../etc", "A B", ""):
            try:
                B.cargar(malo)
            except BI.ErrorDeFormato:
                continue
            raise AssertionError("un id con ruta no se rechazó: " + repr(malo))
prueba("bibliotecas instaladas: instalar, listar, cargar, no duplicar, quitar y rechazar rutas", t_bibliotecas)

def t_incluidas():
    import tempfile, json as J
    with tempfile.TemporaryDirectory() as d:
        inc = Path(d) / "incluidas"; inc.mkdir()
        BI.Bibliotecas(inc).instalar("photoshop.abr", abr_v6(2, True), nombre="Incluida")
        B = BI.Bibliotecas(Path(d) / "usuario", incluidas=inc)
        lista = B.listar()
        assert len(lista) == 1 and lista[0]["builtin"] is True, lista
        assert B.cargar(lista[0]["id"])["brushes"][0]["name"] == "Tinta de prueba"
        # «quitar» una incluida la OCULTA: el archivo del programa queda
        assert B.quitar(lista[0]["id"]) and B.listar() == [] and len(list(inc.glob("*.lowbrush"))) == 1
prueba("bibliotecas incluidas: se listan como del programa, se cargan y «quitar» sólo las oculta", t_incluidas)


def t_incluidas_del_repo():
    # las que viajan con LOW: todas con licencia libre declarada y en CREDITOS.md
    import json as J
    carpeta = RAIZ / "pinceles"
    archivos = sorted(carpeta.glob("*.lowbrush"))
    assert archivos, "no hay bibliotecas incluidas en pinceles/"
    creditos = (carpeta / "CREDITOS.md").read_text(encoding="utf-8")
    for f in archivos:
        j = J.loads(f.read_text(encoding="utf-8"))
        assert "CC0" in (j.get("license") or ""), f.name + ": sin licencia CC0 declarada"
        assert j.get("author") and j.get("source"), f.name + ": sin autor o fuente"
        assert j["name"].split(" · ")[-1] in creditos, f.name + ": no figura en CREDITOS.md"
        assert j["brushes"] and sum(1 for b in j["brushes"] if b.get("tipData")) >= len(j["brushes"]) // 2, f.name + ": pocas puntas"
prueba("las bibliotecas que vienen con LOW declaran licencia CC0, autor y fuente, y están en CREDITOS.md", t_incluidas_del_repo)

print(f"IMPORTADORES DE PINCELES: {total} pruebas, {total - len(fallas)} bien, {len(fallas)} fallan")
for f in fallas:
    print("FALLA:", f)
sys.exit(1 if fallas else 0)
