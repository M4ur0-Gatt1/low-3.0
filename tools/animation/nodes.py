"""Node-based compositor — inspirado en After Effects / Nuke.

Cada nodo procesa una imagen/svg/máscara y produce output.
El graph se evalúa topológicamente frame a frame.
Nodos clave: Source, Transform, Blur, Blend, ColorCorrect, Matte, PreComp.
"""
import json
import math
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from xml.etree import ElementTree as ET


@dataclass
class NodePort:
    name: str
    port_type: str  # "input" | "output"
    data_type: str  # "image" | "mask" | "vector" | "value"
    value: any = None
    connected_to: List[str] = field(default_factory=list)  # node_id.port_name


class CompositorNode:
    """Nodo base del compositor."""

    def __init__(self, node_id: str, node_type: str):
        self.id = node_id
        self.type = node_type
        self.inputs: Dict[str, NodePort] = {}
        self.outputs: Dict[str, NodePort] = {}
        self.params: Dict[str, any] = {}
        self.enabled = True
        self.position = (0, 0)  # para UI graph editor

    def set_param(self, key: str, value):
        self.params[key] = value

    def get_input(self, name: str) -> any:
        port = self.inputs.get(name)
        if not port:
            return None
        return port.value

    def set_output(self, name: str, value):
        if name in self.outputs:
            self.outputs[name].value = value

    def process(self, frame: int, ctx: "NodeContext"):
        """Override en subclases."""
        pass

    def to_dict(self) -> dict:
        return {
            "id": self.id, "type": self.type,
            "params": self.params, "enabled": self.enabled,
            "position": self.position,
            "inputs": {k: v.connected_to for k, v in self.inputs.items()},
            "outputs": {k: v.connected_to for k, v in self.outputs.items()},
        }

    @classmethod
    def from_dict(cls, d: dict) -> "CompositorNode":
        node = cls(d["id"], d["type"])
        node.params = d.get("params", {})
        node.enabled = d.get("enabled", True)
        node.position = d.get("position", (0, 0))
        return node


class NodeContext:
    """Contexto de evaluación: cache de frames, referencias a escena."""
    def __init__(self, scene, renderer):
        self.scene = scene
        self.renderer = renderer
        self._cache: Dict[str, any] = {}  # "node_id:frame" -> output

    def get_cached(self, node_id: str, frame: int) -> any:
        return self._cache.get(f"{node_id}:{frame}")

    def set_cached(self, node_id: str, frame: int, value: any):
        self._cache[f"{node_id}:{frame}"] = value

    def clear_cache(self):
        self._cache.clear()


# ── Nodos concretos ──────────────────────────────────────────────────────

class SourceNode(CompositorNode):
    """Lee una capa de la escena o un asset externo."""
    def __init__(self, node_id: str):
        super().__init__(node_id, "source")
        self.outputs["out"] = NodePort("out", "output", "vector")
        self.params = {"layer_name": "", "asset_path": "", "use_scene_layer": True}

    def process(self, frame: int, ctx: NodeContext):
        svg = ""
        if self.params.get("use_scene_layer"):
            layer_name = self.params.get("layer_name", "")
            for lyr in ctx.scene.layers:
                if lyr.name == layer_name:
                    for actor in lyr.actors:
                        tr, morph = actor.get_state_at(frame)
                        svg += f'<g transform="{tr.to_svg_attr()}" opacity="{tr.opacity}">'
                        if actor.svg_source:
                            svg += actor.svg_source
                        svg += '</g>'
                    break
        else:
            p = Path(self.params.get("asset_path", ""))
            if p.exists():
                svg = p.read_text(encoding="utf-8")
        self.set_output("out", svg)


class TransformNode(CompositorNode):
    """Translate, rotate, scale, skew — con motion blur opcional."""
    def __init__(self, node_id: str):
        super().__init__(node_id, "transform")
        self.inputs["in"] = NodePort("in", "input", "vector")
        self.outputs["out"] = NodePort("out", "output", "vector")
        self.params = {
            "x": 0.0, "y": 0.0, "rotation": 0.0,
            "scale_x": 1.0, "scale_y": 1.0,
            "skew_x": 0.0, "skew_y": 0.0,
            "opacity": 1.0,
            "motion_blur": False, "shutter_angle": 180.0, "samples": 8,
        }

    def process(self, frame: int, ctx: NodeContext):
        svg_in = self.get_input("in") or ""
        p = self.params
        tr_str = f"translate({p['x']},{p['y']}) rotate({p['rotation']}) scale({p['scale_x']},{p['scale_y']})"
        if p.get("skew_x") or p.get("skew_y"):
            tr_str += f" skewX({p['skew_x']}) skewY({p['skew_y']})"

        if p.get("motion_blur") and self.inputs["in"].connected_to:
            samples = max(2, min(32, int(p.get("samples", 8))))
            shutter = p.get("shutter_angle", 180.0) / 360.0
            blur_parts = []
            for i in range(samples):
                alpha = (i + 1) / samples * p.get("opacity", 1.0) * (1.0 / samples)
                blur_parts.append(
                    f'<g transform="{tr_str}" opacity="{alpha:.3f}">{svg_in}</g>'
                )
            out = f'<g>{"".join(blur_parts)}</g>'
        else:
            out = f'<g transform="{tr_str}" opacity="{p.get("opacity", 1.0)}">{svg_in}</g>'
        self.set_output("out", out)


