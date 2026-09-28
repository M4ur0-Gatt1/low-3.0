"""LOW Animation Studio — motor de animación 2D vectorial con IA.

== Sistema UNIFICADO de animación profesional ==
Inspirado en: Harmony/Toon Boom, OpenToonz, Moho, After Effects, Spine, Blender.

Formato nativo: SVG (ilustración vectorial editable).
Animación: keyframes en JSON (timeline), interpolación con curvas-bezier.
Rigging: huesos sobre paths SVG con IK/FK, constraints, vertex weights.
Compositor: nodos estilo AE/Nuke (blend, blur, color, matte, precomp).
Exportación: secuencia PNG/JPG → video MP4, GIF, SVG animado SMIL, Lottie JSON.

Integración IA:
  • generate_image / edit_image → diseño de personajes y escenas
  • animate_image / generate_video → aceleración de cuadros clave
  • ask_model → guiones, storyboard, asistente de animación
"""

from .core import AnimationEngine, Scene, Layer, Actor, Bone, Keyframe, Transform, Morph
from .timeline import Timeline, Track, EasingCurve, TrackPoint
from .exporter import Exporter, RenderSettings, Rasterizer
from .rigging import Rig, BoneSystem, IK_solver, Constraint
from .nodes import (
    NodeGraph, NodeContext,
    SourceNode, TransformNode, BlurNode, BlendNode,
    ColorCorrectNode, MatteNode, PreCompNode, OutputNode,
    CompositorNode, NodePort,
)
from .ai_pipeline import (
    AIPipeline, CharacterGenerator, PoseMaker, SceneComposer,
    KeyframeAI, StoryboardAI, CharacterCard,
)

__all__ = [
    # Core engine
    "AnimationEngine", "Scene", "Layer", "Actor", "Bone", "Keyframe",
    "Transform", "Morph",
    # Timeline
    "Timeline", "Track", "EasingCurve", "TrackPoint",
    # Exporter
    "Exporter", "RenderSettings", "Rasterizer",
    # Rigging
    "Rig", "BoneSystem", "IK_solver", "Constraint",
    # Node compositor
    "NodeGraph", "NodeContext", "CompositorNode", "NodePort",
    "SourceNode", "TransformNode", "BlurNode", "BlendNode",
    "ColorCorrectNode", "MatteNode", "PreCompNode", "OutputNode",
    # IA Pipeline
    "AIPipeline", "CharacterGenerator", "PoseMaker", "SceneComposer",
    "KeyframeAI", "StoryboardAI", "CharacterCard",
]
