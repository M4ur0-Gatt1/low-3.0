"""LOW Animation Engine — núcleo del sistema de animación 2D vectorial.

Formato nativo SVG: cada 'actor' es un grupo <g> en un SVG maestro.
Animación: sistema de keyframes con interpolación (posición, rotación,
escala, morph SVG path, color fill/stroke, opacidad).

Arquitectura:
  Scene → Layers → Actors → Keyframes → Interpolator → SVG renderizado
"""

import json
import math
import re
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import List, Dict, Optional, Tuple, Union
from xml.etree import ElementTree as ET

# ── constantes ──────────────────────────────────────────────────────────
NS_SVG = "http://www.w3.org/2000/svg"
NS_XLINK = "http://www.w3.org/1999/xlink"
ET.register_namespace("", NS_SVG)
ET.register_namespace("xlink", NS_XLINK)


@dataclass
class Transform:
    """Transformación 2D: translate / rotate / scale / skew."""
    x: float = 0.0
    y: float = 0.0
    rotation: float = 0.0      # grados
    scale_x: float = 1.0
    scale_y: float = 1.0
    skew_x: float = 0.0
    skew_y: float = 0.0
    opacity: float = 1.0
    visible: bool = True

    def to_matrix(self) -> list:
        """Devuelve matriz 3×3 homogénea como lista de listas."""
        a = math.radians(self.rotation)
        cos_r, sin_r = math.cos(a), math.sin(a)
        # scale + rotate
        m = [
            [self.scale_x * cos_r, -self.scale_y * sin_r, self.x],
            [self.scale_x * sin_r,  self.scale_y * cos_r, self.y],
            [0, 0, 1]
        ]
        # skew (después de scale/rotate para compat AE)
        if self.skew_x or self.skew_y:
            m[0][0] += m[0][1] * math.tan(math.radians(self.skew_x))
            m[1][1] += m[1][0] * math.tan(math.radians(self.skew_y))
        return m

    def to_svg_attr(self) -> str:
        """Atributo SVG 'transform'. Orden: translate → rotate → scale."""
        parts = []
        if self.x or self.y:
            parts.append(f"translate({self.x:.3f},{self.y:.3f})")
        if self.rotation:
            parts.append(f"rotate({self.rotation:.3f})")
        if self.scale_x != 1.0 or self.scale_y != 1.0:
            parts.append(f"scale({self.scale_x:.3f},{self.scale_y:.3f})")
        if self.skew_x:
            parts.append(f"skewX({self.skew_x:.3f})")
        if self.skew_y:
            parts.append(f"skewY({self.skew_y:.3f})")
        return " ".join(parts) if parts else ""

    def lerp(self, other: "Transform", t: float) -> "Transform":
        """Interpolación lineal entre dos transforms."""
        ease = lambda a, b: a + (b - a) * t
        return Transform(
            x=ease(self.x, other.x),
            y=ease(self.y, other.y),
            rotation=ease(self.rotation, other.rotation),
            scale_x=ease(self.scale_x, other.scale_x),
            scale_y=ease(self.scale_y, other.scale_y),
            skew_x=ease(self.skew_x, other.skew_x),
            skew_y=ease(self.skew_y, other.skew_y),
            opacity=max(0.0, min(1.0, ease(self.opacity, other.opacity))),
            visible=self.visible if t < 0.5 else other.visible,
        )


