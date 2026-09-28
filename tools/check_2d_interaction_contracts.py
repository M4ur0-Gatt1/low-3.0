"""Contratos estáticos de interacción que bloquean un release si regresan.

No reemplazan las pruebas de navegador. Protegen reglas críticas mientras se
incorpora el arnés end-to-end: Escape no cierra 2D, la rueda no transforma el
rig y los gestos de tableta no mezclan Pointer Events con Mouse Events.
"""
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
APP = (ROOT / "ui" / "app.js").read_text(encoding="utf-8")
# Extraidos de app.js en v4.16.0 (§12 AHORA·7). Los contratos apuntan a donde
# vive el codigo, no a donde vivia: cuando el panel de equipo y los arcos se
# movieron, esta prueba lo noto — que es exactamente para lo que esta.
COLABP = (ROOT / "ui" / "panels" / "colab-panel.js").read_text(encoding="utf-8")
ARCOSV = (ROOT / "ui" / "panels" / "arcs-view.js").read_text(encoding="utf-8")
FORMAS = (ROOT / "ui" / "panels" / "shape-tool.js").read_text(encoding="utf-8")
MPVIEW = (ROOT / "ui" / "composition" / "multiplane-view.js").read_text(encoding="utf-8")
CMPCAM = (ROOT / "ui" / "panels" / "composition-camera.js").read_text(encoding="utf-8")
CMPPAN = (ROOT / "ui" / "panels" / "composition-panel.js").read_text(encoding="utf-8")
INDEX = (ROOT / "ui" / "index.html").read_text(encoding="utf-8")
SHORTCUTS = (ROOT / "ui" / "animation" / "shortcuts.js").read_text(encoding="utf-8")
SCENE_MODEL = (ROOT / "ui" / "animation" / "scene-model.js").read_text(encoding="utf-8")
BRUSH_RENDER = (ROOT / "ui" / "drawing" / "brush-render.js").read_text(encoding="utf-8")


def function_body(name: str, next_name: str) -> str:
    start = APP.index(f"function {name}(")
    end = APP.index(f"function {next_name}(", start)
    return APP[start:end]


DOCUMENT = (ROOT / "ui" / "animation" / "document.js").read_text(encoding="utf-8")
CSS_APP = (ROOT / "ui" / "app.css").read_text(encoding="utf-8")
POLISH = (ROOT / "ui" / "design" / "studio-polish.css").read_text(encoding="utf-8")
MAIN = (ROOT / "main.py").read_text(encoding="utf-8")
ISS = (ROOT / "low_installer.iss").read_text(encoding="utf-8", errors="replace")
CI = (ROOT / ".github" / "workflows" / "build.yml").read_text(encoding="utf-8")


def function_body_doc(name: str, next_name: str) -> str:
    start = DOCUMENT.index(f"{name}(")
    end = DOCUMENT.index(f"{next_name}(", start)
    return DOCUMENT[start:end]


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit("CONTRATO 2D INCUMPLIDO: " + message)


escape = function_body("dzEscapeActive", "dzApplyZoom")
# dzAddShape se mudo a ui/panels/shape-tool.js en v4.16.0: el tramo termina
# en la funcion que quedo despues.
resize = function_body("dzHandleDown", "dzDeleteSelected")
camera = APP[APP.index("function dzCamDrag("):APP.index("function dzKeyToggle(")]
timeline_scrub = APP[APP.index('$("#tlFrames").addEventListener'):APP.index("// herramientas de dibujo")]
disc = APP[APP.index("function dzDiscToggle("):APP.index("DZ.anim = null")]
wheel = APP[APP.index('$("#dzCanvas").addEventListener("wheel"'):APP.index(
    '$("#dzCanvas").addEventListener("contextmenu"')]
rig_mode = function_body("dzRigSetMode", "dzRigEnterTest")
rig_geometry = function_body("dzRigBoneGeometryDrag", "dzRigBoneFKDrag")
rig_pivot = function_body("dzRigBuildPivotDrag", "dzRigCommitPreview")
rig_ik = function_body("dzRigIKDrag", "dzRigOverlayRender")
rig_deformer = function_body("dzRigDeformadorDrag", "dzDeformadorCurvaDe")
rig_readiness = function_body("dzRigReadinessStatus", "dzRigPanelSync")
mocap_open = function_body("dzMocapOpen", "dzDocumentMayDiscard")
mocap_reset = function_body("dzMocapResetSession", "dzMocapSync")
vector_tx = APP[APP.index("const DZ_VECTOR_ATTRS"):APP.index("function dzVectorElementAt")]
inflator = function_body("dzInflatorDown", "dzInflatorMove") + function_body("dzInflatorMove", "dzInflatorUp") + function_body("dzInflatorUp", "dzVectorPrefs")
handler = function_body("dzHandlerDown", "dzHandlerMove") + function_body("dzHandlerUp", "dzHandlerGlobalMove")
iron = function_body("dzIronDown", "dzIronApply") + function_body("dzIronApply", "dzIronUp") + function_body("dzIronUp", "dzIronSmooth")
magnet = function_body("dzMagnetDown", "dzMagnetMove") + function_body("dzMagnetMove", "dzMagnetApply") + function_body("dzMagnetUp", "dzDiscToggle")

require("closeDesign" not in escape and "designView" not in escape,
        "Escape volvió a cerrar o abandonar el módulo 2D")
require('dzRigSetTool("select")' in escape and 'dzSetTool("select")' in escape,
        "Escape ya no suelta primero la herramienta activa")
require("pointermove" in resize and "pointerup" in resize and "pointercancel" in resize,
        "el tirador de transformación dejó de completar gestos de lápiz")
require("mousemove" not in resize and "mouseup" not in resize,
        "el tirador volvió a mezclar eventos de mouse con eventos de puntero")
require("mousemove" not in camera and "mouseup" not in camera and "pointercancel" in camera,
        "la cámara 2D volvió a perder gestos de lápiz o su cancelación")
require('addEventListener("pointerdown"' in timeline_scrub and "mousemove" not in timeline_scrub,
        "el scrub de fotogramas volvió a depender exclusivamente del mouse")
require('addEventListener("pointerdown"' in disc and "mousemove" not in disc,
        "la mesa giratoria volvió a depender exclusivamente del mouse")
require("wheelPolicy" in wheel and 'policy === "block"' in wheel,
        "la rueda puede atravesar otra vez el modo de rigging")
require(INDEX.index("application/mode-machine.js") < INDEX.index("app.js"),
        "la máquina de modos debe cargarse antes que la aplicación")
require("rigGestureCancel" in rig_mode and "rigBoneGeometryPreview = null" in rig_mode,
        "cambiar a Animar dejó de cancelar la edición pendiente del esqueleto")
require('DZ.rigSubmode !== "build" || DZ.rigTool !== "edit"' in rig_geometry,
        "un gesto iniciado en Construir puede volver a editar geometría dentro de Animar")
require('DZ.rigSubmode !== "build"' in rig_pivot,
        "un pointerup tardío puede volver a mover pivotes dentro de Animar")
require("dzRigTrackGesture" in rig_ik and 'addEventListener("pointercancel"' in rig_ik,
        "IK quedó fuera de la cancelación transaccional del rig")
require("dzRigTrackGesture" in rig_deformer and 'addEventListener("pointercancel"' in rig_deformer,
        "el deformador quedó fuera de la cancelación transaccional del rig")
require("setRigDeformerKey" not in rig_deformer[rig_deformer.index("const mover"):rig_deformer.index("const cleanup")],
        "el deformador volvió a grabar una clave por cada movimiento del lápiz")
require("rigModeAccess" in rig_readiness and "access.animate" in rig_readiness,
        "Animar volvió a depender del arte o sus metadatos en vez del esqueleto")
require('e.key === "Delete" && opts.deleteScene?.()' in SHORTCUTS and "deleteScene: () => dzDeleteContext()" in APP,
        "la X-sheet volvió a secuestrar Supr antes de borrar objetos o huesos")
require('DZ.rigSelectionSource = "rig"' in APP and 'DZ.rigSelectionSource = "art"' in APP and
        'DZ.rigSelectionSource === "rig"' in APP,
        "seleccionar el arte vinculado vuelve a perder el hueso activo")
require('$("#dzMocapPanel")' in mocap_open and "dzRigToggle" not in mocap_open,
        "Motion Capture volvió a depender del panel o modo Cut-out")
require("revokeObjectURL" in mocap_reset and 'overlay.innerHTML = ""' in mocap_reset and
        'panel.hidden = true' in mocap_reset,
        "un documento nuevo puede volver a heredar video, máscara o panel de Motion Capture")
require('id="dzMocapPanel"' in INDEX and INDEX.index('id="dzRigPanel"') < INDEX.index('id="dzMocapPanel"'),
        "Motion Capture dejó de ser un panel independiente")
require("const DEFAULT_WIDTH = 1920" in SCENE_MODEL and
        "width: 1920, height: 1080" in APP,
        "el documento nuevo dejó de ser Full HD 1920×1080")
require('owner: "vector:" + owner' in vector_tx and "dzVectorRestore" in vector_tx,
        "las herramientas vectoriales dejaron de compartir una transacción reversible")
for name, body in (("Inflador", inflator), ("Manejador", handler), ("Plancha", iron), ("Imán", magnet)):
    require("dzVectorBegin" in body and "dzVectorFinish" in body and "pointercancel" in body,
            f"{name} quedó fuera del controlador común o confirma un pointercancel")

mirror_toggle = function_body("dzMirrorToggle", "dzMirrorGuideRender")
mirror_guide = function_body("dzMirrorGuideRender", "dzMirrorClone")
mirror_clone = function_body("dzMirrorClone", "dzAIKeyModal")
require("dzMirrorGuideRender()" in mirror_toggle,
        "el modo espejo volvió a encenderse sin dibujar el eje de simetría")
require("vb[0] + vb[2] / 2" in mirror_guide and "vb[0] + vb[2] / 2" in mirror_clone,
        "la guía del espejo y el trazo reflejado dejaron de compartir el mismo eje")
require("dz-penui" in mirror_guide,
        "el eje del espejo dejó de ser UI de pantalla y puede entrar al documento")
require("dzMirrorGuideRender();" in function_body("dzCanvasSet", "dzDocCommit"),
        "repintar el lienzo vuelve a borrar el eje del espejo")

PANEL = (ROOT / "ui" / "animation_panel.html").read_text(encoding="utf-8")
ICONOS_RIEL = ("i-cursor", "i-cursor-open", "i-pencil", "i-brush", "i-eraser", "i-magnet")
require(all(f'id="{name}"' in PANEL for name in ICONOS_RIEL),
        "el panel separado perdió los iconos del riel y vuelve a mostrar solo texto")
require("t.icon" in PANEL and "<use href=" in PANEL[PANEL.index("function renderTools"):PANEL.index("function renderColor")],
        "el panel separado de herramientas volvió a dibujarse como una lista de texto")
require('icon: (b.querySelector("use")' in APP,
        "la foto del panel de herramientas dejó de viajar con su icono")
require("panels?.get?.(kind)?.dock" in APP,
        "acoplar un panel separado vuelve a mandarlo siempre a la derecha")

guardado_diseno = function_body("dzSave", "modalTools")
auto_guardado = function_body("dzPersist", "dzGoFrame")
recuperacion = function_body("dzRecoveryDecide", "dzGenBg")
require('r.path && !r.error' in APP,
        "un guardado fallido vuelve a contar como exitoso: el puente devuelve un objeto tambien al fallar")
require(APP.count("dzSaveOk(") >= 5,
        "algun camino de guardado dejo de verificar que la escritura ocurrio")
require("dzSaveOk(r)" in guardado_diseno and "dzSaveFallo" in guardado_diseno,
        "Ctrl+S del diseno volvio a dar por guardado lo que no se escribio")
require("dzSaveOk(r)" in auto_guardado and "saveNow" in auto_guardado,
        "el auto-guardado fallido dejo de conservar el trabajo en el punto de recuperacion")
require(auto_guardado.index("recovery?.clear") > auto_guardado.index("dzSaveOk(r)"),
        "el auto-guardado borra el punto de recuperacion antes de confirmar la escritura")
require(all(x in recuperacion for x in ('"recover"', '"discard"', '"keep"', "dzRcCompare")),
        "el dialogo de recuperacion perdio alguna de sus tres salidas o la comparacion")
require('decision === "discard"' in APP and 'dzQuiereRecuperar' not in APP,
        "cancelar la recuperacion vuelve a descartar el trabajo en silencio")
