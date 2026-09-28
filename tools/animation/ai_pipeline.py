"""LOW Animation AI Pipeline — IA integrada en todo el flujo de animación.

Herramientas:
  • generate_image → diseño de personajes, backgrounds, props
  • edit_image → varaciones de pose, expresión, iluminación
  • animate_image → animación de un frame estático a video corto
  • generate_video → generación directa de clips
  • save_character → mantiene consistencia visual del personaje entre generaciones
  • CharacterGenerator → crea personajes desde descripción con hoja de modelo
  • PoseMaker → genera poses a partir de character card
  • SceneComposer → arma escenas completas con fondo + personajes + props
  • KeyframeAI → interpola frames usando models de video/image2video
  • StoryboardAI → convierte guión a storyboard automático

Flujo profesional (inspirado en Harmony/Moho pipeline):
  1. Personaje → generate_image con save_character → .svg (vectorización IA)
  2. Rig → rigging automático desde la estructura del personaje
  3. Poses → edit_image desde la referencia guardada
  4. Escena → compose backgrounds + characters + camera
  5. Animación → keyframes → interpolate con IA (ani_video/ani_image)
  6. Export → MP4/GIF/Lottie según necesidad
"""

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Dict, Optional, Tuple, Union
import tempfile

from .core import Scene, Actor, Layer, Transform, Keyframe, Bone
from .rigging import Rig, BoneSystem, IK_solver
from .timeline import Timeline, Track, EasingCurve


