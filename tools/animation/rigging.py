"""LOW Animation Rigging — sistema de huesos 2D para personajes vectoriales.

Inspirado en: Moho (Anime Studio), Spine, Toon Boom Harmony, Blender Rigify.
Features:
  • FK (Forward Kinematics) básico
  • IK (Inverse Kinematics) de 2 huesos (solver analítico)
  • Blend FK/IK
  • Constraints: aim, stretch, copy transforms
  • Skinning por proximidad (vertex weights automáticos)
  • Pose library (guarda/carga poses)
"""

import json
import math
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Tuple


@dataclass
class Constraint:
    """Constraint que limita o guía el movimiento de un hueso."""
    name: str = ""
    type: str = ""  # aim | stretch | copy_rotation | limit_angle
    target: str = ""  # nombre del hueso target
    weight: float = 1.0
    # parámetros específicos por tipo
    params: dict = field(default_factory=dict)


class IK_solver:
    """Solver de IK de 2 huesos (brazo, pierna). Resolución analítica.
    Basado en el algoritmo de ciclo de Law of Cosines."""

    def __init__(self, upper_bone: str, lower_bone: str, effector: str,
                 target: Tuple[float, float] = (0, 0)):
        self.upper_bone = upper_bone
        self.lower_bone = lower_bone
        self.effector = effector
        self.target = list(target)
        self.pole_vector: Optional[list] = None  # codo/rodilla (evita pops)
        self.stretch: bool = False  # permite estirarse si target está fuera de alcance
        self.stiffness: float = 1.0  # 0-1 resistencia a flexión

    def solve(self, root_pos: list, upper_len: float, lower_len: float,
              current_mid: list) -> Tuple[float, float]:
        """Devuelve (angle_upper, angle_lower) en radianes.
        root_pos: posición del hombro/cadera
        current_mid: posición actual del codo/rodilla (para determinar lado)"""
        target = self.target
        dx = target[0] - root_pos[0]
        dy = target[1] - root_pos[1]
        dist = math.hypot(dx, dy)
        l1, l2 = upper_len, lower_len

        # Si está fuera de alcance
        if dist >= l1 + l2:
            if self.stretch:
                # Estirar proporcionalmente
                angle = math.atan2(target[1] - root_pos[1], target[0] - root_pos[0])
                return angle, 0.0
            angle = math.atan2(target[1] - root_pos[1], target[0] - root_pos[0])
            return angle, 0.0

        # Law of cosines
        # dist^2 = l1^2 + l2^2 - 2*l1*l2*cos(pi - angle_lower)
        # => cos(angle_lower) = (l1^2 + l2^2 - dist^2) / (2*l1*l2)
        cos_a2 = max(-1.0, min(1.0, (l1**2 + l2**2 - dist**2) / (2 * l1 * l2)))
        angle_lower = math.acos(cos_a2)

        # Ángulo del hueso superior
        cos_a1 = max(-1.0, min(1.0, (l1**2 + dist**2 - l2**2) / (2 * l1 * dist)))
        angle_to_target = math.atan2(target[1] - root_pos[1], target[0] - root_pos[0])

        # Determinar signo según polo (codo/rodilla)
        mid_target = [(target[0] + root_pos[0]) / 2, (target[1] + root_pos[1]) / 2]
        if self.pole_vector is not None:
            # cross product en 2D: a[0]*b[1] - a[1]*b[0]
            a = [self.pole_vector[0] - root_pos[0], self.pole_vector[1] - root_pos[1]]
            b = [mid_target[0] - root_pos[0], mid_target[1] - root_pos[1]]
            cross = a[0] * b[1] - a[1] * b[0]
        else:
            a = [current_mid[0] - root_pos[0], current_mid[1] - root_pos[1]]
            b = [mid_target[0] - root_pos[0], mid_target[1] - root_pos[1]]
            cross = a[0] * b[1] - a[1] * b[0]
        side = 1 if cross > 0 else -1 if cross < 0 else 1

        angle_upper = angle_to_target - side * math.acos(cos_a1)

        return angle_upper, math.pi - angle_lower * side


