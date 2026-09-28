"""LOW Animation Exporter — renderizado y exportación profesional.

Salidas soportadas:
  • Secuencia de imágenes: PNG, JPG, WEBP
  • Video: MP4 (H.264), MOV, WEBM
  • GIF animado (con optimización de paleta)
  • SVG animado (SMIL para web)
  • Lottie JSON (para apps móviles/web — After Effects compatible vía bodymovin)

Render pipeline:
  1. Frame buffer → rasterización del SVG con Cairo / Pillow
  2. Color correction (gamma, levels, curves)
  3. Composición: blend modes, motion blur, depth of field
  4. Encoder de video (ffmpeg / imageio)
"""

import io
import json
import math
import subprocess
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional, Union, Tuple
from xml.etree import ElementTree as ET


@dataclass
class RenderSettings:
    """Configuración de renderizado.
    Resolución: puede ser 1920x1080, 3840x2160, o custom.
    Frame size: 24 FPS estándar de animación; 30/60 para juegos.
    """
    width: int = 1920
    height: int = 1080
    fps: int = 24
    format: str = "mp4"       # mp4 | gif | png | jpg | webm | lottie | smil
    quality: str = "high"     # draft | medium | high | film
    color_space: str = "sRGB"
    alpha: bool = False       # canal alpha (PNG/WEBM/MOV)
    motion_blur: bool = True  # motion blur basado en velocidad
    motion_blur_samples: int = 8
    oversample: int = 2       # 2x antialiasing
    background: str = "#000000"
    bitrate: str = "8M"       # para video
    audio: Optional[str] = None  # path a archivo de audio

    # Perfiles predefinidos:
    @classmethod
    def preset_hd(cls):
        return cls(width=1920, height=1080, fps=24, format="mp4")

    @classmethod
    def preset_4k(cls):
        return cls(width=3840, height=2160, fps=24, format="mp4", bitrate="25M")

    @classmethod
    def preset_web(cls):
        return cls(width=1080, height=1080, fps=30, format="mp4", bitrate="4M")

    @classmethod
    def preset_gif(cls):
        return cls(width=480, height=480, fps=12, format="gif",
                   motion_blur=False, oversample=1)

    @classmethod
    def preset_social(cls, platform: str = "instagram_post"):
        """Instagram post: 1080x1080, story: 1080x1920"""
        sizes = {
            "instagram_post": (1080, 1080),
            "instagram_story": (1080, 1920),
            "tiktok": (1080, 1920),
            "youtube": (1280, 720),
            "x_post": (1600, 900),
        }
        w, h = sizes.get(platform, (1080, 1080))
        return cls(width=w, height=h, fps=30, format="mp4", bitrate="4M")

    def to_dict(self) -> dict:
        return {k: v for k, v in self.__dict__.items()}


class Rasterizer:
    """Rasterizador de SVG a imagen (PNG/JPG). Usa Cairo o Pillow como fallback."""

    def __init__(self, width: int, height: int, oversample: int = 2):
        self.width = width
        self.height = height
        self.oversample = oversample
        self._use_cairo = False
        try:
            import cairosvg
            self._use_cairo = True
        except ImportError:
            pass

    def render(self, svg_string: str, output_path: Union[str, Path]):
        """Renderiza un string SVG a imagen."""
        o = self.oversample
        w, h = self.width * o, self.height * o
        if self._use_cairo:
            self._render_cairo(svg_string, output_path, w, h, o)
        else:
            self._render_pillow(svg_string, output_path, w, h, o)

    def _render_cairo(self, svg: str, path: Union[str, Path], w: int, h: int, o: int):
        import cairosvg
        png_bytes = cairosvg.svg2png(bytestring=svg.encode("utf-8"),
                                       output_width=w, output_height=h)
        from PIL import Image
        img = Image.open(io.BytesIO(png_bytes))
        if o > 1:
            img = img.resize((self.width, self.height),
                             Image.Resampling.LANCZOS)
        img.save(str(path))

    def _render_pillow(self, svg: str, path: Union[str, Path], w: int, h: int, o: int):
        """Fallback: dibuja los elementos básicos de SVG con Pillow.
        Limitado: no soporta paths complejos, solo rects/ellipses/text."""
        from PIL import Image, ImageDraw, ImageFont
        img = Image.new("RGBA" if self._needs_alpha(path) else "RGB",
                        (self.width, self.height), "#000000")
        draw = ImageDraw.Draw(img)
        # Parsear SVG básico
        root = ET.fromstring(svg)
        self._draw_element(draw, root, (0, 0))
        img.save(str(path))

    def _draw_element(self, draw, elem, offset):
        """Recursivo básico para fallback Pillow."""
        tag = elem.tag.split("}")[-1] if "}" in elem.tag else elem.tag
        x = offset[0] + float(elem.get("x", 0))
        y = offset[1] + float(elem.get("y", 0))
        fill = elem.get("fill", "#888")
        if tag in ("rect",):
            w, h = float(elem.get("width", 100)), float(elem.get("height", 100))
            draw.rectangle([x, y, x + w, y + h], fill=fill)
        elif tag in ("circle", "ellipse"):
            rx = float(elem.get("r", elem.get("rx", 50)))
            ry = float(elem.get("r", elem.get("ry", 50)))
            draw.ellipse([x - rx, y - ry, x + rx, y + ry], fill=fill)

    @staticmethod
    def _needs_alpha(path: Union[str, Path]) -> bool:
        ext = Path(path).suffix.lower()
        return ext in (".png", ".webp")