require("dzModalDismiss" in function_body("dzConfirmModal", "dzNotice"),
        "cerrar un modal con Escape vuelve a dejar su promesa colgada para siempre")

fin_trazo = function_body("_drawFinish", "_drawCommit") if "function _drawCommit(" in APP else APP[APP.index("function _drawFinish("):APP.index("function _drawFinish(") + 2500]
require("dzStyleTagInkAsFill(ribbon)" in fin_trazo and 'dzStyleTag(ribbon, "paint")' not in APP,
        "el pincel volvio a etiquetarse como Relleno: dibuja blanco sobre blanco")
require("ATTR.paint" in function_body("dzStyleTagInkAsFill", "dzStyleTag"),
        "la cinta del pincel dejo de aplicar el color de tinta sobre el relleno")
barra = function_body("dzToolsBarInit", "dzToolsBarFit")
require("dz-tools-grip" in barra and "pointerdown" in barra,
        "la barra de herramientas dejo de poder moverse")
require("dzToolsBarFit" in APP and "ResizeObserver" in barra,
        "la barra dejo de repartir entre riel y cajon segun el alto disponible")
require("dz-tools-drawer" in barra and "dzToolsDrawerHide" in APP,
        "desaparecio el cajon de herramientas de menos uso")
require("replaceStyle" in DOCUMENT and "history.begin" in function_body_doc("replaceStyle", "renameLevel"),
        "reasignar y borrar un estilo dejo de ser una sola transaccion")
require("renameLevel" in DOCUMENT and "lv.name = limpio" in function_body_doc("renameLevel", "reassignStyle"),
        "renombrar un nivel dejo de conservar su identidad")
require("dzCrashReport" in APP and "CRASH_FIELDS" in MAIN,
        "el informe de fallo dejo de existir o de filtrar sus campos")

FN = (ROOT / "ui" / "animation" / "function-editor.js").read_text(encoding="utf-8")
SHORTCUTS_CELLS = SHORTCUTS[SHORTCUTS.index("const cells = {"):SHORTCUTS.index("function wire(")]
require("animation.shortcuts = { wire, clip, cells }" in SHORTCUTS,
        "el comando unico de celdas dejo de exportarse")
require("readCells" not in APP and "pasteCells(clip.range" not in APP,
        "algun camino de la UI volvio a implementar copiar/pegar celdas por su cuenta")
require(all(x in FN for x in ("TANGENTES", "suave", "lineal", "escalon")),
        "el editor de curvas perdio alguna de sus tangentes")
require(all(x in FN for x in ("setRigChannelKey", "removeRigChannelKey", "setRigChannelEase",
                             "pasteRigChannelCurve", "rigCurveClipboardData")),
        "el editor de curvas dejo de escribir por los comandos del documento")
require("onFrame" in FN and "fn2-cabeza" in FN,
        "el editor de curvas dejo de compartir la cabeza lectora")
require('id="dzFnEditor"' in INDEX and "function-editor.js" in INDEX,
        "el panel del editor de funciones no esta montado")

SCENE_WEIGHTS = SCENE_MODEL[SCENE_MODEL.index("const rigWeightsData"):SCENE_MODEL.index("const rigMeshesData")]
require("rigNormalizeWeights" in SCENE_WEIGHTS and "rigAutoWeights" in SCENE_MODEL,
        "el flexi-binding por distancia desaparecio del modelo")
require("total ? w / total" in SCENE_WEIGHTS or "w / total" in SCENE_WEIGHTS,
        "los pesos de vertice dejaron de normalizarse: la pieza se encoge sola al posar")
require("rigMeshSkinnedAt" in SCENE_MODEL and "rigBindMatrix" in SCENE_MODEL,
        "la malla dejo de deformarse con los huesos")
require(re.search(r"this\.rigMeshSkinnedAt\(\s*boneId\s*,\s*frame(?:\s*,\s*overrides)?\s*\)",
                  SCENE_MODEL[SCENE_MODEL.index("rigMallaAt("):SCENE_MODEL.index("rigMallaAt(") + 900]),
        "rigMallaAt volvio a ignorar el skinning")
require("paintRigMeshWeight" in DOCUMENT and "actual[boneId] = 1" in DOCUMENT,
        "un vertice puede volver a quedarse sin ningun hueso al restar peso")
require('"dzMeshOverlay"' in APP and 'id="dzMeshOverlay"' in INDEX,
        "el overlay de pesos no sobrevive a abrir un documento")
require('id="rigMeshCreate"' in INDEX and "dzMeshPanelSync" in APP,
        "el panel de malla y pesos no esta montado")

require("rigActionsData" in SCENE_MODEL and "rigActionPhase" in SCENE_MODEL,
        "el esquema de acciones de Smart Bone desaparecio")
require("rigPoseBase" in SCENE_MODEL and "rigActionDelta" in SCENE_MODEL,
        "la pose base y el aporte de las acciones volvieron a ser la misma cosa")
require("rigPoseBase(id, f)" in DOCUMENT,
        "escribir una clave vuelve a capturar la pose CON el aporte de la accion")
require("rigActionDelta(nodeId, frame)" in DOCUMENT,
        "_writeRigPoses dejo de descontar el aporte: la correccion se hornea y se aplica dos veces")
require("recordRigAction" in DOCUMENT and "createRigAction" in DOCUMENT,
        "faltan los comandos de Smart Bone")
require('id="rigSmartNew"' in INDEX and "dzSmartPanelSync" in APP,
        "el panel de Smart Bones no esta montado")

require('class="dz-optionsbar"' in INDEX and "art-bar-inline" in INDEX,
        "la barra de iconos volvio a ser una fila aparte de las opciones de herramienta")
require(INDEX.count('id="dzToolOpts"') == 1 and
        INDEX.index('id="dzToolOpts"') > INDEX.index('class="dz-optionsbar"'),
        "las opciones de herramienta salieron de la barra unica")
require('closest(".dz-optionsbar")' in APP,
        "las pestanas de documento vuelven a insertarse dentro de la barra de opciones")

require('id === "multiplane"' in APP and "dzCompositionViewShow(show)" in APP,
        "abrir el multiplano desde el menu Ventana vuelve a mostrar una capa vacia sobre todo")
require("visiblesDe(dock)" in APP and "visiblesDe(d).length" in APP,
        "los muelles y sus divisiones vuelven a contar paneles ocultos")
require("--cyan:#9AA2A9" in CSS_APP,
        "volvio el segundo acento celeste compitiendo con el naranja")
require("box-shadow: inset 0 2px var(--accent)" not in POLISH,
        "la solapa activa volvio a llevar una barra de acento cruzandola")
require("::-webkit-slider-thumb" in POLISH,
        "los controles deslizantes volvieron al widget por omision del navegador")
require("DZ_BARRA_SECUNDARIOS" in APP,
        "la barra de opciones dejo de mandar lo de menos uso al desborde")

require('case " ":' not in SHORTCUTS,
        "la barra espaciadora volvio a reproducir: es la mano, siempre")
require('play: "enter"' in APP and '"play") return dzPlayToggle()' in APP,
        "reproducir dejo de tener atajo propio o de ser reasignable")
require('e.key === "Enter" ? "enter"' in APP and 'k === "enter" && PEN' in APP,
        "Enter dejo de reproducir, o pisa el cierre del trazado de la pluma")
require("fijadas" in APP and "ocultas" in APP and "menuAnclar" in APP,
        "la barra de herramientas dejo de ser configurable por el usuario")
require('node.parentElement === drawer' in APP,
        "fijar herramientas volvio a estar invertido: lo del cajon tiene que ENTRAR al riel")

require("rigControlsData" in SCENE_MODEL and "rigControlValue" in SCENE_MODEL,
        "los controles de cara y manos desaparecieron del modelo")
require("rigControlPath" in SCENE_MODEL and "controls/" in SCENE_MODEL,
        "un control dejo de ser un canal: pierde claves, curvas y conductor")
require("createRigControl" in DOCUMENT and "setRigControlValue" in DOCUMENT,
        "faltan los comandos de control")
require('id="rigDialNew"' in INDEX and "dzDialPanelSync" in APP,
        "el panel de controles no esta montado")
require('startsWith("controls/")' in FN,
        "el filtro por seleccion vuelve a esconder los diales del editor de curvas")

PREMIERE = (ROOT / "ui" / "animation" / "premiere-xml.js").read_text(encoding="utf-8")
require("xmeml" in PREMIERE and "premiereXML" in PREMIERE,
        "el exportador de XML para Premiere desaparecio")
require("Math.round(f), ntsc" in PREMIERE,
        "el timebase NTSC volvio a escribirse mal: la secuencia se desfasa")
require("audioBufferAWav" in PREMIERE and "export_premiere" in MAIN,
        "el audio dejo de escribirse junto al XML: el montaje arranca pidiendo relinkear")
require('data-x="premiere"' in APP and "dzExportPremiere" in APP,
        "el boton de exportar para Premiere no esta en el modal")

LIP = (ROOT / "ui" / "animation" / "lipsync.js").read_text(encoding="utf-8")
require("lipsyncPorAmplitud" in LIP and "lipsyncPicosDeBuffer" in LIP,
        "el lipsync por amplitud desaparecio")
require("if (v < umbral) return 0" in LIP,
        "el silencio dejo de cerrar la boca: el lipsync se mueve en las pausas")
require("f - desdeCuadro >= sosten" in LIP,
        "se cayo el sosten minimo: la boca tiembla un cuadro por forma")
require("if (elegido !== anterior)" in LIP,
        "el lipsync volvio a escribir una clave por cuadro: la X-sheet se vuelve ilegible")
require("for (let f = desde; f <= hasta; f++)" in LIP and "if (v > maximo) maximo = v" in LIP,
        "la escala dejo de medirse contra el tramo: un grito lejano apaga toda la toma")
require("applyLipsync" in DOCUMENT and "history.begin(label)" in DOCUMENT,
        "el lipsync dejo de ser UNA transaccion: Undo lo saca clave por clave")
require("clearRigSwitchRange" in DOCUMENT,
        "sin borrado por tramo, rehacer un lipsync mezcla dos sincronizaciones")
require('id="rigLipGen"' in INDEX and "dzLipGenerar" in APP,
        "el panel de lipsync no esta montado")

TRANS = (ROOT / "ui" / "collaboration" / "transport.js").read_text(encoding="utf-8")
RELE = (ROOT / "server" / "low_relay.py").read_text(encoding="utf-8")
require("RelayTransport" in TRANS and "dzColabConectar" in COLABP,
        "el transporte del trabajo remoto desaparecio")
require("this.cola.push(op)" in TRANS,
        "sin cola, lo que se dibuja sin red se pierde")
require("this.vistas.add(op.id)" in TRANS,
        "sin memoria de ids, cada trazo propio se dibuja dos veces al volver del servidor")
require("ESPERAS = [1000, 2000, 4000, 8000, 15000, 30000]" in TRANS,
        "se cayo la espera creciente: el cliente ataca al propio droplet")
require("this.seq = Math.max(this.seq, Number(m.seq) || 0)" in TRANS,
        "el cliente no toma el numero del servidor: pide la jornada entera en cada reconexion")
require("desde: this.seq" in TRANS,
        "sin punto de partida, reconectar se trae todo de nuevo")
require("def tomar" in RELE and "actual[\"actorId\"] != actor" in RELE,
        "el servidor dejo de arbitrar los bloqueos: dos personas creen que ganaron")
require("soltar_todo" in RELE,
        "los bloqueos del que se desconecta quedan trabados para siempre")
require("os.replace(tmp, ruta)" in RELE,
        "el registro de la sala se guarda sin atomicidad: un corte lo deja a medias")
require('op["actorId"] = c.actorId' in RELE,
        "el remitente lo pone el cliente: cualquiera puede firmar como otro")
require("applyRemoteSnapshot" in DOCUMENT and "snapshotPara" in DOCUMENT,
        "no hay por donde entrar ni salir el dibujo del equipo")
require("DZ.colabAplicando" in COLABP and "DZ.colabUltimo[clave] === texto" in COLABP,
        "sin el corte por contenido, dos LOW se devuelven la misma instantanea sin fin")
require("if (DZ.anim) DZ.anim.idx = i;" in APP,
        "dzGoFrame volvio a exigir la lista de archivos del modo viejo: "
        "con documento abierto los clicks en los chips no mueven nada")

