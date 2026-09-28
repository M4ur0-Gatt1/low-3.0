"""Frame Renderer — convierte frames SVG a PNG/video con cairosvg/ffmpeg."""
import base64
import io
import json
import math
import os
import subprocess
import tempfile
from pathlib import Path

try:
    import cairosvg
    HAS_CAIRO = True
except ImportError:
    HAS_CAIRO = False

try:
    from PIL import Image, ImageFilter, ImageDraw
    HAS_PIL = True
except ImportError:
    HAS_PIL = False


class FrameRenderer:
    """Renderiza frames SVG a imágenes raster y videos."""

    def __init__(self, width: int = 1920, height: int = 1080):
        self.width = width
        self.height = height

    def svg_to_png(self, svg: str, scale: float = 1.0) -> bytes:
        """SVG string  PNG bytes."""
        if not HAS_CAIRO:
            # Fallback: save as SVG, no PNG conversion
            return svg.encode("utf-8")
        try:
            out = cairosvg.svg2png(
                bytestring=svg.encode("utf-8"),
                output_width=int(self.width * scale),
                output_height=int(self.height * scale)
            )
            return out
        except Exception as e:
            return None

    def svg_to_image(self, svg: str, scale: float = 1.0):
        """SVG string  PIL Image."""
        png_bytes = self.svg_to_png(svg, scale)
        if not HAS_PIL or not png_bytes:
            return None
        return Image.open(io.BytesIO(png_bytes))

    def apply_effects(self, img, effects: list) -> Image.Image:
        """Aplica efectos tipo After Effects a una imagen PIL."""
        if not HAS_PIL:
            return img
        for ef in effects:
            etype = ef.get("type", "")
            if etype == "blur":
                img = img.filter(ImageFilter.GaussianBlur(radius=ef.get("radius", 2)))
            elif etype == "glow":
                img = self._apply_glow(img, ef.get("color", "#ffffff"), ef.get("radius", 5))
            elif etype == "brightness":
                from PIL import ImageEnhance
                enhancer = ImageEnhance.Brightness(img)
                img = enhancer.enhance(ef.get("factor", 1.0))
            elif etype == "contrast":
                from PIL import ImageEnhance
                enhancer = ImageEnhance.Contrast(img)
                img = enhancer.enhance(ef.get("factor", 1.0))
            elif etype == "shadow":
                img = self._apply_shadow(img, ef.get("offset", (5, 5)), ef.get("color", "#000000"))
        return img

    def _apply_glow(self, img: Image.Image, color: str, radius: int) -> Image.Image:
        """Genera un efecto de resplandor (glow) alrededor de la imagen."""
        if not HAS_PIL:
            return img
        # Simplified glow: blur + lighten
        glow = img.filter(ImageFilter.GaussianBlur(radius=radius * 2))
        return Image.blend(img, glow, 0.3)

    def _apply_shadow(self, img: Image.Image, offset: tuple, color: str) -> Image.Image:
        """Aplica sombra proyectada."""
        if not HAS_PIL:
            return img
        return img  # Placeholder for shadow effect


def render_sequence(project_file: Path, scene_id: str, out_dir: Path,
                     prefix: str = "frame", scale: float = 1.0) -> list[Path]:
    """Renderiza una escena completa como secuencia de imágenes."""
    from .project import AnimationProject
    proj = AnimationProject(project_file.parent, project_file)
    sc = proj.scene(scene_id)
    if not sc:
        return []
    out_dir.mkdir(parents=True, exist_ok=True)
    renderer = FrameRenderer(proj.data["project"]["width"], proj.data["project"]["height"])
    paths = []
    for frame in range(sc["in_point"], sc["out_point"] + 1):
        svg = proj.render_frame(scene_id, frame)
        png_path = out_dir / f"{prefix}_{frame:04d}.png"
        png_bytes = renderer.svg_to_png(svg, scale)
        if isinstance(png_bytes, bytes) and not png_bytes.startswith(b"<"):
            png_path.write_bytes(png_bytes)
            paths.append(png_path)
        else:
            svg_path = out_dir / f"{prefix}_{frame:04d}.svg"
            svg_path.write_text(svg, encoding="utf-8")
            paths.append(svg_path)
    return paths


def render_to_video(project_file: Path, scene_id: str, out_path: Path,
                     fps: int = 24, scale: float = 1.0, crf: int = 18) -> str:
    """Renderiza escena a video MP4."""
    tmp = out_path.parent / ".tmp_render"
    frames = render_sequence(project_file, scene_id, tmp, "frame", scale)
    if not frames:
        return " No se pudieron renderizar los frames"
    # Check if we have PNG or SVG
    ext = frames[0].suffix.lower()
    if ext == ".svg":
        return " PNG conversion not available. Install cairosvg: pip install cairosvg"
    try:
        cmd = [
            "ffmpeg", "-y",
            "-framerate", str(fps),
            "-i", str(tmp / f"frame_%04d{ext}"),
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-crf", str(crf),
            "-preset", "medium",
            str(out_path)
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            return f" ffmpeg: {result.stderr[:500]}"
        # Clean up
        import shutil
        shutil.rmtree(tmp, ignore_errors=True)
        return f" Video exportado: {out_path}"
    except FileNotFoundError:
        return " ffmpeg no encontrado. Instalar: apt/brew install ffmpeg"


def render_gif(project_file: Path, scene_id: str, out_path: Path,
                fps: int = 12, scale: float = 0.5, optimize: bool = True) -> str:
    """Renderiza a GIF animado (usando imageio o PIL)."""
    if not HAS_PIL:
        return " PIL no disponible: pip install pillow"
    tmp = out_path.parent / ".tmp_gif"
    frames = render_sequence(project_file, scene_id, tmp, "frame", scale)
    if not frames:
        return " No frames"
    images = []
    for f in frames:
        if f.suffix.lower() == ".png":
            images.append(Image.open(f))
        else:
            # Skip SVG, can't make GIF without conversion
            pass
    if not images:
        return " No hay imágenes PNG para hacer GIF"
    # Save GIF
    dur = int(1000 / fps)
    images[0].save(
        out_path, save_all=True, append_images=images[1:],
        duration=dur, loop=0, optimize=optimize
    )
    import shutil
    shutil.rmtree(tmp, ignore_errors=True)
    return f" GIF generado: {out_path}"