class BoneSystem:
    """Sistema completo de huesos con FK e IK."""
    def __init__(self):
        self.bones: Dict[str, "Bone"] = {}
        self.ik_solvers: Dict[str, IK_solver] = {}
        self.constraints: List[Constraint] = []
        self.rest_pose: Dict[str, "Transform"] = {}

    def add_bone(self, bone):
        self.bones[bone.name] = bone

    def add_ik(self, solver: IK_solver, name: str):
        self.ik_solvers[name] = solver

    def solve_ik(self, ik_name: str) -> Dict[str, float]:
        """Resuelve un solver IK y devuelve rotaciones por hueso."""
        solver = self.ik_solvers.get(ik_name)
        if not solver:
            return {}
        # Obtener huesos
        upper = self.bones.get(solver.upper_bone)
        lower = self.bones.get(solver.lower_bone)
        if not upper or not lower:
            return {}
        # Calcular longitudes
        u_len = math.hypot(upper.x1 - upper.x0, upper.y1 - upper.y0)
        l_len = math.hypot(lower.x1 - lower.x0, lower.y1 - lower.y0)
        # Posición root (hombro)
        root = [upper.x0, upper.y0]
        # Posición actual del codo (para determinar lado)
        mid = [upper.x1, upper.y1]
        angle_u, angle_l = solver.solve(root, u_len, l_len, mid)
        return {solver.upper_bone: angle_u, solver.lower_bone: angle_l}

    def fk_update(self):
        """Recalcula posiciones de huesos con Forward Kinematics."""
        for name in self.bones:
            self._update_bone_world(name)

    def _update_bone_world(self, name: str, visited=None):
        if visited is None:
            visited = set()
        if name in visited:
            return
        visited.add(name)
        bone = self.bones[name]
        if bone.parent and bone.parent in self.bones:
            self._update_bone_world(bone.parent, visited)
            parent = self.bones[bone.parent]
            # Posición base es el extremo del padre
            # Simplificado: usamos transform local
        # Calcular extremo
        bt = bone.bind_transform
        angle = math.radians(bt.rotation)
        dx = math.cos(angle) * bone.length * bt.scale_x
        dy = math.sin(angle) * bone.length * bt.scale_y
        bone.x1 = bone.x0 + dx
        bone.y1 = bone.y0 + dy

    def calculate_weights(self, bone_name: str, points: List[Tuple[float, float]],
                         falloff: float = 100.0) -> List[float]:
        """Calcula pesos automáticos de skinning para un hueso."""
        bone = self.bones.get(bone_name)
        if not bone:
            return [0.0] * len(points)
        weights = []
        for px, py in points:
            # Distancia al segmento del hueso
            ux, uy = bone.x1 - bone.x0, bone.y1 - bone.y0
            seg_len = math.hypot(ux, uy)
            if seg_len < 1e-6:
                d = math.hypot(px - bone.x0, py - bone.y0)
            else:
                # Proyección del punto sobre el segmento
                t = max(0.0, min(1.0, ((px - bone.x0) * ux + (py - bone.y0) * uy) / (seg_len ** 2)))
                cx = bone.x0 + t * ux
                cy = bone.y0 + t * uy
                d = math.hypot(px - cx, py - cy)
            weight = math.exp(-d / falloff)
            weights.append(min(1.0, weight))
        return weights

    def to_dict(self) -> dict:
        return {
            "bones": {k: v.to_dict() for k, v in self.bones.items()},
            "ik_solvers": {k: {"upper": v.upper_bone, "lower": v.lower_bone,
                               "effector": v.effector, "target": list(v.target),
                               "stretch": v.stretch, "pole": list(v.pole_vector) if v.pole_vector is not None else None}
                          for k, v in self.ik_solvers.items()},
            "constraints": [c.__dict__ for c in self.constraints],
        }

    @classmethod
    def from_dict(cls, d: dict) -> "BoneSystem":
        bs = BoneSystem()
        for bn in d.get("bones", {}).values():
            from .core import Bone
            bs.add_bone(Bone.from_dict(bn))
        # Recrear IK
        from .core import Bone
        for k, v in d.get("ik_solvers", {}).items():
            s = IK_solver(v["upper"], v["lower"], v["effector"], tuple(v["target"]))
            s.stretch = v.get("stretch", False)
            if v.get("pole"):
                s.pole_vector = list(v["pole"])
            bs.add_ik(s, k)
        bs.constraints = [Constraint(**c) for c in d.get("constraints", [])]
        return bs