TLVIEW = (ROOT / "ui" / "animation" / "timeline-view.js").read_text(encoding="utf-8")
XSVIEW = (ROOT / "ui" / "animation" / "xsheet-view.js").read_text(encoding="utf-8")
require('"1F"' in TLVIEW and '"1F"' in XSVIEW,
        "los botones de exposicion volvieron a decir 1s: en castellano se leen como segundos")
require('"1s"' not in TLVIEW and '"1s"' not in XSVIEW,
        "quedo un boton de exposicion rotulado en segundos")
require('data-act="premiere"' in INDEX and "dzExportPremiereDirecto" in APP,
        "el XML para Premiere volvio a estar solo dentro del modal: no lo encuentra nadie")
require("MP4 · PNG · XML" in INDEX,
        "el menu Archivo vuelve a prometer solo GIF/PNG y esconde el XML")

WS = (ROOT / "ui" / "workspace" / "workspaces.js").read_text(encoding="utf-8")
require('["dzColab","dzColabHead"]' in APP and 'id="dzColabHead"' in INDEX,
        "el panel de equipo dejo de ser acoplable: vuelve a taparle los paneles de atras")
require('colab:      { label: "Equipo"' in WS,
        "el panel de equipo no figura en el catalogo: no se puede abrir ni cerrar desde Ventana")
_colab_css = CSS_APP.split(".colab{")[1].split("}")[0] if ".colab{" in CSS_APP else ""
require("position:fixed" not in _colab_css and "z-index" not in _colab_css,
        "el panel de equipo volvio a ser un flotante clavado encima del muelle")
require("ahora - DZ.colabPresenciaAt < 1000" in COLABP,
        "se cayo el limite de presencia: pasar cuadros inunda el rele, 24 mensajes por segundo")
require("dzColabReproduciendo()" in COLABP and "filtro.checked && !dzColabReproduciendo()" in COLABP,
        "la lista de comentarios vuelve a repintarse en cada cuadro y traba la reproduccion")

SHORT = (ROOT / "ui" / "animation" / "shortcuts.js").read_text(encoding="utf-8")
require('if (id === this.layerId && frame === this.frame) this.emit("frame");' in DOCUMENT,
        "cambiar el dibujo del cuadro actual dejo de avisar: el volcado con retardo "
        "escribe el lienzo viejo encima y se pierde lo pegado")
require("copiarDibujo" in SHORT and "pegarDibujo" in SHORT and "copiarDibujo: () => dzCuadroCopiar()" in APP,
        "volvieron a existir dos copiar/pegar compitiendo segun si la X-sheet esta montada")
require("hayRango" in SHORT and "e.shiftKey && clip.range" in SHORT,
        "se cayo la regla de copiar/pegar: sin rango el dibujo, con rango las celdas, "
        "Ctrl+Shift+V el reuso")

ARCOS = (ROOT / "ui" / "animation" / "arcs.js").read_text(encoding="utf-8")
require("analizarArco" in ARCOS and "arcoDesfase" in ARCOS,
        "el modulo de arcos y espaciado desaparecio")
require('id="tlArco"' in INDEX and "dzArcoToggle" in ARCOSV,
        "el boton de arcos no esta en la barra de la timeline")
require("dz-penui dz-arco" in ARCOSV,
        "el arco dejo de ser solo-pantalla: se guardaria dentro del dibujo")
require("if (previo === dw.number) continue;" in ARCOSV,
        "el arco vuelve a poner un punto por cuadro dentro de un sostenido: "
        "se lee «lento» donde en realidad el dibujo no cambia")
require("dzArcoMuestras(ultimo).length" in ARCOSV,
        "el arco vuelve a depender del nodo del DOM: al mover la cabeza lectora "
        "se pierde la seleccion y el arco desaparece justo cuando uno lo mira")
require("mejor.error > 0.34" in ARCOS,
        "el desfase deja de callarse cuando dos movimientos no se parecen: "
        "inventa un numero de overlapping")

require("window.dzColabToggle = dzColabToggle" in COLABP
        and "window.dzArcoToggle = dzArcoToggle" in ARCOSV,
        "un panel extraido dejo de exponer sus nombres globales: los manejadores "
        "de la interfaz y los recorridos E2E los llaman por nombre")
require('src="panels/colab-panel.js' in INDEX and 'src="panels/arcs-view.js' in INDEX,
        "los paneles extraidos no se cargan: la interfaz queda sin equipo ni arcos")
require(INDEX.index('src="app.js') < INDEX.index('src="panels/'),
        "los paneles extraidos se cargan ANTES de app.js: usan DZ y $ de ahi")

require("dzFormaDown" in FORMAS and 'tool === "shape"' in APP,
        "la herramienta de formas dejo de recibir el gesto del puntero")
require("DZ_FORMA = null" in FORMAS and "dzFormaCancelar" in APP,
        "el gesto de forma no se puede cancelar: Escape o cambiar de herramienta "
        "dejarian una forma a medias")
require("DZPointerController.finish(g.gestureToken, g.pid)" in FORMAS,
        "el gesto de forma no cierra en el controlador de puntero; ojo que la API "
        "es finish(token, pointerId), no commit — inventar el nombre rompia el gesto "
        "a mitad y la forma quedaba sin seleccionar")
require("dzSnapshot();" in FORMAS.split("Recien ahora entra al historial".replace("ie","ié"))[-1][:200]
        if "historial" in FORMAS else False,
        "la forma entra al historial antes de soltar: se registrarian pasos por cada "
        "movimiento del puntero")
require("g.ancla" in FORMAS and "vb[0] + vb[2] / 2" not in FORMAS.split("if (!g.arrastro)")[-1][:400],
        "un clic simple volvio a plantar la forma en el CENTRO del lienzo: con la mesa "
        "paneada eso cae fuera de la pantalla y la herramienta parece rota")
require('src="panels/shape-tool.js' in INDEX,
        "el modulo de formas no se carga")

require('this.manipulate(e, plane, this.pendingTool || "xy")' in MPVIEW,
        "agarrar un plano volvio a no hacer nada sin apretar antes una tecla: "
        "es el reporte «no puedo cambiar las posiciones de los planos»")
require("if (plane.id !== this.selected) this.select(plane.id);" in MPVIEW,
        "agarrar un plano no elegido no lo elige: el click llega DESPUES del "
        "arrastre y se movia el plano anterior")
require("this.pintarTarjeta(plane);" in MPVIEW,
        "el arrastre volvio a reconstruir el escenario entero: render() clona el "
        "dibujo de cada plano y esto corre en cada pointermove")
require('"Arrastrá un plano para moverlo' in MPVIEW,
        "la pantalla de composicion dejo de explicar el gesto")
require("dzCmpCamRender" in CMPCAM and 'boton.dataset.v = "camera"' in CMPCAM,
        "se cayo la vista de camara de Composicion: sin ella se ordena profundidad "
        "sin poder ver el resultado, que es lo que la hacia sentir de juguete")
require("dzCamView(texto, cam)" in CMPCAM,
        "la vista de camara dejo de pintar el cuadro REAL: si no pasa por dzCamView "
        "muestra una aproximacion y miente sobre lo que se va a exportar")
require("DZ.compositionAutoKey) dzCmpCamClave" in CMPCAM,
        "mover la camara para mirar volvio a dejar claves sin Auto-key, o dejo de "
        "dejarlas con Auto-key puesto")
require('src="panels/composition-panel.js' in INDEX
        and INDEX.index('src="panels/composition-panel.js') < INDEX.index('src="panels/composition-camera.js'),
        "el puente de composicion se carga despues de la camara, que lo usa")
# app.js SIGUE llamando estas funciones y debe hacerlo: lo que no puede es
# volver a DEFINIRLAS.
require("function dzCompositionViewShow" in CMPPAN
        and "function dzCompositionViewShow" not in APP,
        "el puente de composicion volvio a definirse dentro de app.js")
require('src="panels/composition-camera.js' in INDEX,
        "el modulo de camara de composicion no se carga")

# ── Identidad, archivos .low y firma ──────────────────────────────────────
require('+ ".low";' in APP,
        "las escenas volvieron a ofrecerse con otra extension: la de LOW es .low")
require("(low|lowscene)$" in APP,
        "se dejo de reconocer .lowscene: los archivos guardados antes de la "
        "v4.19.0 tienen que seguir abriendose (§14)")
require("archivo_de_argv" in MAIN and '"open_file": s._abrir_al_inicio' in MAIN,
        "el doble clic en un .low no llega a la aplicacion: la asociacion queda "
        "decorativa")
require("s._abrir_al_inicio = None" in MAIN.split('"open_file"')[1][:200],
        "el archivo de arranque no se limpia: un refresco de la interfaz lo "
        "volveria a abrir encima de lo que el usuario tenga en pantalla")
require("dzSceneOpen(ruta)" in APP or "dzSceneOpen(ruta)" in APP,
        "el doble clic dejo de usar el mismo camino que Abrir escena: dos caminos "
        "que abren escenas se desincronizan")
require("ChangesAssociations=yes" in ISS and 'AppExt ".low"' in ISS
        and "low_doc.ico" in ISS,
        "el instalador dejo de asociar .low o de instalar su icono")
require("Root: HKCU" in ISS and "Root: HKLM" not in ISS,
        "la asociacion paso a HKLM: el instalador corre sin permisos de "
        "administrador y fallaria")
require((ROOT / "low_doc.ico").exists(),
        "falta low_doc.ico: los archivos .low quedarian con el icono generico")
require("LOW_PFX_BASE64" in CI and "timestamp.digicert.com" in CI,
        "se cayo la firma del ejecutable, o se firma sin sellado de tiempo — sin "
        "sello la firma muere cuando vence el certificado y los instaladores ya "
        "publicados empiezan a dar aviso")
require(CI.count("LOW_PFX_BASE64") >= 4,
        "se firma el exe pero no el instalador: lo primero que ejecuta el usuario "
        "es el setup y es eso lo que Windows mira")
require("33B5E8" in INDEX,
        "se saco el celeste del rayo del splash: es el rayo de Aladdin Sane y es "
        "identidad, no un resto del celeste que se quito de la interfaz")


# -- Punteria de la seleccion --------------------------------------------
HIT = (ROOT / "ui" / "drawing" / "hit-test.js").read_text(encoding="utf-8")
require('src="drawing/hit-test.js' in INDEX,
        "el modulo de punteria no se carga: la seleccion vuelve a fallar dentro "
        "de una forma sin relleno")
require("dzHitTest(e.clientX, e.clientY)" in APP,
        "dzPointerDown dejo de consultar la punteria: e.target solo acierta donde "
        "hay pintura, y una forma sin relleno no se puede agarrar por adentro")
require("isPointInFill" in HIT,
        "se dejo de probar la geometria del relleno: isPointInFill es lo unico "
        "que acierta el area de una forma con fill=none")
require("for (let i = candidatos.length - 1; i >= 0; i--)" in HIT,
        "la punteria dejo de recorrer de adelante hacia atras: ganaria el de "
        "atras, que es exactamente el defecto reportado")
require("dzHitDistanciaAlTrazo" in HIT,
        "se saco la holgura por distancia al trazado: una linea de un pixel "
        "volveria a exigir acertarle al pixel exacto")
require("function dzRigArtAtPoint" in HIT and "function dzRigArtAtPoint" not in APP,
        "dzRigArtAtPoint volvio a app.js o dejo de compartir la punteria: los "
        "huesos se colgarian del cuerpo en vez de la pieza dibujada con linea")
require("dz-onion" in HIT and "dz-penui" in HIT,
        "la punteria dejo de excluir el papel cebolla y las guias de pantalla")

# -- Inspector de Composicion --------------------------------------------
require("input.oninput" in MPVIEW,
        "los campos del inspector volvieron a escuchar solo change: tipear un "
        "valor no haria nada hasta salir del campo, y las flechas del teclado "
        "no harian nada nunca")
require("previa" in MPVIEW and "pintarTarjeta" in MPVIEW,
        "el inspector dejo de mostrar vista previa mientras se tipea")
require('texto.endsWith(".")' in MPVIEW,
        "un valor a medio escribir vuelve a mandar el plano al cero")

# -- BRUSH-02: los parametros del pincel hacen algo -----------------------
RENDER = (ROOT / "ui" / "drawing" / "brush-render.js").read_text(encoding="utf-8")
STUDIO = (ROOT / "ui" / "drawing" / "brush-studio.js").read_text(encoding="utf-8")
ENGINE = (ROOT / "ui" / "drawing" / "brush-engine-pro.js").read_text(encoding="utf-8")
require('src="drawing/brush-render.js' in INDEX,
        "el modulo del trazo final no se carga: el pincel se queda sin motor")
