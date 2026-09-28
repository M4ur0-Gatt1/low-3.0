"""LOW Animation Studio — Motor de animación 2D con vectores y IA."""
from .project import AnimationProject, create_animation_project, EASINGS
from .storyboard import StoryboardBoard
from .renderer import FrameRenderer, render_to_video
from .rigging import Rig, apply_rig_to_frame, generate_bone_rig

__all__ = [
    "AnimationProject", "create_animation_project", "EASINGS",
    "StoryboardBoard", "FrameRenderer", "render_to_video",
    "Rig", "apply_rig_to_frame", "generate_bone_rig"
]