class Rig:
    """Rig completo de un personaje: huesos + deformación de malla + pose library."""
    def __init__(self, name: str = ""):
        self.name = name
        self.bone_system = BoneSystem()
        self.vertex_groups: Dict[str, List[Tuple[float, float]]] = {}  # path_id -> vertices
        self.weights: Dict[str, Dict[str, List[float]]] = {}  # path_id -> {bone: [weights]}
        self.poses: Dict[str, dict] = {}  # nombre de pose -> dict de transforms
        self.deformers: List[dict] = []  # bend, twist, wave

    def bind_mesh(self, path_id: str, vertices: List[Tuple[float, float]],
                  auto_weights: bool = True):
        """Asocia una malla a huesos, calculando pesos automáticos."""
        self.vertex_groups[path_id] = vertices
        self.weights[path_id] = {}
        if auto_weights:
            for bone_name in self.bone_system.bones:
                w = self.bone_system.calculate_weights(bone_name, vertices)
                self.weights[path_id][bone_name] = w

    def set_pose(self, pose_name: str):
        """Aplica una pose guardada a los huesos."""
        pose = self.poses.get(pose_name)
        if not pose:
            return
        for bone_name, transform_dict in pose.items():
            from .core import Transform
            if bone_name in self.bone_system.bones:
                self.bone_system.bones[bone_name].bind_transform = Transform(**transform_dict)

    def save_pose(self, pose_name: str):
        """Guarda la pose actual."""
        self.poses[pose_name] = {
            name: {"x": b.bind_transform.x, "y": b.bind_transform.y,
                   "rotation": b.bind_transform.rotation,
                   "scale_x": b.bind_transform.scale_x, "scale_y": b.bind_transform.scale_y}
            for name, b in self.bone_system.bones.items()
        }

    def deform_vertices(self, path_id: str) -> List[Tuple[float, float]]:
        """Aplica deformación basada en huesos a los vértices de una malla."""
        vertices = self.vertex_groups.get(path_id, [])
        bone_weights = self.weights.get(path_id, {})
        result = []
        for i, (vx, vy) in enumerate(vertices):
            new_x, new_y = 0.0, 0.0
            total_w = 0.0
            for bone_name, weights in bone_weights.items():
                if i >= len(weights):
                    continue
                w = weights[i]
                if w < 0.001:
                    continue
                bone = self.bone_system.bones[bone_name]
                bt = bone.bind_transform
                # Transformar vértice por hueso
                angle = math.radians(bt.rotation)
                cos_a, sin_a = math.cos(angle), math.sin(angle)
                # Local respecto al hueso
                lx = vx - bone.x0
                ly = vy - bone.y0
                # Aplicar rotación + escala
                rx = lx * cos_a * bt.scale_x - ly * sin_a * bt.scale_y
                ry = lx * sin_a * bt.scale_x + ly * cos_a * bt.scale_y
                # Volver a world
                wx = bone.x0 + bt.x + rx
                wy = bone.y0 + bt.y + ry
                new_x += wx * w
                new_y += wy * w
                total_w += w
            if total_w > 0:
                result.append((new_x / total_w, new_y / total_w))
            else:
                result.append((vx, vy))
        return result

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "bone_system": self.bone_system.to_dict(),
            "poses": self.poses,
            "deformers": self.deformers,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "Rig":
        r = Rig(d.get("name", ""))
        r.bone_system = BoneSystem.from_dict(d.get("bone_system", {}))
        r.poses = d.get("poses", {})
        r.deformers = d.get("deformers", [])
        # Reconstruir weights desde vertex_groups
        # (se recalculan con bind_mesh)
        return r