require("function dzBrushFinalElement" not in APP,
        "dzBrushFinalElement volvio a app.js")
require('brush && brush.engine === "raster" ? "raster" : "vector"' in RENDER,
        "volvio la comparacion cruda del motor: ocho pinceles incorporados no "
        "declaran engine y caerian otra vez al camino viejo, con todos sus "
        "parametros muertos")
require('brush.engine === "vector"' not in RENDER,
        "queda una comparacion contra 'vector' sin normalizar en el trazo final")
require('setAttribute("fill-opacity"' in RENDER,
        "la cinta vectorial volvio a salir siempre opaca: el deslizador de "
        "Opacidad existiria sin hacer nada")
require("dzBrushBordeSuave" in RENDER,
        "se saco la dureza del raster: el motor la calcula y nadie la pintaba")
require("function disperse" in ENGINE and "disperse(resample(" in ENGINE,
        "la dispersion vectorial dejo de aplicarse al eje de la cinta")
require("INERTES" in STUDIO and "pressureOpacity" in STUDIO and "hardness" in STUDIO,
        "el Estudio dejo de declarar que Presion->opacidad y Dureza no existen "
        "en una cinta vectorial: volverian a moverse sin hacer nada")
require("inerte" in (ROOT / "ui" / "design" / "studio-polish.css").read_text(encoding="utf-8"),
        "falta el estilo del deslizador apagado: se veria igual que uno vivo")

# -- Edicion vectorial: nodos --------------------------------------------
NODOS = (ROOT / "ui" / "vector" / "node-editor.js").read_text(encoding="utf-8")
require('src="vector/node-editor.js' in INDEX,
        "el editor de nodos no se carga: la herramienta de puntos queda muerta")
require("function dzPathParse" not in APP and "function dzNodesShow" not in APP,
        "el editor de nodos volvio a app.js")
require("dzNodesHistoria()" in NODOS and "dzNodesCerrarPaso()" in NODOS,
        "el gesto de nodos dejo de agruparse en una transaccion: volveria a "
        "dejar dos pasos de historial y el primer Ctrl+Z no se veria")
require("clearTimeout(DZ_DOC_TIMER)" in NODOS and "dzDocCommit()" in NODOS,
        "el volcado al documento ya no se fuerza dentro del gesto: caeria 260 ms "
        "despues, fuera de la transaccion, como un paso aparte")
require("DZ.history?.cancel?.()" in NODOS,
        "un gesto de nodos cancelado deja la transaccion abierta: el proximo "
        "cambio entraria en ella")
require('cmds.filter(s => s.c !== "Z").length <= 2' in NODOS,
        "se saco el piso del trazado: borrando puntos se podria dejar un trazado "
        "degenerado que no dibuja nada")

# -- Que version corre, y el papel cebolla -------------------------------
BADGE = (ROOT / "ui" / "core" / "version-badge.js").read_text(encoding="utf-8")
POLISH = (ROOT / "ui" / "design" / "studio-polish.css").read_text(encoding="utf-8")
# Los comentarios se sacan: el archivo EXPLICA que esa declaracion murio, y
# buscar el texto a secas encontraria la explicacion en vez de la declaracion.
CSS = re.sub(r"/\*.*?\*/", "", (ROOT / "ui" / "app.css").read_text(encoding="utf-8"), flags=re.S)
require('src="core/version-badge.js' in INDEX,
        "el modulo de version no se carga: la pantalla vuelve a no decir que "
        "build esta corriendo, y un reporte de «no anda» no se puede diagnosticar")
require("dzVersionSync?.(st)" in APP,
        "app.js dejo de sincronizar la version: el chip y el aviso de reinicio "
        "nunca se pintan")
require("binario_reemplazado" in MAIN and '"binario_viejo"' in MAIN,
        "se saco la deteccion de «se instalo con LOW abierto»: es la diferencia "
        "entre «no lo arreglaron» y «no lo reiniciaste»")
require("st_mtime" not in MAIN,
        "volvio la heuristica de la FECHA del ejecutable. No sirve: el instalador "
        "conserva la marca de tiempo del build, que corre en UTC, asi que en una "
        "maquina en UTC-3 el archivo dice estar horas en el futuro y el aviso salta "
        "en TODOS los arranques. Medido: mtime 12:47 con el reloj en 10:16")
require("def version_instalada" in MAIN and "winreg" in MAIN,
        "el aviso dejo de leer la version que el instalador anota: es la unica senal "
        "exacta, porque un ejecutable de un solo archivo no puede leer su propia "
        "version nueva sin desempacarse")
require('ValueName: "Version"' in ISS,
        "el instalador dejo de anotar la version instalada en el registro: sin eso "
        "el aviso de reinicio se queda sin senal")
require("def _version_tupla" in MAIN,
        "se comparan versiones como texto: «4.9.0» daria mayor que «4.26.0»")
require("_ARRANQUE" in MAIN,
        "falta el sello de arranque del proceso: sin el no se puede comparar con "
        "la fecha del ejecutable en disco")
require('log("── arranque ── LOW v%s' in MAIN,
        "el log volvio a escribir el arranque SIN version: es lo que hizo que un "
        "panel se midiera funcionando mientras se probaba otro build")
require("appearance: slider-vertical" not in CSS,
        "volvio `appearance: slider-vertical`, que Chrome elimino en la 121: en un "
        "WebView2 actual es letra muerta y solo confunde")
require("#designView .onion2-channel input[type=range] { height:94px; }" in POLISH,
        "los faders de papel cebolla perdieron su altura explicita: la regla de "
        "#designView les pone 14px con un selector de id, y el escape height:auto "
        "los dejaba en 129px desbordando una fila de grilla de 96")

# -- Mover un plano no es cambiar de cuadro ------------------------------
DOCJS = (ROOT / "ui" / "animation" / "document.js").read_text(encoding="utf-8")
GUARDIA = (ROOT / "ui" / "panels" / "onion-scroll-guard.js").read_text(encoding="utf-8")
require('this.emit("composition"); this.emit("frame")' not in DOCJS,
        "setCompositionTransform volvio a emitir «frame»: ese manejador reemplaza "
        "el lienzo desde el documento y deselecciona, asi que el cambio SIGUIENTE "
        "—la Z, por ejemplo— no hace nada. Medido en la app real")
require('else if (motivo === "composition") dzCompositionAplicar?.()' in APP,
        "nadie atiende el evento «composition»: mover un plano no se veria en el "
        "lienzo")
require("function dzCompositionAplicar" in CMPPAN,
        "falta dzCompositionAplicar: es lo que aplica la transformacion al lienzo "
        "sin repintar su contenido")
require("const lista = planes || []" in MPVIEW and "se muestra la mesa vacia" in MPVIEW,
        "setPlanes volvio a borrar la seleccion con una lista vacia: un repintado "
        "transitorio dejaria el proximo valor sin efecto")
require("if (!previa) this.root.querySelector" in MPVIEW,
        "el inspector volvio a quedarse mudo sin plano elegido")
require('src="panels/onion-scroll-guard.js' in INDEX and "requestAnimationFrame(devolver)" in GUARDIA,
        "se cayo el guardia del salto de scroll: tocar un fader del papel cebolla "
        "correria el panel bajo el puntero")
require('fill="#16171a"' in INDEX and 'fill="#eef0ea"' in INDEX,
        "las flechas de seleccion volvieron a pintarse con currentColor: la NEGRA "
        "salia rellena de blanco y la BLANCA hueca, al reves de como se llaman")

# -- El instrumento de la prueba maestra (§15) ---------------------------
P15 = (ROOT / "ui" / "core" / "session-recorder.js").read_text(encoding="utf-8")
BIBLIA = (ROOT / "docs" / "LOW_BIBLIA_PRODUCCION.md").read_text(encoding="utf-8")
require('src="core/session-recorder.js' in INDEX
        and 'href="design/session-recorder.css' in INDEX,
        "el instrumento de la §15 no se carga")
require('data-act="prueba15"' in INDEX,
        "no hay entrada de menu para la prueba maestra: el instrumento existiria y "
        "nadie podria abrirlo")
require("function dzMenuAction" in APP and '"prueba15"' not in APP,
        "la prueba maestra se cablo dentro de app.js: se atiende interceptando el "
        "clic, justamente para no hacerlo crecer")
require("def session_log" in MAIN and '"sesiones"' in MAIN,
        "el puente no escribe la bitacora: §15 pide que el proceso quede GRABADO "
        "como prueba repetible")

# Los doce pasos tienen que ser LOS DE LA BIBLIA, palabra por palabra. Si el
# instrumento y la §15 se separan, se mide otra cosa que la que se pide.
_i = BIBLIA.index("## 15. Prueba maestra")
_pasos_biblia = re.findall(r"^\s*(\d{1,2})\.\s+(.+?)$", BIBLIA[_i:_i + 1400], re.M)[:12]
require(len(_pasos_biblia) == 12,
        "no pude leer los doce pasos de §15 en la biblia: cambio el formato de la lista")
for _n, _texto in _pasos_biblia:
    require(_texto.strip() in P15,
            "el paso %s de §15 no esta en el instrumento tal como lo pide la biblia: "
            "«%s»" % (_n, _texto.strip()[:60]))
require(P15.count('id: "p') == 12,
        "el instrumento no tiene doce pasos con id estable: dos corridas no se "
        "podrian comparar")

# Las tres cosas que lo harian inutil si se caen.
require("if (!p || !p.inicio) return false" in P15,
        "se puede terminar un paso que nunca se empezo: un tiempo inventado ensucia "
        "la unica medicion limpia que hay")
require('global.addEventListener("error", contar)' in P15,
        "los errores dejaron de contarse solos: un conteo auto-reportado no vale nada")
require('p.ayudas.length && resultado === "ok" ? "con ayuda"' in P15,
        "«con ayuda» volvio a contar como logrado: §15 pide los doce pasos SIN ayuda")
require("aprobada: hechos === this.pasos.length" in P15,
        "el veredicto de §15 dejo de exigir los doce pasos sin ayuda")

# -- Las columnas de §6 en el X-sheet -----------------------------------
XSV = (ROOT / "ui" / "animation" / "xsheet-view.js").read_text(encoding="utf-8")
require("_celdaCamara" in XSV and "_celdaAudio" in XSV and "_celdaEfectos" in XSV,
        "faltan las columnas que §6 pide: «filas son fotogramas; columnas son "
        "niveles, camara, audio y efectos»")
require('"CÁM"' in XSV and '"AUDIO"' in XSV and '"EFEC"' in XSV,
        "las tres columnas fijas perdieron su encabezado")
require("pista.peakAt(f)" in XSV and "pista.peaks[f" not in XSV,
        "la columna de audio lee `peaks` CRUDO: mostraria la onda corrida respecto "
        "de lo que se escucha, porque peakAt es el que aplica el desplazamiento")
require("scene.camera && this.doc.scene.camera.keys" in XSV,
        "la columna de camara dejo de leer scene.camera.keys, que es la fuente que "
        "usa la camara para interpolar")
require(".xs2-fija { flex: 0 0 auto" in CSS,
        "las columnas fijas se estiran como las de capas: el espacio de la hoja es "
        "de los niveles")

# -- Formas: contorno, pincel y deformacion libre -----------------------
# Pedido de Mauro: que la forma nazca SIN RELLENO y solo con contorno, que al
# contorno se le pueda poner un pincel como linea, y que la forma se pueda
# deformar libremente. Las tres tienen que COMPONER: una forma entintada que se
# deforma tiene que seguir siendo tinta sobre la curva nueva.
PINCELF = (ROOT / "ui" / "drawing" / "forma-pincel.js").read_text(encoding="utf-8")
WARP = (ROOT / "ui" / "vector" / "warp-cage.js").read_text(encoding="utf-8")
FORMACSS = (ROOT / "ui" / "design" / "forma.css").read_text(encoding="utf-8")

require('src="drawing/forma-pincel.js' in INDEX
        and 'src="vector/warp-cage.js' in INDEX
        and 'href="design/forma.css' in INDEX,
        "los modulos de forma/pincel/deformacion o su hoja no se cargan: la "
        "herramienta queda muerta sin decir nada")
require(INDEX.index('src="drawing/brush-render.js') < INDEX.index('src="drawing/forma-pincel.js'),
        "el contorno con pincel se carga ANTES que el motor de pincel del que "
        "depende")

