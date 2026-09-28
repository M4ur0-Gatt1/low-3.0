"""LOW Animation Timeline — sistema de edición temporal con tracks y easing.

Inspirado en: After Effects, Toon Boom Harmony, Blender graph editor.
Features:
  • Tracks por propiedad (position.x, rotation, opacity...)
  • Curvas de easing personalizables (bezier, hold, linear, ease-in-out)
  • Ciclo / loop / ping-pong
  • Marcadores (markers) para navegación
  • Velocity / speed graphs
"""

import math
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Tuple, Callable


class EasingCurve:
    """Curva de interpolación estilo After Effects / Blender graph editor.
    Implementa bezier cúbico para easing personalizado."""

    # Presets clásicos (AE compatible):
    LINEAR = "linear"
    EASE_IN = "ease_in"
    EASE_OUT = "ease_out"
    EASE_IN_OUT = "ease_in_out"
    BACK_IN = "back_in"
    BACK_OUT = "back_out"
    ELASTIC_IN = "elastic_in"
    BOUNCE_OUT = "bounce_out"
    CUSTOM = "custom"

    def __init__(self, preset: str = LINEAR,
                 cp1x: float = 0.0, cp1y: float = 0.0,
                 cp2x: float = 1.0, cp2y: float = 1.0):
        self.preset = preset
        self.cp1x, self.cp1y = cp1x, cp1y  # control point 1 (salida)
        self.cp2x, self.cp2y = cp2x, cp2y  # control point 2 (entrada)

    def evaluate(self, t: float) -> float:
        """Dado t en [0,1], devuelve el valor interpolado con easing."""
        if self.preset == self.LINEAR:
            return t
        if self.preset == self.EASE_IN:
            return t * t
        if self.preset == self.EASE_OUT:
            return 1 - (1 - t) ** 2
        if self.preset == self.EASE_IN_OUT:
            if t < 0.5:
                return 2 * t * t
            return 1 - (-2 * t + 2) ** 2 / 2
        if self.preset == self.BACK_IN:
            c = 1.70158
            return t * t * ((c + 1) * t - c)
        if self.preset == self.BACK_OUT:
            c = 1.70158
            return 1 - (1 - t) ** 2 * ((c + 1) * (1 - t) - c)
        if self.preset == self.BOUNCE_OUT:
            n1, d1 = 7.5625, 2.75
            if t < 1 / d1:
                return n1 * t * t
            elif t < 2 / d1:
                return n1 * (t - 1.5 / d1) * t + 0.75
            elif t < 2.5 / d1:
                return n1 * (t - 2.25 / d1) * t + 0.9375
            return n1 * (t - 2.625 / d1) * t + 0.984375
        if self.preset == self.ELASTIC_IN:
            c = 2 * math.pi / 3
            if t == 0:
                return 0
            if t == 1:
                return 1
            return -(2 ** (10 * t - 10)) * math.sin((t * 10 - 10.75) * c)
        # CUSTOM: bezier cúbico con control points
        return self._bezier_cubic(t, self.cp1x, self.cp1y, self.cp2x, self.cp2y)

    @staticmethod
    def _bezier_cubic(t: float, cp1x: float, cp1y: float,
                      cp2x: float, cp2y: float) -> float:
        """Cubic bezier interpolation para easing. Resuelve x(t) y usa y de ese t."""
        # Newton-Raphson para encontrar u tal que x(u) = t
        # x(u) = 3*(1-u)^2*u*cp1x + 3*(1-u)*u^2*cp2x + u^3
        u = t
        for _ in range(8):
            x = 3 * (1 - u) * (1 - u) * u * cp1x + 3 * (1 - u) * u * u * cp2x + u ** 3
            dx = 9 * u * (1 - u) * (cp2x - cp1x) + 3 * (1 - u) ** 2 * cp1x + 3 * u ** 2 * (1 - cp2x)
            if abs(dx) < 1e-6:
                break
            u -= (x - t) / dx
        u = max(0.0, min(1.0, u))
        # y(u)
        return 3 * (1 - u) * (1 - u) * u * cp1y + 3 * (1 - u) * u * u * cp2y + u ** 3

    def speed_at(self, t: float) -> float:
        """Velocidad (derivada) en el punto t. Para graph editor."""
        dt = 0.001
        return (self.evaluate(t + dt) - self.evaluate(t - dt)) / (2 * dt)

    def to_dict(self) -> dict:
        return {
            "preset": self.preset,
            "cp1x": self.cp1x, "cp1y": self.cp1y,
            "cp2x": self.cp2x, "cp2y": self.cp2y,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "EasingCurve":
        return cls(d.get("preset", cls.LINEAR),
                   d.get("cp1x", 0.0), d.get("cp1y", 0.0),
                   d.get("cp2x", 1.0), d.get("cp2y", 1.0))


@dataclass
class TrackPoint:
    """Punto en el graph editor: frame + valor + easing in/out."""
    frame: int
    value: float
    ease_in: EasingCurve = field(default_factory=lambda: EasingCurve(EasingCurve.LINEAR))
    ease_out: EasingCurve = field(default_factory=lambda: EasingCurve(EasingCurve.LINEAR))
    label: str = ""
    hold: bool = False

    def to_dict(self) -> dict:
        return {
            "frame": self.frame, "value": self.value,
            "ease_in": self.ease_in.to_dict(),
            "ease_out": self.ease_out.to_dict(),
            "label": self.label, "hold": self.hold,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "TrackPoint":
        return cls(
            frame=d["frame"], value=d["value"],
            ease_in=EasingCurve.from_dict(d.get("ease_in", {})),
            ease_out=EasingCurve.from_dict(d.get("ease_out", {})),
            label=d.get("label", ""), hold=d.get("hold", False),
        )


class Track:
    """Track de propiedad: contiene keyframes (TrackPoints) para una propiedad.
    Ejemplo: 'position.x' del actor 'hero'."""

    # Tipos de propiedad conocidos:
    PROP_POSITION_X = "position.x"
    PROP_POSITION_Y = "position.y"
    PROP_ROTATION = "rotation"
    PROP_SCALE_X = "scale.x"
    PROP_SCALE_Y = "scale.y"
    PROP_OPACITY = "opacity"
    PROP_SKEW_X = "skew.x"
    PROP_SKEW_Y = "skew.y"
    PROP_PATH = "path"        # morph SVG path (string, no numérico)
    PROP_COLOR = "color"      # fill/stroke (string)

    # Propiedades con interpolación angular (para manejar 359° → 1° correctamente)
    ANGULAR_PROPS = {PROP_ROTATION}

    def __init__(self, actor_id: str, property_name: str):
        self.actor_id = actor_id
        self.property_name = property_name
        self.points: List[TrackPoint] = []
        self.pre_behavior = "constant"  # constant | linear | cycle
        self.post_behavior = "constant"
        self.color_key = "fill"  # para PROP_COLOR: fill | stroke

    def add_point(self, point: TrackPoint):
        # Reemplazar si ya existe un punto en el mismo frame (evita duplicados)
        self.points = [p for p in self.points if p.frame != point.frame]
        self.points.append(point)
        self.points.sort(key=lambda p: p.frame)

    def point_at(self, frame: int) -> Optional[TrackPoint]:
        for p in self.points:
            if p.frame == frame:
                return p
        return None

    def remove_point(self, frame: int) -> bool:
        before = len(self.points)
        self.points = [p for p in self.points if p.frame != frame]
        return len(self.points) != before

    def get_value(self, frame: int) -> float:
        """interpola el valor al frame dado."""
        if not self.points:
            return 0.0
        if frame <= self.points[0].frame:
            return self._pre_extrapolate(frame)
        if frame >= self.points[-1].frame:
            return self._post_extrapolate(frame)

        for i in range(len(self.points) - 1):
            p1, p2 = self.points[i], self.points[i + 1]
            if p1.frame <= frame <= p2.frame:
                if p1.hold:
                    return p1.value
                t = (frame - p1.frame) / max(1, p2.frame - p1.frame)
                # Combinar easing_out del keyframe anterior + easing_in del siguiente
                blended = EasingCurve._bezier_cubic(
                    t,
                    p1.ease_out.cp1x, p1.ease_out.cp1y,
                    p2.ease_in.cp2x, p2.ease_in.cp2y
                ) if not (p1.ease_out.preset == EasingCurve.LINEAR and
                          p2.ease_in.preset == EasingCurve.LINEAR) else t
                v1, v2 = p1.value, p2.value
                if self.property_name in self.ANGULAR_PROPS:
                    # shortest angle
                    delta = (v2 - v1 + 180) % 360 - 180
                    v2 = v1 + delta
                return v1 + (v2 - v1) * blended
        return self.points[-1].value

    def _pre_extrapolate(self, frame: int) -> float:
        if self.pre_behavior == "constant" or not self.points:
            return self.points[0].value if self.points else 0.0
        # linear hacia atrás
        p0, p1 = self.points[0], self.points[1] if len(self.points) > 1 else self.points[0]
        slope = (p1.value - p0.value) / max(1, p1.frame - p0.frame)
        return p0.value + slope * (frame - p0.frame)

    def _post_extrapolate(self, frame: int) -> float:
        if self.post_behavior == "constant" or not self.points:
            return self.points[-1].value if self.points else 0.0
        n = len(self.points)
        p_1, p0 = self.points[n - 2], self.points[n - 1]
        slope = (p0.value - p_1.value) / max(1, p0.frame - p_1.frame)
        return p0.value + slope * (frame - p0.frame)

    def to_dict(self) -> dict:
        return {
            "actor_id": self.actor_id, "property_name": self.property_name,
            "points": [p.to_dict() for p in self.points],
            "pre_behavior": self.pre_behavior,
            "post_behavior": self.post_behavior,
            "color_key": self.color_key,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "Track":
        t = cls(d["actor_id"], d["property_name"])
        t.points = [TrackPoint.from_dict(p) for p in d.get("points", [])]
        t.pre_behavior = d.get("pre_behavior", "constant")
        t.post_behavior = d.get("post_behavior", "constant")
        t.color_key = d.get("color_key", "fill")
        return t


class Timeline:
    """Timeline master: contiene todas las tracks, marca el playhead, bucles."""
    def __init__(self, duration: int = 240, fps: int = 24):
        self.duration = duration
        self.fps = fps
        self.tracks: Dict[str, Track] = {}  # "actor.prop" -> Track
        self.markers: Dict[int, str] = {}
        self.loop_start = 0
        self.loop_end = duration
        self._current_frame = 0

    @property
    def current_frame(self) -> int:
        return self._current_frame

    @current_frame.setter
    def current_frame(self, v: int):
        self._current_frame = max(0, min(self.duration - 1, v))

    @property
    def current_time(self) -> float:
        return self._current_frame / self.fps

    def get_or_create_track(self, actor_id: str, prop: str) -> Track:
        key = f"{actor_id}.{prop}"
        if key not in self.tracks:
            self.tracks[key] = Track(actor_id, prop)
        return self.tracks[key]

    def add_keyframe(self, actor_id: str, prop: str, frame: int, value: float,
                     ease_in: Optional[EasingCurve] = None,
                     ease_out: Optional[EasingCurve] = None,
                     label: str = ""):
        track = self.get_or_create_track(actor_id, prop)
        tp = TrackPoint(frame=frame, value=value, label=label)
        if ease_in:
            tp.ease_in = ease_in
        if ease_out:
            tp.ease_out = ease_out
        track.add_point(tp)

    def get_value(self, actor_id: str, prop: str, frame: int) -> float:
        key = f"{actor_id}.{prop}"
        if key not in self.tracks:
            return 0.0
        return self.tracks[key].get_value(frame)

    def get_actor_transform(self, actor_id: str, frame: int) -> dict:
        """Devuelve todas las propiedades de transform de un actor en un frame."""
        def v(p):
            return self.get_value(actor_id, p, frame)
        return {
            "x": v(Track.PROP_POSITION_X),
            "y": v(Track.PROP_POSITION_Y),
            "rotation": v(Track.PROP_ROTATION),
            "scale_x": v(Track.PROP_SCALE_X) or 1.0,
            "scale_y": v(Track.PROP_SCALE_Y) or 1.0,
            "skew_x": v(Track.PROP_SKEW_X),
            "skew_y": v(Track.PROP_SKEW_Y),
            "opacity": max(0.0, min(1.0, v(Track.PROP_OPACITY) or 1.0)),
        }

    def set_actor_transform(self, actor_id: str, frame: int, transform: dict,
                            ease_in: Optional[EasingCurve] = None,
                            ease_out: Optional[EasingCurve] = None):
        """Convierte un dict de transform a keyframes en tracks."""
        mapping = {
            "x": Track.PROP_POSITION_X, "y": Track.PROP_POSITION_Y,
            "rotation": Track.PROP_ROTATION,
            "scale_x": Track.PROP_SCALE_X, "scale_y": Track.PROP_SCALE_Y,
            "skew_x": Track.PROP_SKEW_X, "skew_y": Track.PROP_SKEW_Y,
            "opacity": Track.PROP_OPACITY,
        }
        for key, prop in mapping.items():
            if key in transform:
                self.add_keyframe(actor_id, prop, frame, transform[key], ease_in, ease_out)

    def clear_actor(self, actor_id: str):
        """Elimina todas las tracks de un actor."""
        keys = [k for k in self.tracks if k.startswith(f"{actor_id}.")]
        for k in keys:
            del self.tracks[k]

    def remove_keyframe(self, actor_id: str, prop: str, frame: int) -> bool:
        """Elimina el keyframe de una propiedad en un frame."""
        key = f"{actor_id}.{prop}"
        if key not in self.tracks:
            return False
        return self.tracks[key].remove_point(frame)

    def get_actor_keyframes(self, actor_id: str) -> Dict[int, dict]:
        """Devuelve {frame: {prop: value}} para todas las tracks de un actor."""
        result: Dict[int, dict] = {}
        prefix = f"{actor_id}."
        for key, track in self.tracks.items():
            if key.startswith(prefix):
                prop = key[len(prefix):]
                for p in track.points:
                    result.setdefault(p.frame, {})[prop] = p.value
        return result

    def to_dict(self) -> dict:
        return {
            "duration": self.duration, "fps": self.fps,
            "tracks": {k: v.to_dict() for k, v in self.tracks.items()},
            "markers": self.markers,
            "loop_start": self.loop_start, "loop_end": self.loop_end,
            "current_frame": self._current_frame,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "Timeline":
        tl = cls(d.get("duration", 240), d.get("fps", 24))
        tl.tracks = {k: Track.from_dict(v) for k, v in d.get("tracks", {}).items()}
        tl.markers = d.get("markers", {})
        tl.loop_start = d.get("loop_start", 0)
        tl.loop_end = d.get("loop_end", tl.duration)
        tl._current_frame = d.get("current_frame", 0)
        return tl