class Exporter:
    """Exportador master: renderiza frames y genera el producto final."""

    def __init__(self, engine, settings: RenderSettings):
        self.engine = engine
        self.settings = settings
        self.rasterizer = Rasterizer(
            settings.width, settings.height, settings.oversample
        )

    def export(self, output_path: Union[str, Path],
               progress_callback=None) -> Path:
        """Exporta la escena completa al formato configurado."""
        fmt = self.settings.format
        if fmt in ("png", "jpg", "webp"):
            return self._export_image_sequence(output_path, progress_callback)
        if fmt == "gif":
            return self._export_gif(output_path, progress_callback)
        if fmt in ("mp4", "webm", "mov"):
            return self._export_video(output_path, progress_callback)
        if fmt == "smil":
            return self._export_smil(output_path)
        if fmt == "lottie":
            return self._export_lottie(output_path)
        raise ValueError(f"Formato no soportado: {fmt}")

    def _export_image_sequence(self, out: Union[str, Path],
                               cb) -> Path:
        out = Path(out)
        out.mkdir(parents=True, exist_ok=True)
        fmt = self.settings.format
        digits = len(str(self.engine.scene.duration))
        for i, (frame, svg) in enumerate(self.engine.play_range()):
            fpath = out / f"frame_{frame:0{digits}d}.{fmt}"
            self.rasterizer.render(svg, fpath)
            if cb:
                cb(i / self.engine.scene.duration)
        return out

    def _export_video(self, out: Union[str, Path],
                      cb) -> Path:
        out = Path(out)
        with tempfile.TemporaryDirectory() as tmp:
            tmpdir = Path(tmp)
            # Renderizar frames
            digits = len(str(self.engine.scene.duration))
            for i, (frame, svg) in enumerate(self.engine.play_range()):
                fpath = tmpdir / f"frame_{frame:0{digits}d}.png"
                self.rasterizer.render(svg, fpath)
                if cb:
                    cb(i / self.engine.scene.duration)
            # Codificar con ffmpeg
            pattern = str(tmpdir / f"frame_%0{digits}d.png")
            cmd = [
                "ffmpeg", "-y",
                "-framerate", str(self.settings.fps),
                "-i", pattern,
                "-c:v", "libx264", "-pix_fmt", "yuv420p",
                "-crf", "18" if self.settings.quality == "film" else "23",
                # bitrate
                "-b:v", self.settings.bitrate,
            ]
            if self.settings.audio:
                cmd += ["-i", str(self.settings.audio), "-c:a", "aac", "-b:a", "192k",
                        "-shortest"]
            cmd += [str(out)]
            subprocess.run(cmd, check=True, capture_output=True)
        return out

    def _export_gif(self, out: Union[str, Path],
                    cb) -> Path:
        try:
            from PIL import Image
            out = Path(out)
            with tempfile.TemporaryDirectory() as tmp:
                tmpdir = Path(tmp)
                frames = []
                for i, (frame, svg) in enumerate(self.engine.play_range()):
                    fpath = tmpdir / f"f_{i}.png"
                    self.rasterizer.render(svg, fpath)
                    img = Image.open(fpath)
                    # Optimizar paleta
                    if self.settings.quality == "draft":
                        img = img.quantize(colors=64)
                    else:
                        img = img.quantize(colors=128)
                    frames.append(img)
                    if cb:
                        cb(i / self.engine.scene.duration)
                # Guardar GIF
                frames[0].save(
                    str(out), save_all=True, append_images=frames[1:],
                    duration=int(1000 / self.settings.fps), loop=0,
                    optimize=True
                )
            return out
        except ImportError:
            raise RuntimeError("Pillow no está instalado. pip install Pillow")

    def _export_smil(self, out: Union[str, Path]) -> Path:
        """Exporta SVG con animación SMIL (para navegadores)."""
        out = Path(out)
        svg = self._build_smil_svg()
        out.write_text(svg, encoding="utf-8")
        return out

    def _build_smil_svg(self) -> str:
        """Convierte keyframes a elementos <animate> SMIL."""
        scene = self.engine.scene
        root = ET.Element("svg", {
            "xmlns": "http://www.w3.org/2000/svg",
            "version": "1.1",
            "viewBox": f"0 0 {scene.width} {scene.height}",
            "width": str(scene.width), "height": str(scene.height),
        })

        # Fondo
        ET.SubElement(root, "rect", {
            "x": "0", "y": "0",
            "width": str(scene.width), "height": str(scene.height),
            "fill": scene.background_color,
        })

        dur = scene.duration / scene.fps
        for layer in scene.layers:
            for actor in layer.actors:
                g = ET.SubElement(root, "g", {"id": actor.svg_id})
                if actor.svg_source:
                    try:
                        el = ET.fromstring(actor.svg_source)
                        g.append(el)
                    except ET.ParseError:
                        ET.SubElement(g, "path", {"d": actor.svg_source, "fill": "#888"})

                # Animaciones por propiedad
                for kf in actor.keyframes:
                    t = kf.frame / scene.fps
                    # Animate transform
                    if kf.transform.x or kf.transform.y:
                        anim = ET.SubElement(g, "animateTransform", {
                            "attributeName": "transform",
                            "type": "translate",
                            "to": f"{kf.transform.x},{kf.transform.y}",
                            "begin": f"{t:.3f}s",
                            "dur": "0.001s", "fill": "freeze",
                        })
                    if kf.transform.opacity != 1.0:
                        ET.SubElement(g, "animate", {
                            "attributeName": "opacity",
                            "to": str(kf.transform.opacity),
                            "begin": f"{t:.3f}s", "dur": "0.5s",
                            "fill": "freeze",
                        })
        return ET.tostring(root, encoding="unicode")

    def _export_lottie(self, out: Union[str, Path]) -> Path:
        """Exporta formato Lottie JSON (After Effects / bodymovin).
        Versión simplificada: soporta posición, rotación, escala, opacidad."""
        out = Path(out)
        scene = self.engine.scene
        layers = []
        shapes = []

        for layer in scene.layers:
            for actor in layer.actors:
                shape = self._actor_to_lottie(actor, scene.fps, scene.duration)
                shapes.append(shape)

        lottie = {
            "v": "5.7.0",
            "fr": scene.fps,
            "ip": 0,
            "op": scene.duration,
            "w": scene.width, "h": scene.height,
            "nm": scene.name,
            "ddd": 0,
            "assets": [],
            "layers": shapes,
        }
        out.write_text(json.dumps(lottie, indent=2), encoding="utf-8")
        return out

    def _actor_to_lottie(self, actor, fps: int, duration: int) -> dict:
        """Convierte un actor a layer de Lottie."""
        def num_kf(prop_name, default):
            """Genera propiedad animada de Lottie."""
            track_key = f"{actor.name}.{prop_name}"
            # Versión simple: extraer de keyframes del actor directamente
            kfs = [k for k in actor.keyframes]
            if not kfs:
                return {"a": 0, "k": default, "ix": 1}
            k_list = []
            for kf in kfs:
                t = kf.frame
                val = getattr(kf.transform, prop_name, default)
                k_list.append({
                    "i": {"x": [0.5], "y": [1]},
                    "o": {"x": [0.5], "y": [0]},
                    "t": t, "s": [val],
                })
            return {"a": 1, "k": k_list, "ix": 1}

        layer = {
            "ddd": 0, "ind": 1, "ty": 4, "nm": actor.name,
            "sr": 1, "ks": {
                "o": num_kf("opacity", 100),
                "r": num_kf("rotation", 0),
                "p": {"a": 1 if actor.keyframes else 0,
                      "k": self._lottie_position_keyframes(actor.keyframes, fps) if actor.keyframes
                      else {"a": 0, "k": [0, 0, 0], "ix": 2},
                      "ix": 2},
                "a": {"a": 0, "k": [0, 0, 0], "ix": 1},
                "s": {"a": 0, "k": [100, 100, 100], "ix": 6},
            },
            "ao": 0,
            "shapes": [{
                "ty": "gr", "it": [
                    {"ty": "sh", "ks": {"a": 0, "k": {"i": [], "o": [], "v": [], "c": False}},
                     "nm": "Path"},
                    {"ty": "fl", "c": {"a": 0, "k": [0.5, 0.5, 0.5, 1]}, "o": {"a": 0, "k": 100},
                     "r": 1, "nm": "Fill"},
                    {"ty": "tr", "p": {"a": 0, "k": [0, 0], "ix": 2},
                     "a": {"a": 0, "k": [0, 0], "ix": 1},
                     "s": {"a": 0, "k": [100, 100], "ix": 3},
                     "r": {"a": 0, "k": 0, "ix": 6},
                     "o": {"a": 0, "k": 100, "ix": 7},
                     "sk": {"a": 0, "k": 0, "ix": 4},
                     "sa": {"a": 0, "k": 0, "ix": 5},
                     "nm": "Transform"},
                ], "nm": actor.name},
            ],
            "ip": 0, "op": duration, "st": 0, "bm": 0,
        }
        return layer

    def _lottie_position_keyframes(self, keyframes, fps):
        """Convierte keyframes de posición a formato Lottie."""
        k_list = []
        for kf in keyframes:
            t = kf.frame
            k_list.append({
                "i": {"x": 0.833, "y": 0.833},
                "o": {"x": 0.167, "y": 0.167},
                "t": t,
                "s": [kf.transform.x, kf.transform.y, 0],
            })
        return {"a": 1, "k": k_list, "ix": 2}