# La forma nace sin relleno. Es el pedido textual: «actualmente dibuja rellenos
# rojos». Sin `stroke` una forma sin relleno seria invisible, asi que van los dos.
require("dzFormaRellena" in FORMAS
        and 'el.setAttribute("fill", dzFormaRellena()' in FORMAS,
        "la forma volvio a nacer con el relleno puesto a secas: el pedido es que "
        "nazca solo con contorno, y que rellenarla sea una eleccion")
_forma_crear = FORMAS[FORMAS.index("function dzFormaCrear("):]
_forma_crear = _forma_crear[:_forma_crear.index("/* \u2500\u2500 el texto sigue siendo un clic")]
# La rama de las formas, no la de la linea recta: `stroke` con TRAZO aparece en
# las DOS, asi que buscarlo suelto no prueba nada. Se pide la secuencia.
require(re.search(r'setAttribute\("fill", dzFormaRellena\(\).*?'
                  r'setAttribute\("stroke", TRAZO\).*?'
                  r'setAttribute\("stroke-width", GROSOR\)',
                  _forma_crear, flags=re.S),
        "la forma nace sin contorno: sin relleno Y sin trazo no se ve nada, que "
        "es peor que el bloque rojo")

# El pincel se guarda POR ID Y GROSOR en la forma. Si al re-dibujar se leyera el
# pincel actual, deformar una forma le cambiaria el trazo por el que uno tenga
# elegido en ese momento: el trazo es de la forma, no de la barra.
require('g.setAttribute("data-pincel"' in PINCELF
        and 'g.setAttribute("data-grosor"' in PINCELF,
        "la forma entintada dejo de guardar su pincel y su grosor: al re-dibujarla "
        "—al deformarla, por ejemplo— tomaria el pincel elegido en ese momento")
require('g.setAttribute("data-d"' in PINCELF,
        "la forma entintada dejo de guardar su geometria: los hijos son un RENDER, "
        "y sin el dato no se puede deformar ni volver a entintar")
require("brushId" in PINCELF and "opciones" in BRUSH_RENDER,
        "dzBrushFinalElement dejo de aceptar un pincel explicito, asi que el "
        "contorno de una forma se re-dibujaria con el pincel de la barra")

# La jaula de deformacion vive DENTRO de #dzCanvas: sin estar en DZ_UI_SEL el
# lienzo se come sus propios clics. Es la leccion de v4.29.0 con la invitacion.
_APP_COD = re.sub(r"/\*.*?\*/", "", APP, flags=re.S)
_APP_COD = re.sub(r"//.*$", "", _APP_COD, flags=re.M)
_ui_sel = _APP_COD[_APP_COD.index("const DZ_UI_SEL"):]
_ui_sel = _ui_sel[:_ui_sel.index(";")]
require(".dz-warp" in _ui_sel,
        "la jaula de deformacion no esta en DZ_UI_SEL: el lienzo tomaria sus "
        "puntos por dibujo y el preventDefault del trazo se comeria los clics, "
        "exactamente lo que paso con la invitacion del 2D en v4.29.0")
require('data-act="deformar"' in INDEX and "deformar: () => window.dzWarpAlternar" in APP,
        "no hay manera de abrir la deformacion libre: se perdio la entrada de menu "
        "o su accion")
require("animation.rigMalla = rigMalla" in SCENE_MODEL,
        "la malla dejo de exportarse: la deformacion libre se queda sin matematica "
        "y no deforma nada, en silencio")

# Un tiron de la jaula es UN paso. Hay dos historiales —el del lienzo y el del
# documento, que vuelca con 260 ms de retardo— y sin transaccion hacian falta
# dos Ctrl+Z. Medido: 2 pasos.
require("function abrirPaso" in WARP and "function cerrarPaso" in WARP
        and 'abrirPaso("Deformar")' in WARP
        and "cerrarPaso();" in WARP
        and "DZ.history.begin(etiqueta" in WARP
        and "dzDocCommit()" in WARP,
        "la deformacion volvio a dejar DOS pasos de historial por gesto: hay que "
        "abrir transaccion y forzar el volcado al documento adentro")
# Reponer tiene que devolver el dibujo ORIGINAL. Pasar la geometria por la malla
# en reposo la re-muestrea: un rectangulo queda convertido en una polilinea de
# trescientos puntos, igual al ojo y distinta como dato.
require("function enReposo" in WARP and "restaurarBase" in WARP,
        "Reponer volvio a pasar la geometria por la malla en reposo: devuelve una "
        "copia equivalente en vez del dibujo original")
require(".dz-warp-punto" in FORMACSS and "pointer-events: auto" in FORMACSS,
        "los puntos de la jaula quedaron sin recibir el puntero: la superposicion "
        "entera es pointer-events:none para no tapar el dibujo, y los puntos son "
        "la excepcion")

# -- `DZ` NO VIVE EN window, y ya me morfo tres veces -------------------
# DZ se declara con `const` en app.js, asi que es un binding lexico que los
# scripts clasicos comparten pero NO una propiedad de window. Leerlo como
# window.DZ o global.DZ devuelve undefined en silencio: la invitacion del 2D no
# se iba nunca (v4.28.0) y la jaula de deformacion decia «elegi un dibujo» con
# el dibujo elegido. Lo mismo pasa con `api`.
def _lee_sin_comentarios(ruta):
    txt = ruta.read_text(encoding="utf-8")
    txt = re.sub(r"/\*.*?\*/", "", txt, flags=re.S)
    return re.sub(r"^\s*//.*$", "", txt, flags=re.M)


def _lee_por_window(codigo, nombre):
    """Devuelve las lecturas de `nombre` como propiedad de window/global.

    SIN REGEX A PROPOSITO. La primera version usaba una con \\b y el heredoc
    que la escribio convirtio esa secuencia en un BYTE DE RETROCESO de verdad
    (0x08): el patron pedia un caracter invisible despues de DZ, no podia
    coincidir nunca, y el contrato pasaba en verde con la violacion puesta.
    Lo encontro `cat -A`, no el ojo. Buscando el texto a mano no hay escapado
    que se pueda arruinar.
    """
    encontradas = []
    for prefijo in ("window.", "global.", "globalThis."):
        aguja = prefijo + nombre
        desde = 0
        while True:
            i = codigo.find(aguja, desde)
            if i < 0:
                break
            desde = i + len(aguja)
            siguiente = codigo[desde:desde + 1]
            # window.DZ_FORMA y window.dzAlgo NO son esto: se pide el nombre
            # completo, no un prefijo de otro identificador.
            if not (siguiente.isalnum() or siguiente == "_"):
                encontradas.append(aguja)
    return encontradas


_MODULOS = sorted((ROOT / "ui").rglob("*.js"))
for _f in _MODULOS:
    if _f.name == "app.js":
        continue
    _txt = _f.read_text(encoding="utf-8")
    _cod = re.sub(r"/\*.*?\*/", "", _txt, flags=re.S)
    _cod = re.sub(r"^\s*//.*$", "", _cod, flags=re.M)
    require(not _lee_por_window(_cod, "DZ"),
            "en " + _f.name + " se lee DZ como propiedad de window/global: DZ es "
            "`const` en app.js, asi que eso es undefined EN SILENCIO. Hay que "
            "nombrarlo suelto, con guarda `typeof DZ !== \"undefined\"`")
    require(not _lee_por_window(_cod, "api"),
            "en " + _f.name + " se lee api como propiedad de window/global: `api` "
            "tambien es `const` en app.js y eso es undefined en silencio")

# -- El modulo 2D es la primera pantalla --------------------------------
INICIAL = (ROOT / "ui" / "application" / "pantalla-inicial.js").read_text(encoding="utf-8")
# SIN COMENTARIOS. El archivo EXPLICA por que no hay que usar closeDesign ni
# designEntry en el arranque, asi que buscar el texto a secas encuentra la
# explicacion en vez del uso. Ya me paso con `appearance: slider-vertical` en
# app.css: el contrato mordio su propio comentario.
INICIAL_COD = re.sub(r"/\*.*?\*/", "", INICIAL, flags=re.S)
INICIAL_COD = re.sub(r"^\s*//.*$", "", INICIAL_COD, flags=re.M)
require('src="application/pantalla-inicial.js' in INDEX
        and 'href="design/pantalla-inicial.css' in INDEX,
        "el modulo de la primera pantalla no se carga: LOW volveria a abrir en el "
        "lado programador")
require("window.dzPantallaInicial?.()" in APP,
        "la primera pantalla no se llama en el arranque, o se llama por un "
        "identificador SUELTO: con `?.` un identificador no declarado lanza "
        "ReferenceError y init() muere ahi, dejando el programa en nada")
require("typeof DZ === \"undefined\"" in INICIAL_COD,
        "el modulo volvio a leer DZ por window. DZ se declara con const en app.js: "
        "window.DZ NO existe, y leerlo asi dejaba la invitacion puesta para siempre")
require("function dzVolverAlEstudio" in INICIAL_COD and "pluma.onclick = dzVolverAlEstudio" in INICIAL_COD,
        "la vuelta al estudio volvio a pasar por designEntry(), que llama a "
        "new_design() y ESCRIBE un archivo: con la IA detras de un boton el viaje "
        "es constante y dejaria un SVG por cada vuelta")
# El cuerpo de dzPantallaInicial —lo que corre EN EL ARRANQUE— no puede llamar
# al camino que crea archivos. dzVolverAlEstudio si puede: ahi es el ultimo
# recurso cuando de verdad no hay nada abierto.
_cuerpo = INICIAL_COD[INICIAL_COD.index("function dzPantallaInicial("):]
_cuerpo = _cuerpo[:_cuerpo.index("global.dzPantallaInicial =")]
require("designEntry" not in _cuerpo,
        "el arranque volvio a usar designEntry(), que llama a new_design() y "
        "ESCRIBE un archivo: dejaria un SVG nuevo por cada vez que se abre LOW")
require("designEntry" in INICIAL_COD,
        "se perdio el ultimo recurso de dzVolverAlEstudio para cuando no hay nada "
        "abierto")
# A02 DEL PLAN MAESTRO: desde el estudio 2D tiene que haber puerta al 3D, y
# cambiar de pantalla tiene que CERRAR el 3D.
#
# La unica entrada al estudio 3D es #abL3d en la barra izquierda, y esa barra
# queda TAPADA por #designView (position:fixed; inset:0). Medido con
# elementFromPoint: con el 2D abierto, el punto medio de la pluma y del boton 3D
# devuelve #designView. Mientras LOW abria en el lado programador no se notaba;
# desde que el 2D es la primera pantalla el 3D quedo sin entrada.
# Se pide la LLAMADA en secuencia, no la mencion: dejar la funcion definida y
# no llamarla es exactamente la regresion que hay que agarrar, y buscar el
# nombre suelto encuentra su propia definicion.
require("function dzIrAl3D" in INICIAL_COD and "openL3d" in INICIAL_COD
        and re.search(r"insertBefore\(boton, cerrar\);\s*ponerBoton3D\(cerrar\);", INICIAL_COD),
        "se perdio la puerta del estudio 2D al estudio 3D: la unica que queda es "
        "el boton de la barra izquierda, y esa barra esta tapada por #designView")
# Y el 3D esta en z-index 62 contra el 61 del 2D, asi que mostrar el 2D sin
# cerrarlo deja al dibujante pidiendo volver al dibujo y mirando otra pantalla.
_ida = INICIAL_COD[INICIAL_COD.index("function dzIrAlAgente"):]
_ida = _ida[:_ida.index("function dzVolverAlEstudio")]
_vuelta = INICIAL_COD[INICIAL_COD.index("function dzVolverAlEstudio"):]
_vuelta = _vuelta[:_vuelta.index("function cerrarEl3D")]
require("cerrarEl3D()" in _ida and "cerrarEl3D()" in _vuelta,
        "cambiar de pantalla dejo de cerrar el estudio 3D: #l3dView esta en "
        "z-index 62 y #designView en 61, asi que el 3D queda TAPANDO el dibujo")