class BlurNode(CompositorNode):
    """Desenfoque gaussiano con SVG filter."""
    def __init__(self, node_id: str):
        super().__init__(node_id, "blur")
        self.inputs["in"] = NodePort("in", "input", "vector")
        self.outputs["out"] = NodePort("out", "output", "vector")
        self.params = {"radius": 5.0, "quality": 3}

    def process(self, frame: int, ctx: NodeContext):
        svg_in = self.get_input("in") or ""
        r = self.params.get("radius", 5.0)
        filt_id = f"blur_{self.id}"
        defs = f'<defs><filter id="{filt_id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="{r}" /></filter></defs>'
        out = f'{defs}<g filter="url(#{filt_id})">{svg_in}</g>'
        self.set_output("out", out)


class BlendNode(CompositorNode):
    """Mezcla dos inputs con modo de fusión (AE compatible)."""
    MODES = {
        "normal": "normal", "multiply": "multiply", "screen": "screen",
        "overlay": "overlay", "darken": "darken", "lighten": "lighten",
        "color-dodge": "color-dodge", "color-burn": "color-burn",
        "difference": "difference", "exclusion": "exclusion",
    }

    def __init__(self, node_id: str):
        super().__init__(node_id, "blend")
        self.inputs["base"] = NodePort("base", "input", "vector")
        self.inputs["blend"] = NodePort("blend", "input", "vector")
        self.outputs["out"] = NodePort("out", "output", "vector")
        self.params = {"mode": "normal", "opacity": 1.0}

    def process(self, frame: int, ctx: NodeContext):
        base = self.get_input("base") or ""
        blend = self.get_input("blend") or ""
        mode = self.MODES.get(self.params.get("mode", "normal"), "normal")
        opacity = self.params.get("opacity", 1.0)
        out = f'<g style="isolation:isolate">{base}<g style="mix-blend-mode:{mode};opacity:{opacity}">{blend}</g></g>'
        self.set_output("out", out)


class ColorCorrectNode(CompositorNode):
    """Color grading: brightness, contrast, saturation, tint."""
    def __init__(self, node_id: str):
        super().__init__(node_id, "color_correct")
        self.inputs["in"] = NodePort("in", "input", "vector")
        self.outputs["out"] = NodePort("out", "output", "vector")
        self.params = {
            "brightness": 1.0, "contrast": 1.0,
            "saturation": 1.0, "hue": 0.0,
            "tint": "#ffffff", "tint_amount": 0.0,
        }

    def process(self, frame: int, ctx: NodeContext):
        svg_in = self.get_input("in") or ""
        p = self.params
        filters = []
        if p.get("brightness", 1.0) != 1.0 or p.get("contrast", 1.0) != 1.0:
            b = p.get("brightness", 1.0)
            c = p.get("contrast", 1.0)
            filters.append(f'<feComponentTransfer><feFuncR type="linear" slope="{c}" intercept="{(1-c)*0.5 + (b-1)}"/><feFuncG type="linear" slope="{c}" intercept="{(1-c)*0.5 + (b-1)}"/><feFuncB type="linear" slope="{c}" intercept="{(1-c)*0.5 + (b-1)}"/></feComponentTransfer>')
        filt_body = "".join(filters)
        if filt_body:
            fid = f"cc_{self.id}"
            defs = f'<defs><filter id="{fid}">{filt_body}</filter></defs>'
            out = f'{defs}<g filter="url(#{fid})">{svg_in}</g>'
        else:
            out = svg_in
        self.set_output("out", out)


class MatteNode(CompositorNode):
    """Aplica una máscara vectorial (path SVG o grupo) a otro input."""
    def __init__(self, node_id: str):
        super().__init__(node_id, "matte")
        self.inputs["in"] = NodePort("in", "input", "vector")
        self.inputs["mask"] = NodePort("mask", "input", "vector")
        self.outputs["out"] = NodePort("out", "output", "vector")
        self.params = {"inverted": False, "softness": 0.0}

    def process(self, frame: int, ctx: NodeContext):
        svg_in = self.get_input("in") or ""
        mask = self.get_input("mask") or ""
        mid = f"matte_{self.id}"
        defs = f'<defs><mask id="{mid}">{mask}</mask></defs>'
        out = f'{defs}<g mask="url(#{mid})">{svg_in}</g>'
        self.set_output("out", out)