@dataclass
class Morph:
    """Morfismo de paths SVG: dos strings de 'd' interpolables."""
    source_d: str = ""
    target_d: str = ""

    @staticmethod
    def _parse_path(d: str) -> List[Tuple[str, List[float]]]:
        """Parsea un path SVG a lista de (comando, [args])."""
        tokens = re.findall(r"[MmLlHhVvCcSsQqTtAaZz]|[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?", d)
        result = []
        i = 0
        current_cmd = None
        while i < len(tokens):
            tok = tokens[i]
            if tok in "MmLlHhVvCcSsQqTtAaZz":
                current_cmd = tok
                i += 1
                if tok in "Zz":
                    result.append((tok, []))
                    continue
            if current_cmd is None:
                i += 1
                continue
            # determinar cuántos argumentos
            cmd = current_cmd.upper()
            arg_counts = {"M": 2, "L": 2, "H": 1, "V": 1, "C": 6, "S": 4, "Q": 4, "T": 2,
                          "A": 7}
            n = arg_counts.get(cmd, 2)
            args = []
            for _ in range(n):
                if i < len(tokens):
                    try:
                        args.append(float(tokens[i]))
                    except ValueError:
                        break
                    i += 1
            result.append((current_cmd, args))
        return result

    @staticmethod
    def _normalize(paths_a: List, paths_b: List) -> Tuple[List, List]:
        """Normaliza dos paths para tener mismos comandos y puntos."""
        # Extraer solo coordenadas x,y de cada comando
        def points(path):
            pts = []
            for cmd, args in path:
                if cmd.upper() == "Z":
                    continue
                for j in range(0, len(args), 2):
                    if j + 1 < len(args):
                        pts.append((args[j], args[j + 1]))
            return pts

        pta, ptb = points(paths_a), points(paths_b)
        # Alinear longitudes con interpolación lineal de puntos
        max_len = max(len(pta), len(ptb))
        if len(pta) < max_len:
            pta += [pta[-1]] * (max_len - len(pta)) if pta else [(0, 0)] * max_len
        if len(ptb) < max_len:
            ptb += [ptb[-1]] * (max_len - len(ptb)) if ptb else [(0, 0)] * max_len
        return pta, ptb

    def interpolate(self, t: float) -> str:
        """Devuelve path 'd' interpolado entre source y target."""
        if not self.source_d or not self.target_d:
            return self.source_d or self.target_d
        pa = self._parse_path(self.source_d)
        pb = self._parse_path(self.target_d)
        pta, ptb = self._normalize(pa, pb)
        # Interpolar puntos
        result = []
        for (x1, y1), (x2, y2) in zip(pta, ptb):
            result.append(f"{x1 + (x2 - x1) * t:.3f}")
            result.append(f"{y1 + (y2 - y1) * t:.3f}")
        # Reconstruir path simple con L
        if not result:
            return self.source_d
        # Hacemos un path con M y L para cada par de coordenadas
        parts = ["M", result[0], result[1]]
        for i in range(2, len(result), 2):
            if i + 1 < len(result):
                parts += ["L", result[i], result[i + 1]]
        parts.append("Z")
        return " ".join(parts)

    @staticmethod
    def interpolate_pair(m1: Optional["Morph"], m2: Optional["Morph"],
                         t: float) -> Optional["Morph"]:
        """Interpola entre dos morphs (de keyframes consecutivos). Devuelve un
        Morph cuyo path ya está resuelto para el tiempo t (source==target)."""
        if m1 is None and m2 is None:
            return None
        if m1 is None:
            return m2
        if m2 is None:
            return m1
        d1 = m1.interpolate(1.0)
        d2 = m2.interpolate(0.0)
        d = Morph(source_d=d1, target_d=d2).interpolate(t)
        return Morph(source_d=d, target_d=d)