# ── A03: EL ALMACENAMIENTO DE LA INTERFAZ TIENE QUE SOBREVIVIR AL CIERRE ──
#
# pywebview 6.x trae `private_mode=True` —perfil efimero— y `http_port=None`,
# asi que la interfaz se servia desde un puerto AL AZAR en cada arranque.
# `localStorage` es por ORIGEN, asi que LOW estrenaba almacenamiento vacio cada
# vez. Medido con una clave testigo: escrita en http://127.0.0.1:17446 y, tras
# cerrar y reabrir, {testigo: null, claves: 0} en http://127.0.0.1:61150.
#
# Lo que se perdia en cada arranque: el rescate ante caida (probado en la app
# real: trazo sin guardar + cierre forzado = nada al reabrir), los pinceles, la
# disposicion de paneles y el espacio de trabajo activo. Esto es PERDIDA DE
# DATOS, asi que tiene contrato.
_MAIN_COD = re.sub(r"#.*$", "", MAIN, flags=re.M)
require("private_mode=False" in _MAIN_COD,
        "webview.start volvio a arrancar en modo privado: el perfil es efimero y "
        "LOW pierde en cada cierre el rescate ante caida, los pinceles y la "
        "disposicion de paneles")
require("storage_path=perfil" in _MAIN_COD,
        "webview.start dejo de recibir un storage_path propio: el almacenamiento "
        "queda donde pywebview quiera y no es predecible")
require("http_port=puerto" in _MAIN_COD and "LOW_UI_PORT" in _MAIN_COD,
        "la interfaz volvio a servirse desde un puerto al azar: localStorage es "
        "por origen, asi que cada arranque estrena almacenamiento vacio")
require("_puerto_libre(LOW_UI_PORT)" in _MAIN_COD,
        "el puerto fijo dejo de comprobarse antes de arrancar: si estuviera "
        "ocupado, LOW no abriria")

# Y el rescate se OFRECE al arrancar. El ofrecimiento vive dentro de dzDocInit,
# que solo corre al crear o abrir un documento; desde que LOW abre SIN documento,
# quien volvia despues de un cierre forzado veia un estudio vacio y ninguna senal
# de que su trabajo estaba guardado.
require("function hayRescate" in INICIAL_COD
        and "low.document.recovery." in INICIAL_COD
        and "sceneRecovery" in INICIAL_COD,
        "la invitacion dejo de ofrecer el rescate ante caida, o dejo de mirar el "
        "rescate del DOCUMENTO —que es el que se escribe cada 450 ms y el que "
        "tiene los ultimos trazos; el de la escena se escribe en momentos mas "
        "gruesos y medido traia el lienzo vacio")
# Se pide el BOTON, no la mencion: el selector del handler contiene el mismo
# texto, asi que buscarlo suelto pasa en verde con el boton borrado.
require('<button type="button" data-a="rescate"' in INICIAL_COD
        and "bien2d-rescate" in INICIAL_COD,
        "se perdio la accion de recuperar en la invitacion")
require("openDesign?.(rescate.ruta)" in INICIAL_COD,
        "el rescate del documento dejo de abrirse por openDesign, que es quien lo "
        "consume y quien pregunta que version se quiere")

# ── C02: UN PUNTO 2D MUEVE LOS DOS EJES ────────────────────────────────
#
# El modelo guardaba `link.partner` con su eje desde el principio, pero la
# interfaz movia el tirador en UN eje y escribia UN canal: el «punto 2D» era un
# control de una dimension dibujado dentro de un cuadrado. Sirve para lo que
# tiene que servir —la mirada de un ojo, la inclinacion de una cabeza— solo si
# un arrastre mueve los dos canales.
MANDOS = (ROOT / "ui" / "rigging" / "rig-control-ui.js").read_text(encoding="utf-8")
_MANDOS_COD = re.sub(r"/\*.*?\*/", "", MANDOS, flags=re.S)
_MANDOS_COD = re.sub(r"^\s*//.*$", "", _MANDOS_COD, flags=re.M)
require("function socioDe" in _MANDOS_COD
        and "previsualizar(s, socio, valorSocio)" in _MANDOS_COD,
        "el punto 2D dejo de escribir el canal de su socio: vuelve a ser un control "
        "de UNA dimension dibujado dentro de un cuadrado")
require("if (esSocioDeOtro(s, control)) continue;" in _MANDOS_COD,
        "el socio de un punto 2D volvio a dibujarse aparte: un solo control se veria "
        "como dos cuadrados y no se sabria cual agarrar")
# Los dos canales en UNA transaccion: setRigControlValue deja un paso por canal.
require('h.begin("Mover el punto 2D")' in _MANDOS_COD
        and "setRigControlValue(socio.id" in _MANDOS_COD
        and "if (abre) h.commit();" in _MANDOS_COD,
        "el arrastre del punto 2D volvio a dejar DOS pasos de historial: hacen falta "
        "dos Ctrl+Z para deshacer un solo gesto")

require("closeDesign" not in INICIAL_COD,
        "el boton a la IA volvio a usar closeDesign(), que CIERRA EL DOCUMENTO: "
        "cambiar de pantalla te haria perder el dibujo")

# La invitacion vive DENTRO de #dzCanvas, asi que sin estar en la lista de UI
# flotante el lienzo la trata como dibujo: `dzPointerDown` seleccionaba el
# <button> como si fuera arte y su `preventDefault()` se comia el click que el
# navegador iba a generar. Los botones no hacian NADA.
require(".bien2d" in APP and "DZ_UI_SEL" in APP
        and ".bien2d" in APP[APP.index("DZ_UI_SEL"):APP.index("DZ_UI_SEL") + 700],
        "la invitacion del 2D no esta en DZ_UI_SEL: el lienzo la toma por dibujo, "
        "selecciona el <button> y su preventDefault() se come el click, asi que "
        "los botones de la primera pantalla no hacen nada")
# Medido en la app real: con un diseno .svg abierto —dos pestanas, siete
# cuadros— DZ.path y DZ.doc estaban los DOS en null, asi que la invitacion se
# quedaba clavada TAPANDO el documento. Las pestanas son la contabilidad real.
require("documentTabs" in INICIAL_COD,
        "hayTrabajoAbierto() volvio a mirar solo DZ.path y DZ.doc: con un diseno "
        "abierto los dos estan en null y la invitacion se queda CLAVADA encima "
        "del documento. La contabilidad real son las pestanas (documentTabs)")
require(re.search(r"lienzo\.appendChild\(caja\);\s*vigilar\(\);", INICIAL_COD),
        "la invitacion se pinta sin dejar el reloj vigilando: armado una sola vez "
        "en el arranque, una invitacion REPINTADA al volver de la IA no la vigila "
        "nadie y se vuelve a clavar encima del documento")
# EL ESTUDIO NO PUEDE ESPERAR AL CHAT. Medido en la app real: aparecia a los
# 6.542 ms, porque la llamada del arranque esta al final de init(), detras de
# api.get_state(), loadChatTabs() y resume(). Hasta entonces se veia la pantalla
# vieja, que es el segundo reporte de Mauro.
require("function dzPantallaInicialTemprano" in INICIAL_COD
        and 'addEventListener("DOMContentLoaded", dzPantallaInicialTemprano' in INICIAL_COD,
        "se perdio la fase TEMPRANA de la primera pantalla: sin ella el estudio "
        "aparece cuando termina init() —detras de api.get_state(), loadChatTabs() y "
        "resume()—, o sea el 2D esperando a que cargue el chat de la IA, y hasta "
        "entonces se ve la pantalla vieja")
_temprano = INICIAL_COD[INICIAL_COD.index("function dzPantallaInicialTemprano"):]
_temprano = _temprano[:_temprano.index("function dzPantallaInicial(")]
require("onclick" not in _temprano,
        "la fase temprana re-cablea la pluma: no sirve, porque bind() le pone "
        "designEntry DESPUES de las esperas del arranque y pisaria esto. El "
        "re-cableado va en la fase tardia")
# La fase temprana pinta ANTES de que exista el puente, asi que sus acciones no
# pueden estar usables: un boton visible que no hace nada es justo el defecto
# que se arreglo en v4.29.0.
require(re.search(r'data-a="nuevo"[^>]*disabled', INICIAL_COD)
        and re.search(r'data-a="abrir"[^>]*disabled', INICIAL_COD),
        "las acciones de la invitacion nacen usables: la fase temprana pinta antes "
        "de que exista el puente de Python, asi que «Nuevo documento» seria un boton "
        "visible que no hace nada")
require("habilitar()" in _cuerpo,
        "nadie prende las acciones de la invitacion: nacen apagadas para la fase "
        "temprana y se quedarian apagadas para siempre")
require("vueltas" not in INICIAL_COD,
        "volvio el tope de vueltas del reloj que vigila la invitacion: el caso en "
        "que el reloj sigue corriendo es exactamente el caso en que la invitacion "
        "todavia esta en pantalla, y rendirse ahi la deja pegada para siempre")


# -- La UI flotante del lienzo no se come el dibujo ---------------------
# De donde salio esto: arreglando una prueba ajena que decia «Bomba no engrosa
# pincel». No era la bomba: con el trazo SELECCIONADO, un tirador de la caja de
# seleccion tapaba la linea, y con el encuadre de camara a la vista NO SE PODIA
# DIBUJAR en toda la mesa —el marco movia la camara en vez de dejar el trazo—.
# Son overlays transparentes que se llevan el puntero, que es la familia de
# defectos que Mauro reporta como «no anda nada».
AYUDA_HERRAMIENTAS = re.sub(r"^\s*//.*$", "",
    re.sub(r"/\*.*?\*/", "", (ROOT / "ui" / "panels" / "tool-help.js").read_text(encoding="utf-8"), flags=re.S),
    flags=re.M)
require('#dzCanvas:not([data-tool="camera"]) .dz-cam' in CSS
        and re.search(r'#dzCanvas:not\(\[data-tool="camera"\]\) \.dz-cam \{[^}]*pointer-events:\s*none', CSS),
        "el encuadre de camara volvio a agarrar el puntero fuera del modo camara: "
        "es un div transparente que tapa toda la mesa, asi que con el encuadre a la "
        "vista no se puede dibujar y cada intento MUEVE la camara y deja clave")
_cam_toggle = APP[APP.index("function dzCamToggle()"):]
_cam_toggle = _cam_toggle[:_cam_toggle.index("function dzCamCur()")]
require('$("#dzCanvas").dataset.tool = DZ.tool' in _cam_toggle,
        "dzCamToggle escribe DZ.tool a mano sin pasar por dzSetTool y ya no "
        "sincroniza el atributo de #dzCanvas: el CSS decide con ESE atributo si el "
        "encuadre agarra el puntero, asi que la camara queda inmovil")
require(re.search(r'#dzCanvas\[data-tool="handler"\] \.dz-selbox \.dz-sh', CSS)
        and re.search(r'#dzCanvas\[data-tool="(iron|pliers|magnet|inflator)"\] \.dz-selbox \.dz-sh', CSS),
        "los tiradores de la caja de seleccion volvieron a comerse el puntero con "
        "las herramientas que trabajan SOBRE el dibujo: apretar sobre un trazo "
        "seleccionado redimensionaba la seleccion en vez de bombear, planchar, "
        "cortar o deformar, y la herramienta pedia «acercate mas a una linea» "
        "estando justo encima")
require("elementsFromPoint" in APP
        and re.search(r"const el = document\.elementsFromPoint\(clientX, clientY\)\.find\([^)]*DZ_UI_SEL\)", APP),
        "dzPickStroke volvio a mirar solo el elemento de ARRIBA: cualquier overlay "
        "flotante del lienzo —caja de seleccion, jaula de deformacion, encuadre— "
        "deja a las herramientas vectoriales sin encontrar el trazo que tienen debajo")
require("#dzToolsDrawer button[title]" in AYUDA_HERRAMIENTAS,
        "la ayuda al pasar el puntero dejo de alcanzar el cajon de herramientas: "
        "el cajon se cuelga del BODY y no de #designView, asi que las unicas "
        "herramientas sin ayuda serian justo las que nadie conoce de memoria "
        "—bomba, plancha, pinza, iman, inflador, pivote, espejo—")


# -- La exportacion de animacion no pierde cuadros ----------------------
# El inventario de A01 dijo que esto no lo probaba nadie. Lo primero que
# aparecio al probarlo: el exportador SALTEABA los cuadros vacios, asi que un
# cuadro en blanco en el medio adelantaba un cuadro todo lo que venia despues y
# la app informaba «4 cuadros (F1 a F5)», contradiciendose sola.
EXPORT_CUADROS = (ROOT / "ui" / "animation" / "export-cuadros.js").read_text(encoding="utf-8")
require('src="animation/export-cuadros.js' in INDEX,
        "el modulo del cuadro en blanco no se carga: dzExportCuadroEnBlanco queda "
        "sin definir y la exportacion tira ReferenceError en el primer cuadro vacio")