@dataclass
class CharacterCard:
    """Hoja de modelo de personaje para el pipeline IA."""
    name: str = ""
    description: str = ""  # descripción en inglés para generate_image
    style: str = "2D cartoon flat vector with thick outlines, cel shaded"
    reference_image: Optional[str] = None  # path a imagen base
    characters: Dict[str, dict] = field(default_factory=dict)  # partes del cuerpo
    # Datos extraídos para rigging:
    approximate_height_px: int = 500
    joints: Dict[str, Tuple[float, float]] = field(default_factory=dict)

    # Joint keys estándar:
    JOINT_ROOT = "root"
    JOINT_HEAD = "head"
    JOINT_NECK = "neck"
    JOINT_SHOULDER_L = "shoulder_l"
    JOINT_SHOULDER_R = "shoulder_r"
    JOINT_ELBOW_L = "elbow_l"
    JOINT_ELBOW_R = "elbow_r"
    JOINT_WRIST_L = "wrist_l"
    JOINT_WRIST_R = "wrist_r"
    JOINT_HIP_L = "hip_l"
    JOINT_HIP_R = "hip_r"
    JOINT_KNEE_L = "knee_l"
    JOINT_KNEE_R = "knee_r"
    JOINT_ANKLE_L = "ankle_l"
    JOINT_ANKLE_R = "ankle_r"

    STANDARD_JOINTS = [
        JOINT_ROOT, JOINT_HEAD, JOINT_NECK,
        JOINT_SHOULDER_L, JOINT_SHOULDER_R,
        JOINT_ELBOW_L, JOINT_ELBOW_R,
        JOINT_WRIST_L, JOINT_WRIST_R,
        JOINT_HIP_L, JOINT_HIP_R,
        JOINT_KNEE_L, JOINT_KNEE_R,
        JOINT_ANKLE_L, JOINT_ANKLE_R,
    ]

    def to_prompt(self, action: str = "") -> str:
        """Prompt completo para generate_image/edit_image."""
        parts = [
            f"{self.name}, {self.description}",
            f"Style: {self.style}",
        ]
        if action:
            parts.append(f"Action/Pose: {action}")
        return ", ".join(parts)

    def to_dict(self) -> dict:
        return {
            "name": self.name, "description": self.description,
            "style": self.style, "reference_image": self.reference_image,
            "characters": self.characters,
            "approximate_height_px": self.approximate_height_px,
            "joints": self.joints,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "CharacterCard":
        return cls(
            name=d.get("name", ""), description=d.get("description", ""),
            style=d.get("style", "2D cartoon flat vector with thick outlines, cel shaded"),
            reference_image=d.get("reference_image"),
            characters=d.get("characters", {}),
            approximate_height_px=d.get("approximate_height_px", 500),
            joints=d.get("joints", {}),
        )


class CharacterGenerator:
    """Genera personajes completos con IA: diseño → poses → rig."""

    def __init__(self, agent=None):
        """agent: referencia al agente de LOW para llamar a tools (generate_image, etc)."""
        self.agent = agent

    def create_character(self, prompt: str, name: str,
                         folder: Union[str, Path] = "assets/characters") -> CharacterCard:
        """Crea un personaje desde cero:
        1. generate_image → diseño base
        2. save_character → ficha técnica
        3. Análisis automático de joints para rigging
        """
        folder = Path(folder)
        folder.mkdir(parents=True, exist_ok=True)

        card = CharacterCard(name=name, description=prompt)

        # 1. Generar imagen base
        full_prompt = card.to_prompt()
        # Esto se ejecuta cuando el agente llama a generate_image
        # Retornamos el card; el agente debe ejecutar las tools externas
        img_path = folder / f"{name}_design.png"

        # 2. Guardar ficha
        card_path = folder / f"{name}.json"
        card_path.write_text(json.dumps(card.to_dict(), indent=2), encoding="utf-8")

        return card, img_path

    def generate_pose(self, card: CharacterCard, pose_desc: str,
                      folder: Union[str, Path]) -> Path:
        """Genera una nueva pose del personaje desde la referencia.
        Usa edit_image sobre la imagen guardada del personaje."""
        folder = Path(folder)
        if not card.reference_image:
            raise ValueError("El personaje no tiene imagen de referencia")
        prompt = f"Same character {card.name} with new pose: {pose_desc}. {card.style}"
        out_path = folder / f"{card.name}_{pose_desc.replace(' ', '_')[:30]}.png"
        return out_path, prompt

    def auto_rig(self, card: CharacterCard) -> Rig:
        """Genera un rig automático basado en joints detectados/incorporados."""
        rig = Rig(name=card.name)
        j = card.joints

        # Hueso base (root)
        if CharacterCard.JOINT_ROOT in j:
            root_pos = j[CharacterCard.JOINT_ROOT]
        else:
            root_pos = (0, 0)

        # Columna: root → hip → neck → head
        self._add_bone(rig, "spine", root_pos,
                       j.get(CharacterCard.JOINT_NECK, (0, -150)))
        self._add_bone(rig, "head", j.get(CharacterCard.JOINT_NECK, (0, -150)),
                       j.get(CharacterCard.JOINT_HEAD, (0, -250)))

        # Brazos IK (L y R)
        for side, shoulder, elbow, wrist in [
            ("l", CharacterCard.JOINT_SHOULDER_L, CharacterCard.JOINT_ELBOW_L, CharacterCard.JOINT_WRIST_L),
            ("r", CharacterCard.JOINT_SHOULDER_R, CharacterCard.JOINT_ELBOW_R, CharacterCard.JOINT_WRIST_R),
        ]:
            self._add_bone(rig, f"upper_arm_{side}",
                           j.get(shoulder, (30 * (-1 if side == "l" else 1), -140)),
                           j.get(elbow, (80 * (-1 if side == "l" else 1), -100)))
            self._add_bone(rig, f"forearm_{side}",
                           j.get(elbow, (80 * (-1 if side == "l" else 1), -100)),
                           j.get(wrist, (100 * (-1 if side == "l" else 1), -60)))
            rig.bone_system.add_ik(
                IK_solver(f"upper_arm_{side}", f"forearm_{side}",
                          f"wrist_{side}", j.get(wrist, (100, -60))),
                f"arm_ik_{side}"
            )

        # Piernas IK (L y R)
        for side, hip, knee, ankle in [
            ("l", CharacterCard.JOINT_HIP_L, CharacterCard.JOINT_KNEE_L, CharacterCard.JOINT_ANKLE_L),
            ("r", CharacterCard.JOINT_HIP_R, CharacterCard.JOINT_KNEE_R, CharacterCard.JOINT_ANKLE_R),
        ]:
            self._add_bone(rig, f"thigh_{side}",
                           j.get(hip, (20 * (-1 if side == "l" else 1), 0)),
                           j.get(knee, (40 * (-1 if side == "l" else 1), 80)))
            self._add_bone(rig, f"shin_{side}",
                           j.get(knee, (40 * (-1 if side == "l" else 1), 80)),
                           j.get(ankle, (40 * (-1 if side == "l" else 1), 180)))
            rig.bone_system.add_ik(
                IK_solver(f"thigh_{side}", f"shin_{side}",
                          f"ankle_{side}", j.get(ankle, (40, 180))),
                f"leg_ik_{side}"
            )

        return rig

    def _add_bone(self, rig: Rig, name: str, p0: Tuple[float, float], p1: Tuple[float, float]):
        bone = Bone(name=name, x0=p0[0], y0=p0[1], x1=p1[0], y1=p1[1])
        rig.bone_system.add_bone(bone)


class PoseMaker:
    """Sistema de poses: genera librerías de poses desde un personaje."""

    POSE_STAND = "standing"
    POSE_WALK = "walking"
    POSE_RUN = "running"
    POSE_JUMP = "jumping"
    POSE_SIT = "sitting"
    POSE_ATTACK = "attacking"
    POSE_HIT = "hit"
    POSE_IDLE = "idle"
    POSE_WAVE = "waving"
    POSE_POINT = "pointing"

    STANDARD_POSES = [
        POSE_STAND, POSE_WALK, POSE_RUN, POSE_JUMP,
        POSE_SIT, POSE_ATTACK, POSE_HIT, POSE_IDLE,
        POSE_WAVE, POSE_POINT,
    ]

    def __init__(self, character: CharacterCard):
        self.character = character
        self.pose_paths: Dict[str, Path] = {}

    def generate_all(self, folder: Union[str, Path]) -> Dict[str, Path]:
        """Genera la librería completa de poses."""
        folder = Path(folder)
        folder.mkdir(parents=True, exist_ok=True)
        results = {}
        for pose in self.STANDARD_POSES:
            gen = CharacterGenerator()
            path, prompt = gen.generate_pose(self.character, pose, folder)
            results[pose] = path
            self.pose_paths[pose] = path
        return results

    def apply_pose_to_rig(self, rig: Rig, pose_name: str) -> Dict[str, Transform]:
        """Calcula los transforms de huesos para una pose estándar.
        Basado en datos de animación estándar (aproximaciones de la industria)."""
        presets = {
            self.POSE_STAND: self._stand_pose,
            self.POSE_WALK: self._walk_pose,
            self.POSE_RUN: self._run_pose,
            self.POSE_JUMP: self._jump_pose,
            self.POSE_SIT: self._sit_pose,
            self.POSE_ATTACK: self._attack_pose,
            self.POSE_HIT: self._hit_pose,
            self.POSE_IDLE: self._idle_pose,
            self.POSE_WAVE: self._wave_pose,
            self.POSE_POINT: self._point_pose,
        }
        fn = presets.get(pose_name, self._stand_pose)
        return fn(rig)

    def _stand_pose(self, rig: Rig) -> Dict[str, Transform]:
        """Pose T estándar."""
        return {name: Transform() for name in rig.bone_system.bones}

    def _walk_pose(self, rig: Rig) -> Dict[str, Transform]:
        result = {}
        # Pierna izquierda adelante, derecha atrás
        for side in ["l", "r"]:
            angle = 20 * (1 if side == "l" else -1)
            result[f"thigh_{side}"] = Transform(rotation=angle)
            result[f"shin_{side}"] = Transform(rotation=-angle * 0.8)
        # Brazos opuestos a piernas
        for side in ["l", "r"]:
            angle = -20 * (1 if side == "l" else -1)
            result[f"upper_arm_{side}"] = Transform(rotation=angle)
            result[f"forearm_{side}"] = Transform(rotation=angle * 0.5)
        return result

    def _run_pose(self, rig: Rig) -> Dict[str, Transform]:
        result = {}
        for side in ["l", "r"]:
            angle = 45 * (1 if side == "l" else -1)
            result[f"thigh_{side}"] = Transform(rotation=angle)
            result[f"shin_{side}"] = Transform(rotation=-60 if side == "l" else 0)
        for side in ["l", "r"]:
            angle = -45 * (1 if side == "l" else -1)
            result[f"upper_arm_{side}"] = Transform(rotation=angle)
            result[f"forearm_{side}"] = Transform(rotation=-30)
        result["spine"] = Transform(rotation=-10)
        return result

    def _jump_pose(self, rig: Rig) -> Dict[str, Transform]:
        result = {}
        for side in ["l", "r"]:
            result[f"thigh_{side}"] = Transform(rotation=-30)
            result[f"shin_{side}"] = Transform(rotation=60)
        for side in ["l", "r"]:
            result[f"upper_arm_{side}"] = Transform(rotation=80)
            result[f"forearm_{side}"] = Transform(rotation=-20)
        result["spine"] = Transform(rotation=-15)
        result["head"] = Transform(rotation=10)
        return result

    def _sit_pose(self, rig: Rig) -> Dict[str, Transform]:
        result = {}
        for side in ["l", "r"]:
            result[f"thigh_{side}"] = Transform(rotation=-90)
            result[f"shin_{side}"] = Transform(rotation=90)
        for side in ["l", "r"]:
            result[f"upper_arm_{side}"] = Transform(rotation=-30)
            result[f"forearm_{side}"] = Transform(rotation=-60)
        result["spine"] = Transform(rotation=10)
        return result

    def _attack_pose(self, rig: Rig) -> Dict[str, Transform]:
        result = {}
        # Brazo derecho adelante (atacando)
        result["upper_arm_r"] = Transform(rotation=-80, y=-20)
        result["forearm_r"] = Transform(rotation=-10)
        result["upper_arm_l"] = Transform(rotation=30)
        result["forearm_l"] = Transform(rotation=-60)
        result["spine"] = Transform(rotation=-20, x=30)
        result["head"] = Transform(rotation=15)
        return result

    def _hit_pose(self, rig: Rig) -> Dict[str, Transform]:
        result = {}
        result["spine"] = Transform(rotation=20, x=-20)
        result["head"] = Transform(rotation=-20)
        result["upper_arm_r"] = Transform(rotation=60)
        result["forearm_r"] = Transform(rotation(-90))
        return result

    def _idle_pose(self, rig: Rig) -> Dict[str, Transform]:
        result = {}
        result["spine"] = Transform(rotation=-3)
        result["head"] = Transform(rotation=5)
        for side in ["l", "r"]:
            s = 1 if side == "l" else -1
            result[f"upper_arm_{side}"] = Transform(rotation=-10 * s)
            result[f"forearm_{side}"] = Transform(rotation=-20 * s)
        return result

    def _wave_pose(self, rig: Rig) -> Dict[str, Transform]:
        result = {}
        result["upper_arm_r"] = Transform(rotation=-120)
        result["forearm_r"] = Transform(rotation(-40))
        result["head"] = Transform(rotation=-10)
        return result

    def _point_pose(self, rig: Rig) -> Dict[str, Transform]:
        result = {}
        result["upper_arm_r"] = Transform(rotation=-70)
        result["forearm_r"] = Transform(rotation=-30)
        result["head"] = Transform(rotation=10)
        return result


class SceneComposer:
    """Compone escenas completas combinando personajes, fondos y props."""

    def __init__(self, scene: Scene):
        self.scene = scene
        self.characters: Dict[str, Tuple[CharacterCard, Rig]] = {}
        self.backgrounds: Dict[str, str] = {}  # layer_name -> prompt/SVG

    def add_character(self, card: CharacterCard, rig: Optional[Rig] = None,
                      position: Tuple[float, float] = (0, 0),
                      layer_name: str = "" ):
        """Añade un personaje a la escena con rig opcional."""
        layer = Layer(layer_name or card.name, z=len(self.scene.layers))
        actor = Actor(name=card.name, svg_id=f"{card.name}_actor")
        # SVG placeholder: el agente debe generar y convertir el personaje a SVG
        actor.svg_source = f'<circle cx="{position[0]}" cy="{position[1]}" r="50" fill="#84d"/>'
        actor.initial_transform = Transform(x=position[0], y=position[1])
        layer.add_actor(actor)
        self.scene.add_layer(layer)
        self.characters[card.name] = (card, rig)

    def add_background(self, prompt: str = "", svg: str = "",
                         layer_name: str = "background"):
        """Añade un fondo generado o SVG manual."""
        if prompt:
            self.backgrounds[layer_name] = prompt
        if svg:
            self.scene.background_svg = svg

    def set_camera_move(self, keyframes: List[Tuple[int, Transform]]):
        """Define una ruta de cámara con keyframes."""
        for frame, transform in keyframes:
            # Cada frame setea la cámara
            self.scene.camera = transform  # simplificado

    def auto_compose(self, description: str) -> Scene:
        """IA: genera una escena completa desde descripción textual.
        Ej: 'A character standing in a forest clearing at sunset'"""
        # Este método delega al agente para generar backgrounds, posicionar
        # personajes, etc. Retorna la escena compuesta.
        return self.scene


class KeyframeAI:
    """Interpola frames entre poses usando IA (image2video o video generation).
    Genera los frames intermedios entre dos poses clave del personaje."""

    def __init__(self, scene: Scene):
        self.scene = scene

    def interpolate_between_poses(self, actor_name: str, pose_a: str, pose_b: str,
                                   start_frame: int, end_frame: int,
                                   easing: Optional[EasingCurve] = None) -> List[Keyframe]:
        """Genera keyframes interpolados entre dos poses.
        En producción, aquí se usaría animate_image sobre las imágenes de poses
        para generar frames intermedios de calidad."""
        keyframes = []
        easing = easing or EasingCurve(EasingCurve.EASE_IN_OUT)
        dur = end_frame - start_frame
        for f in range(start_frame, end_frame + 1):
            t = easing.evaluate((f - start_frame) / max(1, dur))
            # Generar transform interpolado (usar PoseMaker para obtener poses)
            # En una implementación completa, se generarían imágenes intermedias
            # con animate_image y se extraerían transforms
            kf = Keyframe(frame=f, transform=Transform(rotation=t * 360))
            keyframes.append(kf)
        return keyframes

    def auto_inbetween(self, actor: Actor,
                       keyframe_indices: List[int],
                       method: str = "ease") -> None:
        """Añade keyframes automáticos entre los especificados.
        method: ease | linear | hold | ai (requiere generación de video)."""
        if len(keyframe_indices) < 2:
            return
        all_kf = sorted(actor.keyframes, key=lambda k: k.frame)
        for i in range(len(keyframe_indices) - 1):
            idx_a, idx_b = keyframe_indices[i], keyframe_indices[i + 1]
            if idx_a >= len(all_kf) or idx_b >= len(all_kf):
                continue
            kf_a, kf_b = all_kf[idx_a], all_kf[idx_b]
            for f in range(kf_a.frame + 1, kf_b.frame):
                t = (f - kf_a.frame) / max(1, kf_b.frame - kf_a.frame)
                if method == "ease":
                    t = EasingCurve(EasingCurve.EASE_IN_OUT).evaluate(t)
                elif method == "linear":
                    pass  # t stays linear
                new_transform = kf_a.transform.lerp(kf_b.transform, t)
                actor.add_keyframe(Keyframe(frame=f, transform=new_transform))


class StoryboardAI:
    """Convierte guiones textuales a storyboard de animación."""

    def __init__(self, agent=None):
        self.agent = agent
        self.scenes: List[Scene] = []

    def parse_script(self, script: str) -> List[dict]:
        """Parsea un guion dividiéndolo en escenas.
        Formato:
          SCENE 1: [descripción]
          ACTION: [acción]
          DIALOG: [diálogo]
          SHOT: [plano: wide, close-up, medium]
        """
        scenes = []
        current = {}
        for line in script.strip().split("\n"):
            line = line.strip()
            if line.upper().startswith("SCENE"):
                if current:
                    scenes.append(current)
                current = {"scene": line, "actions": [], "dialogs": [], "shots": []}
            elif line.upper().startswith(("ACTION:", "ACTION")):
                current.setdefault("actions", []).append(line.split(":", 1)[-1].strip())
            elif line.upper().startswith(("DIALOG:", "DIALOG")):
                current.setdefault("dialogs", []).append(line.split(":", 1)[-1].strip())
            elif line.upper().startswith(("SHOT:", "SHOT")):
                current.setdefault("shots", []).append(line.split(":", 1)[-1].strip())
            else:
                current.setdefault("notes", []).append(line)
        if current:
            scenes.append(current)
        return scenes

    def generate_storyboard_frames(self, scenes: List[dict],
                                    output_folder: Union[str, Path]) -> List[Path]:
        """Para cada escena, genera un cuadro de storyboard.
        Usa generate_image con prompts derivados de la descripción."""
        output_folder = Path(output_folder)
        output_folder.mkdir(parents=True, exist_ok=True)
        frames = []
        for i, scene in enumerate(scenes):
            description = f"Storyboard frame {i+1}: {scene.get('scene', '')}. "
            description += " ".join(scene.get("actions", []))
            description += " Style: 2D animation storyboard sketch, rough pencil style, clean lines."
            path = output_folder / f"storyboard_{i+1:02d}.png"
            frames.append((path, description))
        return frames


class AIPipeline:
    """Pipeline master: orquesta todo el flujo de producción con IA."""

    def __init__(self, agent=None):
        self.agent = agent
        self.character_gen = CharacterGenerator(agent)
        self.storyboard = StoryboardAI(agent)
        self.pose_maker = None  # se crea por personaje
        self.scene_composer = None  # se crea por escena

    def create_project_from_script(self, script: str, project_name: str) -> dict:
        """Flujo completo:
        1. Parsear guion
        2. Generar storyboard
        3. Diseñar personajes
        4. Crear escenas
        5. Animar
        6. Exportar
        """
        project = {
            "name": project_name,
            "script": script,
            "storyboard": [],
            "characters": {},
            "scenes": [],
            "timeline": None,
        }

        # 1. Storyboard
        scenes_data = self.storyboard.parse_script(script)
        project["storyboard"] = self.storyboard.generate_storyboard_frames(
            scenes_data, f"projects/{project_name}/storyboard"
        )

        # 2. Personajes (detectar del script)
        characters = self._extract_characters(script)
        for char_name, char_desc in characters.items():
            card, _ = self.character_gen.create_character(
                char_desc, char_name, f"projects/{project_name}/characters"
            )
            project["characters"][char_name] = card
            # Auto-rig
            rig = self.character_gen.auto_rig(card)

        return project

    def _extract_characters(self, script: str) -> Dict[str, str]:
        """Extrae nombres de personajes del guion (heurística simple)."""
        characters = {}
        for line in script.split("\n"):
            if ":" in line and not line.strip().upper().startswith(("SCENE", "ACTION", "SHOT")):
                name = line.split(":")[0].strip()
                if name and name[0].isupper() and len(name) < 30:
                    characters[name] = f"Cartoon character, {name.lower()}, 2D flat style"
        return characters

    def pose_to_keyframes(self, actor: Actor, pose_transforms: Dict[str, Transform],
                          start_frame: int) -> List[Keyframe]:
        """Convierte una pose (transforms por hueso) a keyframes del actor."""
        # Simplificado: usamos el transform promedio del personaje
        transforms = list(pose_transforms.values())
        if not transforms:
            return []
        avg = Transform()
        for t in transforms:
            avg.x += t.x; avg.y += t.y; avg.rotation += t.rotation
            avg.scale_x += t.scale_x; avg.scale_y += t.scale_y
        n = len(transforms)
        avg.x /= n; avg.y /= n; avg.rotation /= n
        avg.scale_x /= n; avg.scale_y /= n
        return [Keyframe(frame=start_frame, transform=avg)]

    def animate_walk_cycle(self, actor: Actor, start_frame: int,
                           duration_frames: int = 24) -> None:
        """Genera un ciclo de caminata automático.
        Alternating poses walk_0, walk_1 with ease_in_out."""
        poses = PoseMaker.STANDARD_POSES
        walk = PoseMaker(None)
        cycle = 12  # frames por paso
        for i in range(0, duration_frames, cycle):
            # Pose 1: pierna izq adelante
            t1 = Transform(y=0)
            kf1 = Keyframe(frame=start_frame + i, transform=t1)
            # Pose 2: pierna der adelante + salto sutil
            t2 = Transform(y=-10, rotation=2)
            kf2 = Keyframe(frame=start_frame + i + cycle // 2, transform=t2, ease_out=EasingCurve(EasingCurve.EASE_OUT))
            actor.add_keyframe(kf1)
            actor.add_keyframe(kf2)
