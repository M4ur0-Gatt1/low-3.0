"""Structured, visible plan for coding sessions. Completion is reported by the agent."""
TOOL = {"type": "function", "function": {
    "name": "update_plan",
    "description": "Para tareas de código con varios pasos, publicá un plan breve antes de editar. Actualizá los estados al avanzar y dejá pendientes las verificaciones que no ejecutaste.",
    "parameters": {"type": "object", "properties": {"steps": {
        "type": "array", "minItems": 1, "maxItems": 12, "items": {
            "type": "object", "properties": {"title": {"type": "string"},
                "status": {"type": "string", "enum": ["pending", "in_progress", "completed"]}},
            "required": ["title", "status"]}}}, "required": ["steps"]}}}


def validate(steps):
    if not isinstance(steps, list) or not 1 <= len(steps) <= 12:
        raise ValueError("El plan necesita entre 1 y 12 pasos")
    clean = []
    for step in steps:
        if not isinstance(step, dict) or not isinstance(step.get("title"), str) or not step["title"].strip():
            raise ValueError("Cada paso necesita un título")
        if step.get("status") not in ("pending", "in_progress", "completed"):
            raise ValueError("Estado de paso inválido")
        clean.append({"title": step["title"].strip()[:200], "status": step["status"]})
    if sum(step["status"] == "in_progress" for step in clean) > 1:
        raise ValueError("Solo un paso puede estar en curso")
    return clean