_export_doc = APP[APP.index("async function dzDoExportDoc(kind)"):]
_export_doc = _export_doc[:_export_doc.index("async function dzExportSpritesheet")]
require("dzExportCuadroEnBlanco(DZ.doc.scene)" in _export_doc and "continue;" not in _export_doc,
        "volvio el `continue` del cuadro vacio en dzDoExportDoc: un cuadro en blanco "
        "es un cuadro, y saltearlo ADELANTA un cuadro todo lo que sigue al hueco. "
        "El timing es la materia del oficio y se rompia en silencio, al final del trabajo")
require("dzExportAvisoFaltantes(pngs.length, cuadros.length)" in APP,
        "la exportacion volvio a informar como si todo hubiera salido bien cuando "
        "salieron MENOS cuadros de los pedidos: el que exporta se entera en el montaje")
require("dzIsCanvasBackground" in EXPORT_CUADROS,
        "el cuadro en blanco dejo de tomar el papel del lienzo: si sale transparente, "
        "en MP4 y GIF el codec lo rellena de negro y el hueco aparece como un fogonazo")
require("ancho = max(3, len(str(len(imgs))))" in MAIN
        and "_{i + 1:0{ancho}d}.png" in MAIN,
        "el relleno de ceros de la secuencia PNG volvio a ser fijo: con 1000 cuadros "
        "—42 segundos a 24 fps— `_1000.png` se ordena ANTES de `_999.png` y la "
        "secuencia entra desordenada al montaje")
require("for previo in outdir.glob(" in MAIN,
        "la exportacion PNG dejo de limpiar la toma anterior: exportar 1000 cuadros y "
        "despues 10 deja 990 cuadros viejos en la carpeta, y el importador se lleva "
        "una secuencia mezclada de dos versiones")


# -- El texto sobrevive a un repintado del lienzo -----------------------
# El lienzo se repinta solo y en cada repintado el nodo <svg> se REEMPLAZA. La
# sesion de texto se ataba a ese nodo, asi que un repintado tiraba EN SILENCIO
# todo lo tecleado. Aparecio como un fallo que solo daba en CI.
TEXTO = re.sub(r"^\s*//.*$", "", (ROOT / "ui" / "drawing" / "text-tool.js").read_text(encoding="utf-8"), flags=re.M)
require("session.svg" not in TEXTO,
        "la edicion de texto volvio a atarse al nodo <svg> que tenia cuando se "
        "abrio: el lienzo se repinta solo y reemplaza ese nodo, asi que un "
        "repintado tira sin avisar todo lo que la persona estaba escribiendo")
require("DZ.doc?.frame!==session.frame)dzTextEditFinish(false)" in TEXTO.replace(" ", ""),
        "el vigilante de la edicion de texto dejo de mirar el cuadro, o volvio a "
        "cancelar por repintado: lo que invalida un texto a medio escribir es "
        "cambiar de documento o de cuadro, no que el lienzo se haya repintado")


# -- Un documento nuevo es un archivo .low ------------------------------
# Mauro pregunto si ya existian los .low. En su workspace habia 157 dibujos
# sueltos —138 en blanco— y CERO .low: «Nuevo documento» escribia un SVG y la
# escena se quedaba en memoria. Y al abrir un .low en frio el editor escribia el
# dibujo en la hoja de ROTOSCOPIA, oculta, y el commit siguiente lo VACIABA.
ESCENA_NUEVA = re.sub(r"^\s*//.*$", "",
    re.sub(r"/\*.*?\*/", "", (ROOT / "ui" / "animation" / "escena-nueva.js").read_text(encoding="utf-8"), flags=re.S),
    flags=re.M)
require('src="animation/escena-nueva.js' in INDEX,
        "el modulo del documento nuevo no se carga: dzEscenaNueva queda sin definir "
        "y «Nuevo documento» tira ReferenceError")
_doc_new = APP[APP.index("async function dzDocumentNew()"):]
_doc_new = _doc_new[:_doc_new.index("async function dzDocumentClose()")]
require("dzEscenaNueva()" in _doc_new and "new_design" not in _doc_new,
        "«Nuevo documento» volvio a escribir un dibujo suelto con new_design(): la "
        "escena se quedaria otra vez en memoria y cada arranque dejaria un SVG en "
        "blanco en disenos/ —en el workspace de Mauro habia 138")
require("dzHojaDeDibujoAsegurar(doc.scene)" in APP,
        "dzDocUse dejo de asegurar la hoja del dibujo: dentro de #dzCanvas hay otros "
        "<svg> hijos (rotoscopia, esqueleto, malla) que van ANTES en el HTML, asi que "
        "el editor escribiria el dibujo en un overlay oculto y el primer commit "
        "vaciaria el documento abierto")
require('"dzRigOverlay", "dzMocapSheet", "dzMeshOverlay"' in ESCENA_NUEVA,
        "la hoja del dibujo ya no distingue las hojas del editor: si alguna queda "
        "primera, todo lo que se dibuje va a un overlay oculto")
require("def new_scene(s, content)" in MAIN and '.low"' in MAIN.split("def new_scene")[1][:1400],
        "el puente dejo de crear el documento de escena .low")
require("while fp.exists():" in MAIN.split("def new_scene")[1][:1400],
        "new_scene dejo de esquivar los nombres repetidos: dos documentos creados "
        "dentro del mismo segundo irian al MISMO archivo y el segundo pisaria al "
        "primero")


# -- El menu «Copiar» del chat no revienta al cerrarse -------------------
# Salio del low.log de Mauro: «Uncaught TypeError: Cannot read properties of
# null (reading 'querySelector') @app.js:276». El menu se cierra SOLO —click,
# scroll en captura, blur; y el chat se autodesplaza al llegar una respuesta— y
# el callback del requestAnimationFrame leia la variable ya puesta en null.
require("const menu = ctxMenu; requestAnimationFrame(() => menu.querySelector" in APP,
        "el foco del menu contextual volvio a leer la variable `ctxMenu` dentro del "
        "requestAnimationFrame: si el menu se cierra antes del cuadro siguiente —y se "
        "cierra solo— la variable esta en null y tira una excepcion no atrapada")


# -- Premiere: el XML nombra archivos que existen -----------------------
# El nombre de los cuadros lo calculan DOS lados: el frontend lo escribe dentro
# del XML y `export_premiere` escribe los archivos. Tenian reglas distintas de
# limpieza —el puente hacia strip("_") y el frontend no—, asi que con una escena
# «El Gato (final)» el XML pedia El_Gato_final__0001.png y el puente escribia
# El_Gato_final_0001.png: Premiere abre eso con TODOS los cuadros perdidos.
require(r'.replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "")' in APP,
        "el nombre de los cuadros para Premiere volvio a limpiarse con otra regla que "
        "la del puente (que hace strip('_')): el XML nombraria archivos que no existen "
        "y la secuencia abriria con los cuadros perdidos, pidiendo relinkear")
require('.strip("_")' in MAIN.split("def export_premiere")[1][:900],
        "export_premiere dejo de recortar los guiones bajos del nombre: la otra mitad "
        "de la misma regla")

# -- El log de diagnostico de tableta tiene tope ------------------------
# Medido en la maquina de Mauro: 23 MB creciendo desde agosto dentro de %APPDATA%.
require("DIAG_LOG_TOPE" in MAIN and "cola = p.read_bytes()[-(s.DIAG_LOG_TOPE // 2):]" in MAIN,
        "el log de diagnostico de tableta volvio a crecer sin techo, o recorta "
        "guardando el PRINCIPIO: para diagnosticar sirve lo ultimo que paso")


# -- Achicar o deformar no cambia el espesor del contorno ---------------
# Reportado por Mauro con la v4.37.0 puesta. Redimensionar escribia una
# `transform` con la escala, y en SVG eso escala TAMBIEN el trazo: con la
# deformacion libre los lados verticales se pintaban con el factor X y los
# horizontales con el factor Y. Medido: 0,32 px contra 4,52 px en la misma forma.
ESCALA_GEO = re.sub(r"^\s*//.*$", "",
    re.sub(r"/\*.*?\*/", "", (ROOT / "ui" / "vector" / "escala-geometrica.js").read_text(encoding="utf-8"), flags=re.S),
    flags=re.M)
require('src="vector/escala-geometrica.js' in INDEX,
        "el modulo de escalado por geometria no se carga: dzEscalaGeometrica queda sin "
        "definir y redimensionar tira ReferenceError")
require(APP.count("dzEscalaGeometrica(") == 2,
        "un camino de redimensionado volvio a escalar con `transform` en vez de escalar "
        "la geometria: son dos —el tirador de una forma y el de la seleccion multiple— y "
        "con transform el contorno cambia de espesor, distinto en cada lado")
require("dzEscalaCapturar(el)" in APP and "dzEscalaCapturar(n)" in APP,
        "el redimensionado dejo de capturar la geometria ORIGINAL al empezar el gesto: "
        "escalar sobre lo ya escalado acumula redondeos y deforma el dibujo de a poco")
require('stroke-width' not in ESCALA_GEO,
        "el escalado por geometria empezo a tocar el `stroke-width`: el contorno tiene "
        "que quedar EXACTAMENTE como estaba, y por eso este modulo no lo escribe nunca")


# -- Una segunda instancia de LOW abre ----------------------------------
# Fijar el perfil (v4.32.0) evito perder pinceles y rescate, pero WebView2 lo
# toma EN EXCLUSIVA: con LOW abierto, una segunda instancia no abria ni mostraba
# nada —solo 0x8007139F y una traza de .NET en el log—.
require("_perfil_libre(str(data_dir()" in MAIN
        and '"EBWebView", "lockfile"' in MAIN,
        "el arranque volvio a usar el perfil fijo sin mirar si otra instancia lo tiene "
        "tomado: con LOW ya abierto, la segunda instancia no abre en absoluto "
        "(0x8007139F, sin ventana ni aviso). La señal es el candado del propio WebView2, "
        "`EBWebView/lockfile`, que tambien delata a una instancia de una version anterior")


# -- Las herramientas de vector tienen de donde agarrar -----------------
# Reportado por Mauro: «las herramientas de vector no funcionan en general».
# Midiendo aparecio la causa comun: una curva recien dibujada tiene DOS anclas,
# las dos en las puntas, y todas trabajan sobre anclas. El iman decia
# «Deformacion aplicada» sin mover nada y los nodos no daban donde tocar.
PUNTOS_LINEA = (ROOT / "ui" / "vector" / "puntos-linea.js").read_text(encoding="utf-8")
INFLAR = re.sub(r"^\s*//.*$", "",
    re.sub(r"/\*.*?\*/", "", (ROOT / "ui" / "vector" / "inflar-linea.js").read_text(encoding="utf-8"), flags=re.S),
    flags=re.M)
NODOS = re.sub(r"^\s*//.*$", "",
    re.sub(r"/\*.*?\*/", "", (ROOT / "ui" / "vector" / "node-editor.js").read_text(encoding="utf-8"), flags=re.S),
    flags=re.M)
require('src="vector/puntos-linea.js' in INDEX and 'src="vector/inflar-linea.js' in INDEX,
        "los modulos de puntos e inflado no se cargan: agregar un punto y el inflador "
        "tiran ReferenceError")
require("dzPuntoAgregar(el" in NODOS,
        "la herramienta de nodos dejo de poder AGREGAR un punto sobre la linea: sin eso "
        "una curva dibujada tiene dos anclas en las puntas y en el medio no hay nada que "
        "agarrar, que es por lo que las herramientas de vector parecian rotas")
require("function dzCubicaPartir(" in PUNTOS_LINEA
        and "dzCubicaPartir(desde," in PUNTOS_LINEA,
        "el punto nuevo dejo de insertarse partiendo la curva (De Casteljau): agregar un "
        "punto deformaria el dibujo, que es una deformacion disfrazada de ayuda")
require("dzMagnetAsegurarAncla(" in APP,
        "el iman volvio a tirar solo de las anclas que ya existen: apoyado en el medio de "
        "una curva no mueve NADA y encima avisa «Deformacion aplicada»")
require("data-low-brush-points" in INFLAR and "altKey ? 0.94" in APP + INFLAR,
        "el inflador dejo de inflar la LINEA punto por punto o perdio el Alt para "
        "desinflar: se pidio que sea como el Pump de OpenToonz")
_inflador = APP[APP.index("function dzInflatorDown(e)"):]
_inflador = _inflador[:_inflador.index("function dzHandlerDown(e)")]
require("dzPathBuild" not in _inflador and "setAttribute(\"points\"" not in _inflador,
        "el inflador volvio a escalar la GEOMETRIA como un globo: lo que tiene que "
        "inflar es la linea, no la forma")