class PreCompNode(CompositorNode):
    """Sub-composición: evalúa otro graph anidado."""
    def __init__(self, node_id: str):
        super().__init__(node_id, "precomp")
        self.outputs["out"] = NodePort("out", "output", "vector")
        self.params = {"subgraph_id": "", "time_offset": 0}

    def process(self, frame: int, ctx: NodeContext):
        sub_id = self.params.get("subgraph_id")
        offset = self.params.get("time_offset", 0)
        sub = ctx.scene.subgraphs.get(sub_id) if hasattr(ctx.scene, "subgraphs") else None
        if sub:
            out = sub.render_frame(frame + offset)
            self.set_output("out", out)
        else:
            self.set_output("out", "")


class OutputNode(CompositorNode):
    """Nodo final que entrega el SVG compuesto."""
    def __init__(self, node_id: str = "output"):
        super().__init__(node_id, "output")
        self.inputs["in"] = NodePort("in", "input", "vector")
        self.params = {}

    def process(self, frame: int, ctx: NodeContext):
        svg = self.get_input("in") or ""
        self.set_output("out", svg)


# ── Node Graph Master ───────────────────────────────────────────────────

class NodeGraph:
    """Grafo de nodos con evaluación topológica frame a frame."""

    NODE_TYPES = {
        "source": SourceNode,
        "transform": TransformNode,
        "blur": BlurNode,
        "blend": BlendNode,
        "color_correct": ColorCorrectNode,
        "matte": MatteNode,
        "precomp": PreCompNode,
        "output": OutputNode,
    }

    def __init__(self, name: str = "comp"):
        self.name = name
        self.nodes: Dict[str, CompositorNode] = {}
        self.output_node = "output"

    def add_node(self, node: CompositorNode):
        self.nodes[node.id] = node

    def remove_node(self, node_id: str):
        if node_id in self.nodes:
            del self.nodes[node_id]
        for n in self.nodes.values():
            for port in n.inputs.values():
                port.connected_to = [c for c in port.connected_to if not c.startswith(f"{node_id}.")]

    def connect(self, src_node_id: str, src_port: str, dst_node_id: str, dst_port: str):
        src = self.nodes.get(src_node_id)
        dst = self.nodes.get(dst_node_id)
        if not src or not dst:
            return False
        if src_port not in src.outputs or dst_port not in dst.inputs:
            return False
        dst.inputs[dst_port].connected_to.append(f"{src_node_id}.{src_port}")
        return True

    def disconnect(self, dst_node_id: str, dst_port: str):
        dst = self.nodes.get(dst_node_id)
        if dst and dst_port in dst.inputs:
            dst.inputs[dst_port].connected_to.clear()

    def _topo_sort(self) -> List[str]:
        in_degree = {nid: 0 for nid in self.nodes}
        adj = {nid: [] for nid in self.nodes}
        for nid, node in self.nodes.items():
            for port in node.inputs.values():
                for conn in port.connected_to:
                    src_nid = conn.split(".")[0]
                    if src_nid in self.nodes:
                        adj[src_nid].append(nid)
                        in_degree[nid] += 1
        queue = [n for n, d in in_degree.items() if d == 0]
        order = []
        while queue:
            n = queue.pop(0)
            order.append(n)
            for m in adj[n]:
                in_degree[m] -= 1
                if in_degree[m] == 0:
                    queue.append(m)
        return [n for n in order if n in self.nodes]

    def evaluate(self, frame: int, ctx: NodeContext) -> str:
        """Evalúa todo el graph y devuelve SVG final."""
        order = self._topo_sort()
        for nid in order:
            node = self.nodes[nid]
            if not node.enabled:
                continue
            for port_name, port in node.inputs.items():
                if port.connected_to:
                    src = port.connected_to[0]
                    src_nid, src_port = src.split(".", 1)
                    if src_nid in self.nodes:
                        port.value = self.nodes[src_nid].outputs.get(src_port, NodePort("", "output", "")).value
            node.process(frame, ctx)
        out_node = self.nodes.get(self.output_node)
        return out_node.outputs.get("out", NodePort("", "output", "")).value if out_node else ""

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "nodes": {nid: n.to_dict() for nid, n in self.nodes.items()},
            "output_node": self.output_node,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "NodeGraph":
        graph = cls(d.get("name", "comp"))
        graph.output_node = d.get("output_node", "output")
        for nid, nd in d.get("nodes", {}).items():
            nt = nd.get("type")
            cls_node = cls.NODE_TYPES.get(nt, CompositorNode)
            node = cls_node.from_dict(nd)
            graph.nodes[nid] = node
        for nid, nd in d.get("nodes", {}).items():
            for port_name, conns in nd.get("inputs", {}).items():
                for conn in conns:
                    src_nid, src_port = conn.split(".", 1)
                    graph.connect(src_nid, src_port, nid, port_name)
        return graph