@dataclass
class Keyframe:
    """Keyframe en el timeline: tiempo + estado."""
    frame: int
    transform: Transform = field(default_factory=Transform)
    morph: Optional[Morph] = None
    ease_in: float = 0.0   # 0-1, influencia de easing de entrada
    ease_out: float = 0.0  # 0-1, influencia de easing de salida
    label: str = ""
    hold: bool = False     # si True, no interpola hasta el siguiente

    def to_dict(self) -> dict:
        return {
            "frame": self.frame,
            "transform": asdict(self.transform),
            "morph": {"source_d": self.morph.source_d, "target_d": self.morph.target_d} if self.morph else None,
            "ease_in": self.ease_in,
            "ease_out": self.ease_out,
            "label": self.label,
            "hold": self.hold,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "Keyframe":
        t = d.get("transform", {})
        m = d.get("morph")
        return cls(
            frame=d["frame"],
            transform=Transform(**t),
            morph=Morph(**m) if m else None,
            ease_in=d.get("ease_in", 0.0),
            ease_out=d.get("ease_out", 0.0),
            label=d.get("label", ""),
            hold=d.get("hold", False),
        )


@dataclass
class Bone:
    """Hueso del rig: conecta dos puntos, controla transforms de hijos."""
    name: str = ""
    parent: Optional[str] = None
    x0: float = 0.0   # punto base (pivote)
    y0: float = 0.0
    x1: float = 100.0 # punto extremo
    y1: float = 0.0
    length: float = field(init=False)
    angle: float = field(init=False)   # grados
    children: List[str] = field(default_factory=list)
    # matriz de bind (pose en T-pose / pose de reposo)
    bind_transform: Transform = field(default_factory=Transform)

    def __post_init__(self):
        dx = self.x1 - self.x0
        dy = self.y1 - self.y0
        self.length = math.hypot(dx, dy)
        self.angle = math.degrees(math.atan2(dy, dx))

    def world_transform(self, bone_dict: Dict[str, "Bone"]) -> Transform:
        """Transform en espacio mundo considerando padres."""
        if self.parent and self.parent in bone_dict:
            parent = bone_dict[self.parent]
            pt = parent.world_transform(bone_dict)
            bt = self.bind_transform
            return Transform(
                x=pt.x + bt.x,
                y=pt.y + bt.y,
                rotation=pt.rotation + bt.rotation,
                scale_x=pt.scale_x * bt.scale_x,
                scale_y=pt.scale_y * bt.scale_y,
            )
        return self.bind_transform

    def to_dict(self) -> dict:
        return {
            "name": self.name, "parent": self.parent,
            "x0": self.x0, "y0": self.y0, "x1": self.x1, "y1": self.y1,
            "children": self.children,
            "bind_transform": asdict(self.bind_transform),
        }

    @classmethod
    def from_dict(cls, d: dict) -> "Bone":
        b = cls(name=d["name"], parent=d.get("parent"),
                x0=d.get("x0", 0), y0=d.get("y0", 0),
                x1=d.get("x1", 100), y1=d.get("y1", 0),
                children=d.get("children", []))
        if "bind_transform" in d:
            b.bind_transform = Transform(**d["bind_transform"])
        return b


class Actor:
    """Actor animable: un elemento SVG (grupo <g>) con keyframes."""
    def __init__(self, name: str, svg_id: str = ""):
        self.name = name
        self.svg_id = svg_id or name
        self.keyframes: List[Keyframe] = []
        self.bone_assignment: Optional[str] = None  # nombre del hueso que lo controla
        self.svg_source: str = ""  # SVG interno del actor (o path d)
        self.initial_transform = Transform()

    def add_keyframe(self, kf: Keyframe):
        self.keyframes.append(kf)
        self.keyframes.sort(key=lambda k: k.frame)

    def get_state_at(self, frame: int) -> Tuple[Transform, Optional[Morph]]:
        """Interpola el estado al frame dado."""
        if not self.keyframes:
            return self.initial_transform, None
        # Antes del primer keyframe
        if frame <= self.keyframes[0].frame:
            return self.keyframes[0].transform, self.keyframes[0].morph
        # Después del último
        if frame >= self.keyframes[-1].frame:
            return self.keyframes[-1].transform, self.keyframes[-1].morph
        # Entre dos keyframes
        for i in range(len(self.keyframes) - 1):
            k1, k2 = self.keyframes[i], self.keyframes[i + 1]
            if k1.frame <= frame <= k2.frame:
                if k1.hold:
                    return k1.transform, k1.morph
                t = (frame - k1.frame) / max(1, k2.frame - k1.frame)
                # Aplicar easing simple (ease-in-out blend)
                t = self._ease_blend(t, k1.ease_out, k2.ease_in)
                morph = Morph.interpolate_pair(k1.morph, k2.morph, t)
                return k1.transform.lerp(k2.transform, t), morph
        return self.keyframes[-1].transform, self.keyframes[-1].morph

    def keyframe_at(self, frame: int) -> Optional[Keyframe]:
        """Devuelve el keyframe exacto en 'frame', o None."""
        for k in self.keyframes:
            if k.frame == frame:
                return k
        return None

    def remove_keyframe(self, frame: int) -> bool:
        """Elimina el keyframe exacto en 'frame'. Devuelve True si lo borró."""
        before = len(self.keyframes)
        self.keyframes = [k for k in self.keyframes if k.frame != frame]
        return len(self.keyframes) != before

    @staticmethod
    def _ease_blend(t: float, ease_out: float, ease_in: float) -> float:
        """Easing blend entre la salida del keyframe anterior y la entrada del
        siguiente. Si ambos son 0 → lineal. Usa bezier cúbico (Newton-Raphson)
        para interpolar el tiempo con control points suavizados en x."""
        if ease_out == 0.0 and ease_in == 0.0:
            return t
        cp1x = max(0.0, min(1.0, ease_out))
        cp2x = max(0.0, min(1.0, 1.0 - ease_in))
        u = t
        for _ in range(8):
            x = (3 * (1 - u) ** 2 * u * cp1x +
                 3 * (1 - u) * u ** 2 * cp2x + u ** 3)
            dx = (3 * (1 - u) ** 2 * cp1x +
                  6 * (1 - u) * u * (cp2x - cp1x) +
                  3 * u ** 2 * (1 - cp2x))
            if abs(dx) < 1e-6:
                break
            u -= (x - t) / dx
        u = max(0.0, min(1.0, u))
        # y(u) con cp1y=0, cp2y=1 → curva ease-in-out estándar
        return 3 * (1 - u) * u * u + u ** 3

    def to_dict(self) -> dict:
        return {
            "name": self.name, "svg_id": self.svg_id,
            "keyframes": [k.to_dict() for k in self.keyframes],
            "bone_assignment": self.bone_assignment,
            "svg_source": self.svg_source,
            "initial_transform": asdict(self.initial_transform),
        }

    @classmethod
    def from_dict(cls, d: dict) -> "Actor":
        a = cls(d["name"], d.get("svg_id", d["name"]))
        a.keyframes = [Keyframe.from_dict(k) for k in d.get("keyframes", [])]
        a.bone_assignment = d.get("bone_assignment")
        a.svg_source = d.get("svg_source", "")
        a.initial_transform = Transform(**d.get("initial_transform", {}))
        return a


class Layer:
    """Capa de la escena: contiene actores, profundidad (z-index)."""
    def __init__(self, name: str, z: int = 0, visible: bool = True):
        self.name = name
        self.z = z
        self.visible = visible
        self.actors: List[Actor] = []
        self.opacity: float = 1.0
        self.blend_mode: str = "normal"  # normal, multiply, screen, overlay

    def add_actor(self, actor: Actor):
        self.actors.append(actor)

    def to_dict(self) -> dict:
        return {
            "name": self.name, "z": self.z, "visible": self.visible,
            "opacity": self.opacity, "blend_mode": self.blend_mode,
            "actors": [a.to_dict() for a in self.actors],
        }

    @classmethod
    def from_dict(cls, d: dict) -> "Layer":
        l = cls(d["name"], d.get("z", 0), d.get("visible", True))
        l.opacity = d.get("opacity", 1.0)
        l.blend_mode = d.get("blend_mode", "normal")
        l.actors = [Actor.from_dict(a) for a in d.get("actors", [])]
        return l


class Scene:
    """Escena completa: tamaño, duración, capas, huesos, fondo."""
    def __init__(self, name: str, width: int = 1920, height: int = 1080,
                 fps: int = 24, duration_frames: int = 240):
        self.name = name
        self.width = width
        self.height = height
        self.fps = fps
        self.duration = duration_frames
        self.layers: List[Layer] = []
        self.bones: Dict[str, Bone] = {}
        self.background_color = "#87CEEB"  # sky blue default
        self.background_svg: Optional[str] = None  # SVG de fondo
        self.camera = Transform()  # transform de cámara
        self.markers: Dict[int, str] = {}  # frame → etiqueta

    def add_layer(self, layer: Layer):
        self.layers.append(layer)
        self.layers.sort(key=lambda l: l.z)

    def add_bone(self, bone: Bone):
        self.bones[bone.name] = bone
        if bone.parent and bone.parent in self.bones:
            self.bones[bone.parent].children.append(bone.name)

    def get_all_actors(self) -> List[Actor]:
        return [a for l in self.layers for a in l.actors]

    def to_dict(self) -> dict:
        return {
            "name": self.name, "width": self.width, "height": self.height,
            "fps": self.fps, "duration": self.duration,
            "background_color": self.background_color,
            "background_svg": self.background_svg,
            "camera": asdict(self.camera),
            "markers": self.markers,
            "layers": [l.to_dict() for l in self.layers],
            "bones": {k: v.to_dict() for k, v in self.bones.items()},
        }

    @classmethod
    def from_dict(cls, d: dict) -> "Scene":
        s = cls(d["name"], d.get("width", 1920), d.get("height", 1080),
                d.get("fps", 24), d.get("duration", 240))
        s.background_color = d.get("background_color", "#87CEEB")
        s.background_svg = d.get("background_svg")
        s.camera = Transform(**d.get("camera", {}))
        s.markers = d.get("markers", {})
        s.layers = [Layer.from_dict(l) for l in d.get("layers", [])]
        for bn in d.get("bones", {}).values():
            s.add_bone(Bone.from_dict(bn))
        return s

    def save(self, path: Union[str, Path]):
        Path(path).write_text(json.dumps(self.to_dict(), indent=2), encoding="utf-8")

    @classmethod
    def load(cls, path: Union[str, Path]) -> "Scene":
        return cls.from_dict(json.loads(Path(path).read_text(encoding="utf-8")))


class AnimationEngine:
    """Motor principal: renderiza frames, maneja el reloj."""
    def __init__(self, scene: Scene):
        self.scene = scene
        self._current_frame = 0
        self._playing = False

    @property
    def current_frame(self) -> int:
        return self._current_frame

    @current_frame.setter
    def current_frame(self, v: int):
        self._current_frame = max(0, min(self.scene.duration - 1, int(v)))

    def render_frame(self, frame: Optional[int] = None) -> ET.Element:
        """Genera el SVG completo de la escena en un frame dado."""
        if frame is not None:
            self.current_frame = frame
        f = self.current_frame

        root = ET.Element("svg", attrib={
            "xmlns": NS_SVG,
            "version": "1.1",
            "viewBox": f"0 0 {self.scene.width} {self.scene.height}",
            "width": str(self.scene.width),
            "height": str(self.scene.height),
        })
        # Defs para reutilizar
        defs = ET.SubElement(root, "defs")

        # Fondo
        bg = ET.SubElement(root, "rect", attrib={
            "x": "0", "y": "0",
            "width": str(self.scene.width),
            "height": str(self.scene.height),
            "fill": self.scene.background_color,
        })
        if self.scene.background_svg:
            try:
                bg_el = ET.fromstring(self.scene.background_svg)
                root.append(bg_el)
            except ET.ParseError:
                pass

        # Capas ordenadas por z
        for layer in self.scene.layers:
            if not layer.visible:
                continue
            layer_g = ET.SubElement(root, "g", attrib={
                "id": f"layer_{layer.name}",
                "opacity": str(layer.opacity),
            })
            for actor in layer.actors:
                transform, morph = actor.get_state_at(f)
                # Aplicar transform de hueso si corresponde
                if actor.bone_assignment and actor.bone_assignment in self.scene.bones:
                    bone = self.scene.bones[actor.bone_assignment]
                    bt = bone.world_transform(self.scene.bones)
                    # Componer transform de actor + hueso
                    transform = transform.lerp(bt, 1.0)  # composición aprox

                g = ET.SubElement(layer_g, "g", attrib={
                    "id": actor.svg_id,
                    "transform": transform.to_svg_attr(),
                    "opacity": str(transform.opacity),
                    "style": f"display:{'block' if transform.visible else 'none'}",
                })
                # Insertar SVG del actor
                if actor.svg_source:
                    try:
                        el = ET.fromstring(actor.svg_source)
                        # Si es grupo, insertar directo; si no, envolver
                        g.append(el)
                    except ET.ParseError:
                        # Fallback: path simple
                        ET.SubElement(g, "path", attrib={
                            "d": morph.interpolate(0.0) if morph else actor.svg_source,
                            "fill": "#888",
                        })

        # Cámara (aplica transform global)
        if self.scene.camera.x or self.scene.camera.y or self.scene.camera.rotation:
            cam = self.scene.camera
            cam_attr = cam.to_svg_attr()
            if cam_attr:
                # Envolver todo en un grupo con transform de cámara
                cam_g = ET.Element("g", attrib={"transform": cam_attr})
                for child in list(root):
                    if child.tag != "defs":
                        cam_g.append(child)
                        root.remove(child)
                root.append(cam_g)

        return root

    def render_frame_string(self, frame: Optional[int] = None) -> str:
        """Devuelve el SVG como string completo."""
        root = self.render_frame(frame)
        return ET.tostring(root, encoding="unicode")

    def play_range(self, start: int = 0, end: Optional[int] = None):
        """Genera todos los frames de un rango (para exportación)."""
        end = end or self.scene.duration
        for f in range(start, end):
            yield f, self.render_frame_string(f)
