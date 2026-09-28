"""Storyboard system — planos clave, anotaciones, transiciones."""
import json
import copy
import random
from pathlib import Path
from typing import List, Optional, Tuple


class StoryboardPanel:
    """Un plano del storyboard."""

    def __init__(self, id: str, image: str = "", description: str = "",
                 camera: str = "", action: str = "", duration: int = 24,
                 transition: str = "cut", sound: str = ""):
        self.id = id
        self.image = image          # path a imagen o SVG
        self.description = description
        self.camera = camera        # CU, MS, WS, pan, zoom, truck...
        self.action = action        # acción del personaje/escena
        self.duration = duration    # frames
        self.transition = transition  # cut, dissolve, wipe, fade
        self.sound = sound
        self.annotations = []       # marcadores visuales
        self.layers = []            # capas simples para este plano

    def to_dict(self) -> dict:
        return {
            "id": self.id, "image": self.image, "description": self.description,
            "camera": self.camera, "action": self.action,
            "duration": self.duration, "transition": self.transition,
            "sound": self.sound, "annotations": self.annotations,
            "layers": self.layers
        }

    @classmethod
    def from_dict(cls, d: dict) -> "StoryboardPanel":
        p = cls(d.get("id", ""), d.get("image", ""), d.get("description", ""),
                d.get("camera", ""), d.get("action", ""), d.get("duration", 24),
                d.get("transition", "cut"), d.get("sound", ""))
        p.annotations = d.get("annotations", [])
        p.layers = d.get("layers", [])
        return p


class StoryboardBoard:
    """Storyboard completo de un proyecto/escena."""

    def __init__(self, name: str = "Storyboard"):
        self.name = name
        self.panels: List[StoryboardPanel] = []
        self.aspect_ratio = "16:9"
        self.notes = ""

    def add_panel(self, index: int = None, **kwargs) -> StoryboardPanel:
        pid = f"panel_{len(self.panels) + 1:02d}"
        panel = StoryboardPanel(id=pid, **kwargs)
        if index is None or index >= len(self.panels):
            self.panels.append(panel)
        else:
            self.panels.insert(index, panel)
        return panel

    def remove_panel(self, panel_id: str):
        self.panels = [p for p in self.panels if p.id != panel_id]

    def reorder(self, new_order: List[str]):
        """new_order: lista de IDs en el orden deseado."""
        by_id = {p.id: p for p in self.panels}
        self.panels = [by_id[i] for i in new_order if i in by_id]

    def total_frames(self) -> int:
        return sum(p.duration for p in self.panels)

    def to_dict(self) -> dict:
        return {
            "name": self.name, "aspect_ratio": self.aspect_ratio,
            "notes": self.notes,
            "panels": [p.to_dict() for p in self.panels]
        }

    @classmethod
    def from_dict(cls, d: dict) -> "StoryboardBoard":
        sb = cls(d.get("name", "Storyboard"))
        sb.aspect_ratio = d.get("aspect_ratio", "16:9")
        sb.notes = d.get("notes", "")
        sb.panels = [StoryboardPanel.from_dict(p) for p in d.get("panels", [])]
        return sb

    def save(self, path: Path):
        path.write_text(json.dumps(self.to_dict(), ensure_ascii=False, indent=2),
                       encoding="utf-8")

    @classmethod
    def load(cls, path: Path) -> "StoryboardBoard":
        return cls.from_dict(json.loads(path.read_text(encoding="utf-8")))

    # ── AI Storyboard Generation ──
    def generate_from_prompt(self, prompt: str, num_panels: int = 6) -> List[dict]:
        """Genera un storyboard conceptual desde un prompt narrativo.
        Devuelve lista de dicts con plano, cámara, acción.
        No genera imágenes (eso se hace con generate_image)."""
        panels = []
        # Parse the prompt into scenes (simple heuristic)
        sentences = [s.strip() for s in prompt.split(".") if len(s.strip()) > 10]
        if len(sentences) > num_panels:
            sentences = sentences[:num_panels]
        for i, sentence in enumerate(sentences):
            camera_shots = ["wide", "medium", "close-up", "over-shoulder", "bird's eye", "low angle"]
            transitions = ["cut", "dissolve", "fade in", "fade out", "wipe"]
            panel = {
                "panel": i + 1,
                "description": sentence,
                "camera": random.choice(camera_shots),
                "action": sentence,
                "duration": random.choice([24, 48, 72]),
                "transition": transitions[i % len(transitions)],
                "notes": "Generado por IA. Revisar y ajustar cámara."
            }
            panels.append(panel)
        return panels

    def panels_for_agent(self) -> str:
        """Devuelve un resumen textual para que el agente lo use en prompts."""
        lines = [f"Storyboard: {self.name} ({len(self.panels)} planos, {self.total_frames()}f)"]
        for p in self.panels:
            lines.append(f"  {p.id}: {p.camera} — {p.description[:80]} ({p.duration}f, {p.transition})")
        return "\n".join(lines)