# -- El taller: espacios, inflar por tramo, formas y zona de camara -----
# Cuatro pedidos de Mauro sobre la v4.39.0. El primero era una REGRESION MIA:
# el flujo nuevo de documento (v4.36.0) no pasa por openDesign, que era quien
# montaba las pestañas de espacios de trabajo.
CAMARA_GUIA = (ROOT / "ui" / "animation" / "camara-guia.js").read_text(encoding="utf-8")
require("dzWsInit()" in ESCENA_NUEVA and 'dzWsInit();' in APP,
        "el documento nuevo volvio a abrir SIN las pestañas de espacios de trabajo: "
        "las montaba openDesign y estos caminos no pasan por ahi. Mauro las llamo "
        "«fundamental»")
require('localStorage.getItem("low.inflador.modo") === "pareja" ? "pareja" : "tramo"' in INFLAR,
        "el inflador dejo de arrancar POR TRAMO: se pidio que inflar parejo sea una "
        "opcion de la herramienta y no el comportamiento por defecto")
require("function dzLineaAAnchoVariable(" in INFLAR
        and "dzLineaAAnchoVariable(el)" in INFLAR and "toInflarModo" in INFLAR,
        "se perdio el paso a ancho variable o la opcion de la herramienta: un trazo "
        "con un solo grosor no puede tener un tramo mas gordo que otro")
require('["rect", "circle", "ellipse"].includes(t) && typeof dzFormaConvertir' in NODOS,
        "una forma basica volvio a no tener nodos editables: no se puede dibujar a "
        "partir de formas basicas y despues ajustarlas")
require('src="animation/camara-guia.js' in INDEX and "dzCamGuiaActiva" in CAMARA_GUIA
        and "dzCamGuiaActiva()" in APP,
        "la zona de camara dejo de marcarse en pantalla: sin eso no se sabe que entra "
        "en el plano hasta exportar, que es tarde")


# -- La flecha del tirador gira con la forma ----------------------------
# La caja de seleccion gira con un `transform`, pero el cursor de cada tirador
# esta escrito en el CSS y esos no giran: con la forma a 90 grados, el tirador
# que estira a lo ancho mostraba la flecha VERTICAL. Lo reporto Mauro.
require("dzCursoresDeCaja(box, angle)" in APP
        and "function dzCursoresDeCaja(" in ESCALA_GEO,
        "la flecha del tirador volvio a quedar fija: con la forma girada dice una cosa "
        "y el arrastre hace otra")


# -- El esqueleto se edita, y se le pega el dibujo ----------------------
# «el flujo para unir un esqueleto a un dibujo no esta andando, no se puede
# editar el esqueleto de ejemplo». La causa: un esqueleto puede tener PIVOTES y
# no tener COLA. En la mesa se ve entero, pero para el programa no hay hueso:
# «Editar» cae en «elegir», no hay punta que arrastrar y «Repartir» contesta
# «primero dibuja el alambre» con el esqueleto puesto encima del personaje.
ALAMBRE = (ROOT / "ui" / "rigging" / "alambre-desde-pivotes.js").read_text(encoding="utf-8")
require('src="rigging/alambre-desde-pivotes.js' in INDEX
        and "function dzRigAlambreDerivar(" in ALAMBRE
        and "setRigBoneGeometries(cambios" in ALAMBRE,
        "se perdio la deduccion del alambre: un esqueleto con pivotes y sin cola no "
        "se puede editar ni repartir, y es como nace el personaje de ejemplo")
require(APP.count("dzRigAlambreDerivar(DZ.doc") >= 3,
        "alguno de los tres caminos dejo de deducir el alambre (el ejemplo, abrir el "
        "modo rig, y Repartir): ahi vuelve el esqueleto que no se puede tocar")
require("pivot || n.head" in ALAMBRE and "bone.head" not in ALAMBRE,
        "la deduccion empezo a MOVER el pivote: las poses y las claves ya grabadas "
        "giran alrededor del pivote, moverlo deforma lo animado")
require("function dzRigCajaDelDibujo(" in ALAMBRE
        and "rigLibrary.apply(DZ.doc,key,caja,prefix)" in APP,
        "«Colocar» volvio a medir la HOJA en vez del DIBUJO: el esqueleto cae en el "
        "centro de la pagina con el personaje al costado, y despues Repartir ata la "
        "pierna del dibujo a la mano del esqueleto")
require("lejos.push(el.id)" in APP and "sin hueso: " in APP,
        "«Repartir» volvio a decir solo CUANTAS piezas quedaron sueltas: sin el nombre "
        "no se sabe cual acercar ni cual vincular a mano")


# -- La pantalla de inicio repintada tiene que servir -------------------
# «lo cerre y lo volvi a abrir y quedo clavado». `habilitar()` corria UNA vez,
# al final del arranque; la invitacion se repinta cada vez que la mesa queda
# vacia —al cerrar el documento, al volver de la IA— y esa copia nacia con
# Nuevo, Abrir y Recuperar APAGADOS y «Preparando LOW...» para siempre. LOW
# quedaba inservible sin haberse roto nada, y sin poder rescatar el trabajo.
require("puenteListo = true" in INICIAL_COD and "if (puenteListo) habilitar()" in INICIAL_COD,
        "la pantalla de inicio volvio a habilitar sus acciones UNA sola vez: toda "
        "invitacion repintada nace muerta y el programa queda clavado")
require(INICIAL_COD.index("lienzo.appendChild(caja)") < INICIAL_COD.index("if (puenteListo) habilitar()"),
        "se habilita ANTES de meter la tarjeta en el DOM: habilitar() busca la tarjeta "
        "por id, no la encuentra, y los botones quedan apagados igual")

# -- El riel parte en columnas antes de esconder herramientas -----------
# «cuando elijo el panel de animacion no se ven las herramientas»: con la
# ventana a media pantalla la timeline le come la mitad del alto al riel, y de
# once herramientas a la vista quedaban seis.
require('rail.classList.toggle("dz-cols-2"' in APP and "porColumna * columnas" in APP,
        "el riel volvio a repartir por alto sin partir en columnas: en una ventana baja "
        "esconde la mayoria de las herramientas en el cajon")
require(re.search(r"\.dz-tools\.dz-cols-2[^{]*\{[^}]*flex-flow: row wrap", POLISH)
        and re.search(r"\.dz-tools\.dz-cols-3 \{[^}]*width:", POLISH),
        "se perdio el CSS de las columnas del riel: la clase se pone y no cambia nada, "
        "asi que las herramientas se apilan fuera de la vista")


# -- El espacio de Animacion enciende la Timeline con un .low ----------
# «el panel de animacion no muestra nada». Entrar al espacio de Animacion llama
# a dzAnimToggle(), que arrancaba con `if (!DZ.path) return sysMsg(...)`. Un
# .low NO TIENE DZ.path —sus cuadros viven en el documento—, asi que el camino
# nuevo de documento entraba y la Timeline no se encendia nunca: ni grilla, ni
# X-sheet, ni tira de niveles. Solo quedaba la barra de transporte.
require("if (!DZ.path && !DZ.doc) return sysMsg" in APP,
        "dzAnimToggle volvio a exigir DZ.path: con un documento nuevo (.low) el "
        "espacio de Animacion no muestra nada")
require("const abierta = !!DZ.anim;" in APP,
        "el espacio de trabajo volvio a decidir si prende la Timeline mirando si el DIV "
        "se ve: la barra de transporte puede estar a la vista con la Timeline apagada, y "
        "entonces el espacio de Animacion se abre sin grilla, sin X-sheet y sin niveles")
require(re.search(r"async function dzEnsureAnimationWorkspace\(\) {" + "\s*" +
                  r"if \(!DZ\.path && !DZ\.doc\) return false;", APP),
        "dzEnsureAnimationWorkspace volvio a exigir DZ.path: es la funcion que deja un "
        "documento nuevo listo para animar, y un .low —que es lo que crea «Nuevo "
        "documento»— no tiene DZ.path, asi que se iba sin hacer nada")
require("const sc = DZ.path ? await api.scene_get" in APP
        and "if (DZ.path) {" in APP,
        "el arranque viejo del .svg (persistir, make_frame, scene_get) volvio a "
        "correr sin DZ.path: revienta o deja la Timeline a medias con un .low")


# -- Exportar desde un documento nuevo ---------------------------------
# TODAS las salidas le mandaban `DZ.path` al puente —la ruta del .svg suelto—
# y un .low la tiene en null. Medido en la app real: TypeError de Python
# («not 'NoneType'») y el estado clavado en «Guardando la secuencia...». Con el
# flujo por defecto del programa NO SALIA NADA de LOW.
SALIDA = (ROOT / "ui" / "animation" / "ruta-de-salida.js").read_text(encoding="utf-8")
require('src="animation/ruta-de-salida.js' in INDEX
        and "function dzRutaDeSalida(estado)" in SALIDA
        and "DZ.doc && DZ.doc.path" in SALIDA,
        "se perdio la ruta de salida del documento: exportar desde un .low vuelve a "
        "mandarle una ruta vacia al puente y no sale nada del programa")
require("api.export_anim(DZ.path" not in APP and "api.export_premiere(DZ.path" not in APP,
        "una salida volvio a mandar DZ.path: con un documento nuevo eso es null y la "
        "exportacion revienta en Python")
require(APP.count("dzRutaDeSalida(DZ)") >= 5,
        "quedan salidas sin pasar por la ruta del documento: son cinco (MP4/WebM/GIF, "
        "secuencia, hoja de sprites x2 y Premiere)")
require(all(re.search(r"def " + nombre + r"\(s, path.*?if not path:.*?guarda el documento antes de exportar",
                      MAIN, re.S) for nombre in ("export_anim", "export_premiere")),
        "el puente volvio a hacer Path(None): revienta con un TypeError que del otro "
        "lado se ve como el programa colgado, en vez de decir que hacer")


# -- El titiritero graba adentro del documento -------------------------
# Guardar la toma era escribir `nombre_fNNN.svg` al lado del diseno, por el
# puente. Con un .low no hay DZ.path —y el puente ademas exige ese nombre—, asi
# que con «Nuevo documento» el titiritero contestaba «abri un diseno primero» y
# no se podia actuar nada. Misma familia que la exportacion sin ruta.
TOMA = (ROOT / "ui" / "animation" / "toma-al-documento.js").read_text(encoding="utf-8")
require('src="animation/toma-al-documento.js' in INDEX
        and "function dzTomaAlDocumento(doc, contenidos)" in TOMA
        and "dzTomaAlDocumento(DZ.doc, snaps)" in APP,
        "la actuacion volvio a depender de archivos _fNNN.svg: con un documento nuevo "
        "el titiritero no puede guardar la toma")
require("function dzCuadrosAlDocumento(doc, contenidos, despuesDe)" in TOMA
        and "capa.cells.splice(desde - 1, 0," in TOMA
        and "dzCuadrosAlDocumento(DZ.doc, nuevos" in APP,
        "los generadores de movimiento (recorrido, caminata, rebote) volvieron a "
        "insertar cuadros como archivos _fNNN.svg, o el splice dejo de INSERTAR y "
        "empezo a pisar: con un .low no generan nada, o se come lo ya animado")
require("sc.expose(capa.id, desde + i, numero + i)" in TOMA
        and "Math.max.apply(null, usados)" in TOMA,
        "la toma volvio a reusar numeros de dibujo o a pisar cuadros: reusar un numero "
        "cambia el dibujo en TODOS los cuadros donde ya estaba expuesto")


# -- «Ver en el navegador» NUNCA con la ruta del documento -------------
# preview_html ESCRIBE en la ruta que recibe (o en un temporal si no hay). El
# boton estaba guardado tras `if (DZ.path)`, asi que con un .low no hacia nada;
# pero pasarle la ruta del .low le encajaria el HTML del lienzo ENCIMA y se
# perderia el documento entero. La salida correcta es el temporal.
require("api.preview_html(DZ.path || null" in APP
        and APP.count("api.preview_html(DZ.path,") == 0,
        "«ver en el navegador» volvio a mandar una ruta: si es la del .low, el puente "
        "le escribe el HTML del lienzo encima y se pierde el documento")

print("CONTRATOS 2D OK: Escape, rueda, modos, rig, vectores, tableta, espejo, lipsync, equipo, arcos, punteria, pincel, nodos, version, composicion, prueba maestra, X-sheet, primera pantalla, UI flotante, exportacion y documento nuevo")
