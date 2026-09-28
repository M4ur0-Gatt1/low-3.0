"""Rigging system — huesos, constraints e IK para personajes SVG."""
import json
import math
from pathlib import Path
from typing import Dict, List, Optional, Tuple


class Bone:
    """Un hueso del rig."""

    def __init__(self, id: str, name: str, parent: str = "root",
                 length: float = 50.0, angle: float = 0.0,
                 x: float = 0.0, y: float = 0.0,
                 min_angle: float = None, max_angle: float = None):
        self.id = id
        self.name = name
        self.parent = parent
        self.length = length
        self.angle = angle          # rotación en grados
        self.x = x                  # posición absoluta (calculada)
        self.y = y
        self.min_angle = min_angle  # constraint
        self.max_angle = max_angle
        self.children: List[str] = []
        self.influence = 1.0        # para blending de poses

    def end_point(self) -> Tuple[float, float]:
        """Punto final del hueso considerando ángulo y longitud."""
        rad = math.radians(self.angle)
        return (self.x + math.cos(rad) * self.length,
                self.y + math.sin(rad) * self.length)

    def to_dict(self) -> dict:
        return {
            "id": self.id, "name": self.name, "parent": self.parent,
            "length": self.length, "angle": self.angle,
            "x": self.x, "y": self.y,
            "min_angle": self.min_angle, "max_angle": self.max_angle,
            "children": self.children, "influence": self.influence
        }

    @classmethod
    def from_dict(cls, d: dict) -> "Bone":
        b = cls(d["id"], d.get("name", d["id"]), d.get("parent", "root"),
                d.get("length", 50.0), d.get("angle", 0.0),
                d.get("x", 0.0), d.get("y", 0.0),
                d.get("min_angle"), d.get("max_angle"))
        b.children = d.get("children", [])
        b.influence = d.get("influence", 1.0)
        return b


class Rig:
    """Rig completo de un personaje."""

    def __init__(self, name: str = "rig"):
        self.name = name
        self.bones: Dict[str, Bone] = {}
        self.mesh_bindings: Dict[str, str] = {}   # group_id -> bone_id
        self.constraints: List[dict] = []
        self.ik_chains: List[dict] = []
        self.poses: Dict[str, dict] = {}          # pose_name -> {bone_id: angle}
        self.default_rest_pose: Dict[str, float] = {}

    def add_bone(self, bone: Bone):
        self.bones[bone.id] = bone
        if bone.parent != "root" and bone.parent in self.bones:
            self.bones[bone.parent].children.append(bone.id)

    def remove_bone(self, bone_id: str):
        if bone_id in self.bones:
            del self.bones[bone_id]
        for b in self.bones.values():
            if bone_id in b.children:
                b.children.remove(bone_id)

    def update_forward_kinematics(self, root_id: str = None):
        """Recalcula posiciones absolutas a partir de la jerarquía."""
        processed = set()
        def _update(bid: str, parent_x: float, parent_y: float):
            if bid in processed or bid not in self.bones:
                return
            processed.add(bid)
            bone = self.bones[bid]
            bone.x = parent_x
            bone.y = parent_y
            end_x, end_y = bone.end_point()
            for child_id in bone.children:
                if child_id in self.bones:
                    self.bones[child_id].x = end_x
                    self.bones[child_id].y = end_y
                    _update(child_id, end_x, end_y)
        _update("root", 0, 0)

    def solve_ik(self, end_effector: str, target_x: float, target_y: float,
                 chain_length: int = 3, iterations: int = 10):
        """Inverse Kinematics básico (CCD algorithm)."""
        # Get chain from end effector to root
        chain = []
        current = end_effector
        for _ in range(chain_length):
            if current not in self.bones:
                break
            chain.append(current)
            parent = self.bones[current].parent
            if parent == "root":
                break
            current = parent
        if not chain:
            return
        # CCD iterations
        for _ in range(iterations):
            current_pos = self.bones[end_effector].end_point()
            dx, dy = target_x - current_pos[0], target_y - current_pos[1]
            if math.hypot(dx, dy) < 1:
                break
            for bone_id in chain:
                bone = self.bones[bone_id]
                bone_pos = (bone.x, bone.y)
                to_target = (target_x - bone_pos[0], target_y - bone_pos[1])
                to_end = (current_pos[0] - bone_pos[0], current_pos[1] - bone_pos[1])
                # Calculate angle difference
                angle_target = math.atan2(to_target[1], to_target[0])
                angle_end = math.atan2(to_end[1], to_end[0])
                delta = angle_target - angle_end
                # Normalize
                while delta > math.pi: delta -= 2 * math.pi
                while delta < -math.pi: delta += 2 * math.pi
                bone.angle += math.degrees(delta)
                # Apply constraints
                if bone.min_angle is not None:
                    bone.angle = max(bone.angle, bone.min_angle)
                if bone.max_angle is not None:
                    bone.angle = min(bone.angle, bone.max_angle)
                # Forward kinematics update for this chain
                self.update_forward_kinematics(bone_id)
                current_pos = self.bones[end_effector].end_point()

    def save_pose(self, name: str):
        """Guarda la pose actual como referencia."""
        self.poses[name] = {bid: b.angle for bid, b in self.bones.items()}

    def apply_pose(self, name: str, blend: float = 1.0):
        """Aplica una pose guardada, con blending opcional."""
        if name not in self.poses:
            return
        pose = self.poses[name]
        for bid, target_angle in pose.items():
            if bid in self.bones:
                current = self.bones[bid].angle
                self.bones[bid].angle = current + (target_angle - current) * blend
        self.update_forward_kinematics()

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "bones": {bid: b.to_dict() for bid, b in self.bones.items()},
            "mesh_bindings": self.mesh_bindings,
            "constraints": self.constraints,
            "ik_chains": self.ik_chains,
            "poses": self.poses,
            "default_rest_pose": self.default_rest_pose
        }

    @classmethod
    def from_dict(cls, d: dict) -> "Rig":
        rig = cls(d.get("name", "rig"))
        for bid, bd in d.get("bones", {}).items():
            rig.add_bone(Bone.from_dict(bd))
        rig.mesh_bindings = d.get("mesh_bindings", {})
        rig.constraints = d.get("constraints", [])
        rig.ik_chains = d.get("ik_chains", [])
        rig.poses = d.get("poses", {})
        rig.default_rest_pose = d.get("default_rest_pose", {})
        return rig

    def save(self, path: Path):
        path.write_text(json.dumps(self.to_dict(), ensure_ascii=False, indent=2),
                       encoding="utf-8")

    @classmethod
    def load(cls, path: Path) -> "Rig":
        return cls.from_dict(json.loads(path.read_text(encoding="utf-8")))


