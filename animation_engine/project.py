"""LOW Animation Studio — motor de animación 2D con vectores.

Sistema de producción profesional de animación 2D basado en SVG, comparable a
Toon Boom Harmony / OpenToonz / Moho / After Effects, con IA integrada en todo
el pipeline.

Arquitectura:
- SVG como formato nativo (editables, escalables, ligero)
- Keyframe engine con curvas de easing (Bezier)
- Sistema de capas con composición tipo AE
- Onion skinning configurable
- Rigging básico via transforms en grupo
- Render a PNG-seq / MP4 / GIF / Lottie
"""
import base64
import copy
import datetime
import io
import json
import math
import os
import re
import shutil
import subprocess
import time
from pathlib import Path
from typing import Any

import requests


# ── Modelo de datos del proyecto ──────────────────────────────────

ANIM_VERSION = "1.0"

DEFAULT_PROJECT = {
    "version": ANIM_VERSION,
    "project": {
        "name": "Sin título",
        "fps": 24,
        "width": 1020,
        "height": 1080,
        "duration_frames": 480,
        "color_space": "sRGB"
    },
    "library": {
        "characters": [],
        "backgrounds": [],
        "props": [],
        "sounds": [],
        "palettes": []
    },
    "scenes": [],
    "timeline": {
        "current_scene": None,
        "playhead_frame": 1,
        "selection": [],
        "range_in": 1,
        "range_out": 480,
        "onion_skin": {"prev": 3, "next": 3, "opacity": 0.3}
    }
}

# ── Easing Curves (funciones matemáticas) ─────────────────────────

EASINGS = {
    "linear": lambda t: t,
    "ease-in": lambda t: t * t,
    "ease-out": lambda t: 1 - (1 - t) * (1 - t),
    "ease-in-out": lambda t: (2 * t * t) if t < 0.5 else (1 - math.pow(-2 * t + 2, 2) / 2),
    "ease-in-cubic": lambda t: t * t * t,
    "ease-out-cubic": lambda t: 1 - math.pow(1 - t, 3),
    "ease-in-out-cubic": lambda t: 4 * t * t * t if t < 0.5 else 1 - math.pow(-2 * t + 2, 3) / 2,
    "bounce": lambda t: _bounce(t),
    "elastic": lambda t: _elastic(t),
    "back-in": lambda t: _back_in(t),
    "back-out": lambda t: _back_out(t),
    "back-in-out": lambda t: _back_in_out(t),
}

def _bounce(t):
    if t < 1 / 2.75:
        return 7.5625 * t * t
    elif t < 2 / 2.75:
        t -= 1.5 / 2.75
        return 7.5625 * t * t + 0.75
    elif t < 2.5 / 2.75:
        t -= 2.25 / 2.75
        return 7.5625 * t * t + 0.9375
    else:
        t -= 2.625 / 2.75
        return 7.5625 * t * t + 0.984375

def _elastic(t):
    c4 = (2 * math.pi) / 3
    if t == 0: return 0
    if t == 1: return 1
    return -math.pow(2, 10 * t - 10) * math.sin((t * 10 - 10.75) * c4)

def _back_in(t):
    c1 = 1.70158; c3 = c1 + 1
    return c3 * t * t * t - c1 * t * t

def _back_out(t):
    c1 = 1.70158; c3 = c1 + 1
    return 1 + c3 * math.pow(t - 1, 3) + c1 * math.pow(t - 1, 2)

def _back_in_out(t):
    c1 = 1.70158; c2 = c1 * 1.525
    if t < 0.5:
        return (math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
    return (math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2


def interpolate_value(a: float, b: float, t: float, easing: str = "linear") -> float:
    """Interpola entre a y b con easing."""
    fn = EASINGS.get(easing, EASINGS["linear"])
    ratio = fn(min(max(t, 0.0), 1.0))
    return a + (b - a) * ratio


def interpolate_color(c1: str, c2: str, t: float) -> str:
    """Interpola entre dos colores hex."""
    def hex_to_rgb(c):
        c = c.lstrip("#")
        if len(c) == 3:
            c = "".join([x * 2 for x in c])
        return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))
    rgb1, rgb2 = hex_to_rgb(c1), hex_to_rgb(c2)
    r = int(rgb1[0] + (rgb2[0] - rgb1[0]) * t)
    g = int(rgb1[1] + (rgb2[1] - rgb1[1]) * t)
    b = int(rgb1[2] + (rgb2[2] - rgb1[2]) * t)
    return f"#{r:02x}{g:02x}{b:02x}"