def generate_bone_rig(svg_text: str) -> Rig:
    """Genera un rig automático analizando grupos del SVG."""
    import re
    rig = Rig("auto_rig")
    # Extract groups and their approximate positions from the SVG
    # This is a basic heuristic - a real implementation would use SVG parser
    group_patterns = [
        ("root", "root", 0, 150, 0),
        ("torso", "root", 100, 0, -90),
        ("head", "torso", 70, 0, 0),
        ("arm_l", "torso", 50, -30, 135),
        ("arm_r", "torso", 50, 30, 45),
        ("leg_l", "root", 60, -20, 90),
        ("leg_r", "root", 60, 20, 90),
        ("hand_l", "arm_l", 20, 0, 0),
        ("hand_r", "arm_r", 20, 0, 0),
        ("foot_l", "leg_l", 25, 0, 0),
        ("foot_r", "leg_r", 25, 0, 0),
    ]
    for name, parent, length, angle_offset, default_angle in group_patterns:
        bone = Bone(f"bone_{name}", name, parent, length, default_angle)
        rig.add_bone(bone)
    # Bind body parts to bones based on group IDs in SVG
    for name, _, _, _, _ in group_patterns:
        pattern = rf'(<g[^>]*\bid="[^"]*{name}[^"]*"[^>]*>)'
        if re.search(pattern, svg_text, re.IGNORECASE):
            rig.mesh_bindings[name.replace("_", "-")] = f"bone_{name}"
    rig.save_pose("idle")
    return rig


def apply_rig_to_frame(svg_text: str, rig: Rig, bone_angles: dict = None) -> str:
    """Aplica el rig a un frame SVG, transformando los grupos vinculados."""
    if bone_angles:
        for bid, angle in bone_angles.items():
            if bid in rig.bones:
                rig.bones[bid].angle = angle
        rig.update_forward_kinematics()
    
    import re
    result = svg_text
    for group_id, bone_id in rig.mesh_bindings.items():
        if bone_id not in rig.bones:
            continue
        bone = rig.bones[bone_id]
        # Find the group in SVG and add transform
        pattern = rf'(<g[^>]*\bid="{re.escape(group_id)}"[^>]*)(/?>)'
        transform = f' transform="rotate({bone.angle:.1f},{bone.x:.1f},{bone.y:.1f})"'
        result = re.sub(pattern, rf'\1{transform}\2', result, count=1)
    return result