# ── Project Manager ───────────────────────────────────────────────

class AnimationProject:
    """Controlador de un proyecto de animación LOW."""

    def __init__(self, workspace: Path, project_file: Path = None):
        self.ws = workspace
        self.project_file = project_file or (workspace / ".low" / "animacion.json")
        self.data = self._load()
        self._cached_frames = {}   # frame -> SVG string cache

    def _load(self) -> dict:
        if self.project_file.exists():
            try:
                return json.loads(self.project_file.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                pass
        # default
        d = copy.deepcopy(DEFAULT_PROJECT)
        d["project"]["name"] = self.ws.name or "Sin título"
        return d

    def save(self):
        self.project_file.parent.mkdir(parents=True, exist_ok=True)
        self.project_file.write_text(
            json.dumps(self.data, ensure_ascii=False, indent=2),
            encoding="utf-8")

    # ── Utilities ──
    def scene(self, scene_id: str = None) -> dict:
        sid = scene_id or self.data["timeline"]["current_scene"]
        if not sid:
            return None
        for sc in self.data["scenes"]:
            if sc["id"] == sid:
                return sc
        return None

    def current_scene(self) -> dict:
        return self.scene()

    def set_scene(self, scene_id: str):
        self.data["timeline"]["current_scene"] = scene_id

    # ── Scene CRUD ──
    def add_scene(self, name: str, in_point: int = 1, out_point: int = None) -> str:
        out = out_point or self.data["project"]["duration_frames"]
        sid = f"escena_{len(self.data['scenes']) + 1:02d}"
        self.data["scenes"].append({
            "id": sid,
            "name": name,
            "in_point": in_point,
            "out_point": out,
            "layers": [],
            "keyframes": {}
        })
        if not self.data["timeline"]["current_scene"]:
            self.data["timeline"]["current_scene"] = sid
        return sid

    def delete_scene(self, scene_id: str):
        self.data["scenes"] = [s for s in self.data["scenes"] if s["id"] != scene_id]

    # ── Layer CRUD ──
    def add_layer(self, scene_id: str, name: str, layer_type: str = "vector",
                  asset: str = "", z_index: int = 0, parallax: float = 0.0) -> str:
        sc = self.scene(scene_id)
        if not sc:
            return None
        lid = f"layer_{len(sc['layers'])}_{int(time.time() * 1000) % 1000}"
        sc["layers"].append({
            "id": lid,
            "name": name,
            "type": layer_type,  # vector | background | character | prop | audio | effects
            "asset": asset,
            "z_index": z_index,
            "parallax": parallax,
            "visible": True,
            "locked": False,
            "opacity": 1.0,
            "blend_mode": "normal",
            "transform": {"x": 0, "y": 0, "scale": 1.0, "rotation": 0, "anchor_x": 0.5, "anchor_y": 0.5}
        })
        sc["keyframes"][lid] = {}
        return lid

    def get_layer(self, scene_id: str, layer_id: str) -> dict:
        sc = self.scene(scene_id)
        if not sc:
            return None
        for l in sc["layers"]:
            if l["id"] == layer_id:
                return l
        return None

    # ── Keyframe CRUD ──
    def set_keyframe(self, scene_id: str, layer_id: str, frame: int,
                     transform: dict = None, style: dict = None,
                     asset_variant: str = None, easing: str = "linear"):
        """
        transform: {x, y, scale, rotation, anchor_x, anchor_y, opacity}
        style: {fill, stroke, strokeWidth, ...} para morphing de color
        asset_variant: nombre de la pose/expresión (para characters)
        """
        sc = self.scene(scene_id)
        if not sc:
            return False
        kfs = sc.setdefault("keyframes", {}).setdefault(layer_id, {})
        kf = {"easing": easing, "frame": frame}
        if transform:
            kf["transform"] = transform
        if style:
            kf["style"] = style
        if asset_variant:
            kf["variant"] = asset_variant
        kfs[str(frame)] = kf
        # sort by frame
        sc["keyframes"][layer_id] = dict(sorted(kfs.items(), key=lambda x: int(x[0])))
        return True

    def get_keyframe_at(self, scene_id: str, layer_id: str, frame: int) -> dict:
        """Devuelve la interpolación calculada en un frame exacto."""
        sc = self.scene(scene_id)
        if not sc:
            return None
        kfs = sc.get("keyframes", {}).get(layer_id, {})
        if not kfs:
            return None
        frames = sorted(int(k) for k in kfs.keys())
        if frame <= frames[0]:
            return kfs[str(frames[0])]
        if frame >= frames[-1]:
            return kfs[str(frames[-1])]
        # find surrounding keyframes
        for i in range(len(frames) - 1):
            if frames[i] <= frame <= frames[i + 1]:
                k1, k2 = kfs[str(frames[i])], kfs[str(frames[i + 1])]
                t = 0.0 if frames[i + 1] == frames[i] else (frame - frames[i]) / (frames[i + 1] - frames[i])
                return self._interpolate_keyframes(k1, k2, t)
        return kfs[str(frames[-1])]

    def _interpolate_keyframes(self, k1: dict, k2: dict, t: float) -> dict:
        easing = k2.get("easing", "linear")
        result = {"easing": easing, "frame": k1.get("frame", 0)}
        # Interpolate transform
        if "transform" in k1 or "transform" in k2:
            t1 = k1.get("transform", {})
            t2 = k2.get("transform", {})
            result["transform"] = {
                "x": interpolate_value(t1.get("x", 0), t2.get("x", 0), t, easing),
                "y": interpolate_value(t1.get("y", 0), t2.get("y", 0), t, easing),
                "scale": interpolate_value(t1.get("scale", 1.0), t2.get("scale", 1.0), t, easing),
                "rotation": interpolate_value(t1.get("rotation", 0), t2.get("rotation", 0), t, easing),
                "anchor_x": t1.get("anchor_x", 0.5),
                "anchor_y": t1.get("anchor_y", 0.5),
                "opacity": interpolate_value(t1.get("opacity", 1.0), t2.get("opacity", 1.0), t, easing),
            }
        # Interpolate style (colors)
        if "style" in k1 or "style" in k2:
            s1 = k1.get("style", {})
            s2 = k2.get("style", {})
            result["style"] = {}
            for key in set(s1.keys()) | set(s2.keys()):
                v1, v2 = s1.get(key, s2.get(key, "")), s2.get(key, s1.get(key, ""))
                if re.match(r"^#[0-9a-fA-F]{6}$", str(v1)) and re.match(r"^#[0-9a-fA-F]{6}$", str(v2)):
                    result["style"][key] = interpolate_color(v1, v2, t)
                else:
                    result["style"][key] = v2 if t >= 0.5 else v1
        # Asset variant: no interpolation, returns whichever is active
        if "variant" in k1:
            result["variant"] = k1["variant"]
        if "variant" in k2 and t >= 0.5:
            result["variant"] = k2["variant"]
        return result

    # ── SVG Frame Renderer ────────────────────────────────────────
    def render_frame(self, scene_id: str, frame: int) -> str:
        """Renderiza un frame completo a SVG string (composición de todas las capas)."""
        cache_key = f"{scene_id}:{frame}"
        if cache_key in self._cached_frames:
            return self._cached_frames[cache_key]
        sc = self.scene(scene_id)
        if not sc:
            return ""
        w, h = self.data["project"]["width"], self.data["project"]["height"]
        layers_svg = []
        # sort layers by z_index
        layers = sorted(sc["layers"], key=lambda l: l.get("z_index", 0))
        for layer in layers:
            if not layer.get("visible", True):
                continue
            lid = layer["id"]
            kf = self.get_keyframe_at(scene_id, lid, frame)
            # Load the asset SVG content
            svg_content = self._load_layer_asset(layer, kf)
            layers_svg.append(svg_content)
        # Compose
        out = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">
<rect width="{w}" height="{h}" fill="#1a1a2e"/>
{''.join(layers_svg)}
</svg>'''
        self._cached_frames[cache_key] = out
        return out

    def _load_layer_asset(self, layer: dict, kf: dict) -> str:
        """Carga el SVG de una capa y aplica transformaciones."""
        asset = layer.get("asset", "")
        if not asset:
            return ""
        p = self.ws / asset
        svg_data = ""
        if p.exists() and p.suffix.lower() == ".svg":
            try:
                svg_data = p.read_text(encoding="utf-8", errors="replace")
                # Extract just the content inside <svg> tags
                m = re.search(r'<svg[^>]*>(.*?)</svg>', svg_data, re.DOTALL | re.IGNORECASE)
                if m:
                    svg_data = m.group(1)
            except OSError:
                pass
        if not svg_data:
            return ""
        # Apply transforms from keyframe
        transform = ""
        if kf and "transform" in kf:
            tr = kf["transform"]
            x, y = tr.get("x", 0), tr.get("y", 0)
            scale = tr.get("scale", 1.0)
            rot = tr.get("rotation", 0)
            # Calculate anchor offset
            anc_x = tr.get("anchor_x", 0.5)
            anc_y = tr.get("anchor_y", 0.5)
            opacity = tr.get("opacity", 1.0)
            transform = f'transform="translate({x}, {y}) rotate({rot}) scale({scale})" opacity="{opacity}"'
        # wrap in group
        return f'<g id="{layer["id"]}" {transform}>{svg_data}</g>'

    def invalidate_cache(self):
        self._cached_frames.clear()

    # ── Export ────────────────────────────────────────────────────
    def export_frame_sequence(self, scene_id: str, out_dir: Path, prefix: str = "frame") -> list[Path]:
        """Exporta la escena como secuencia de PNGs. Requiere cairosvg o similar."""
        sc = self.scene(scene_id)
        if not sc:
            return []
        out_dir.mkdir(parents=True, exist_ok=True)
        paths = []
        for frame in range(sc["in_point"], sc["out_point"] + 1):
            svg = self.render_frame(scene_id, frame)
            svg_path = out_dir / f"{prefix}_{frame:04d}.svg"
            png_path = out_dir / f"{prefix}_{frame:04d}.png"
            svg_path.write_text(svg, encoding="utf-8")
            # Try to convert to PNG
            try:
                import cairosvg
                cairosvg.svg2png(bytestring=svg.encode(), write_to=str(png_path))
                paths.append(png_path)
            except ImportError:
                paths.append(svg_path)
        return paths

    def export_video(self, scene_id: str, out_path: Path, fps: int = None) -> str:
        """Exporta la escena a MP4 usando ffmpeg."""
        fps = fps or self.data["project"]["fps"]
        tmp_dir = self.ws / ".low" / "tmp_export"
        frames = self.export_frame_sequence(scene_id, tmp_dir, "frame")
        if not frames:
            return " No hay frames para exportar"
        # Use ffmpeg
        try:
            cmd = [
                "ffmpeg", "-y",
                "-framerate", str(fps),
                "-i", str(tmp_dir / "frame_%04d.png"),
                "-c:v", "libx264",
                "-pix_fmt", "yuv420p",
                "-crf", "18",
                str(out_path)
            ]
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode != 0:
                return f" ffmpeg falló: {result.stderr[:500]}"
            return f" Video exportado: {out_path}"
        except FileNotFoundError:
            return " ffmpeg no encontrado. Instalar con: apt install ffmpeg  (Linux)  o  brew install ffmpeg  (macOS)  o  descargar desde ffmpeg.org (Windows)"
        finally:
            if tmp_dir.exists():
                shutil.rmtree(tmp_dir, ignore_errors=True)

    # ── Library Management ──
    def add_character(self, name: str, master_svg: str, poses: list = None, 
                      expressions: list = None, rig_data: dict = None) -> str:
        char_id = re.sub(r"[^a-z0-9_]", "_", name.lower())
        char = {
            "id": char_id,
            "name": name,
            "master_svg": master_svg,
            "poses": poses or ["idle"],
            "expressions": expressions or ["neutral"],
            "rig": rig_data or {}
        }
        self.data["library"]["characters"].append(char)
        return char_id

    def add_background(self, name: str, svg_path: str, parallax_layers: list = None) -> str:
        bg_id = re.sub(r"[^a-z0-9_]", "_", name.lower())
        bg = {
            "id": bg_id,
            "name": name,
            "svg": svg_path,
            "parallax_layers": parallax_layers or []
        }
        self.data["library"]["backgrounds"].append(bg)
        return bg_id

    def add_palette(self, name: str, colors: list) -> str:
        pal_id = re.sub(r"[^a-z0-9_]", "_", name.lower())
        pal = {"id": pal_id, "name": name, "colors": colors}
        self.data["library"]["palettes"].append(pal)
        return pal_id

    # ── Metadata ──
    def to_dict(self) -> dict:
        return self.data

    def from_dict(self, data: dict):
        self.data = data
        self.invalidate_cache()


# ── Utility: Crear proyecto nuevo ─────────────────────────────────

def create_animation_project(workspace: Path, name: str, fps: int = 24,
                                width: int = 1020, height: int = 1080) -> AnimationProject:
    proj = AnimationProject(workspace)
    proj.data["project"]["name"] = name
    proj.data["project"]["fps"] = fps
    proj.data["project"]["width"] = width
    proj.data["project"]["height"] = height
    proj.save()
    return proj


# ── Rigging utilities ─────────────────────────────────────────────

def generate_rig_from_svg(svg_path: Path) -> dict:
    """Analiza un SVG de personaje y genera un rig básico basado en grupos."""
    try:
        svg_text = svg_path.read_text(encoding="utf-8")
    except OSError:
        return {}
    # Find groups that could be body parts
    groups = re.findall(r'<g[^>]*id="([^"]+)"[^>]*>', svg_text)
    # Extract bounding boxes from paths
    rig = {"bones": [], "constraints": [], "ik_chains": []}
    known_parts = {
        "head": {"parent": "torso", "length": 60},
        "torso": {"parent": "root", "length": 100},
        "arm_l": {"parent": "torso", "length": 50},
        "arm_r": {"parent": "torso", "length": 50},
        "leg_l": {"parent": "torso", "length": 60},
        "leg_r": {"parent": "torso", "length": 60},
        "hand_l": {"parent": "arm_l", "length": 20},
        "hand_r": {"parent": "arm_r", "length": 20},
        "foot_l": {"parent": "leg_l", "length": 25},
        "foot_r": {"parent": "leg_r", "length": 25},
    }
    for g in groups:
        g_lower = g.lower()
        for part, data in known_parts.items():
            if part in g_lower or part.replace("_", "") in g_lower:
                rig["bones"].append({
                    "id": f"bone_{part}",
                    "name": part,
                    "parent": data["parent"],
                    "length": data["length"],
                    "group_id": g
                })
                break
    return rig


if __name__ == "__main__":
    # Test
    import tempfile
    ws = Path(tempfile.mkdtemp())
    proj = create_animation_project(ws, "Test", fps=24)
    sid = proj.add_scene("Escena 1")
    proj.set_scene(sid)
    lid = proj.add_layer(sid, "Cielo", layer_type="background", z_index=0)
    lid2 = proj.add_layer(sid, "Personaje", layer_type="character", z_index=10)
    proj.set_keyframe(sid, lid, 1, transform={"x": 0, "y": 0, "scale": 1.0, "rotation": 0})
    proj.set_keyframe(sid, lid, 24, transform={"x": 100, "y": 0, "scale": 1.1, "rotation": 5})
    proj.set_keyframe(sid, lid2, 1, transform={"x": 200, "y": 300, "scale": 0.8})
    proj.set_keyframe(sid, lid2, 24, transform={"x": 400, "y": 300, "scale": 1.0}, easing="ease-in-out")
    proj.save()
    print(f"Proyecto creado en: {proj.project_file}")
    print(f"Frame 12 kf: {proj.get_keyframe_at(sid, lid, 12)}")
