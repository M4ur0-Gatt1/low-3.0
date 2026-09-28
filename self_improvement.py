"""Sistema de automejora de LOW - análisis, optimización y aprendizaje automático."""
import json
import time
from pathlib import Path
from collections import defaultdict
from datetime import datetime
from typing import Dict, List, Optional
from dataclasses import dataclass, asdict


@dataclass
class PerformanceMetric:
    """Métrica de rendimiento de un modelo/proveedor."""
    provider: str
    model: str
    success_rate: float  # 0-1
    avg_latency: float  # ms
    avg_cost: float  # USD
    total_requests: int
    last_used: str


@dataclass
class ToolUsage:
    """Estadísticas de uso de herramientas."""
    tool_name: str
    usage_count: int
    success_count: int
    avg_duration: float  # segundos
    last_used: str


@dataclass
class ErrorPattern:
    """Patrón de error detectado."""
    error_type: str
    frequency: int
    context: str
    suggested_fix: str
    first_seen: str
    last_seen: str


class SelfImprovementSystem:
    """Sistema de automejora que analiza y optimiza el comportamiento de LOW."""
    
    def __init__(self, data_dir: Path):
        self.data_dir = data_dir
        self.metrics_file = data_dir / "performance_metrics.json"
        self.tool_usage_file = data_dir / "tool_usage.json"
        self.error_patterns_file = data_dir / "error_patterns.json"
        self.optimization_log = data_dir / "optimization_log.json"
        
        self.performance_metrics: Dict[str, PerformanceMetric] = {}
        self.tool_usage: Dict[str, ToolUsage] = {}
        self.error_patterns: List[ErrorPattern] = []
        
        self._load_data()
    
    def _load_data(self):
        """Carga datos históricos de automejora."""
        try:
            if self.metrics_file.exists():
                data = json.loads(self.metrics_file.read_text(encoding="utf-8"))
                self.performance_metrics = {
                    k: PerformanceMetric(**v) for k, v in data.items()
                }
            if self.tool_usage_file.exists():
                data = json.loads(self.tool_usage_file.read_text(encoding="utf-8"))
                self.tool_usage = {
                    k: ToolUsage(**v) for k, v in data.items()
                }
            if self.error_patterns_file.exists():
                data = json.loads(self.error_patterns_file.read_text(encoding="utf-8"))
                self.error_patterns = [ErrorPattern(**p) for p in data]
        except Exception:
            pass  # Archivos corruptos o inexistentes, empezar desde cero
    
    def _save_data(self):
        """Guarda datos de automejora."""
        try:
            self.metrics_file.write_text(
                json.dumps({k: asdict(v) for k, v in self.performance_metrics.items()}, 
                          indent=2, ensure_ascii=False),
                encoding="utf-8"
            )
            self.tool_usage_file.write_text(
                json.dumps({k: asdict(v) for k, v in self.tool_usage.items()},
                          indent=2, ensure_ascii=False),
                encoding="utf-8"
            )
            self.error_patterns_file.write_text(
                json.dumps([asdict(p) for p in self.error_patterns],
                          indent=2, ensure_ascii=False),
                encoding="utf-8"
            )
        except Exception:
            pass
    
    def record_request(self, provider: str, model: str, success: bool, 
                      latency_ms: float, cost: float):
        """Registra una solicitud a un modelo para análisis de rendimiento."""
        key = f"{provider}:{model}"
        now = datetime.now().isoformat()
        
        if key not in self.performance_metrics:
            self.performance_metrics[key] = PerformanceMetric(
                provider=provider, model=model, success_rate=0.0,
                avg_latency=0.0, avg_cost=0.0, total_requests=0, last_used=now
            )
        
        metric = self.performance_metrics[key]
        metric.total_requests += 1
        
        # Actualizar tasa de éxito con media móvil
        metric.success_rate = (
            (metric.success_rate * (metric.total_requests - 1) + (1.0 if success else 0.0))
            / metric.total_requests
        )
        
        # Actualizar latencia promedio
        metric.avg_latency = (
            (metric.avg_latency * (metric.total_requests - 1) + latency_ms)
            / metric.total_requests
        )
        
        # Actualizar costo promedio
        metric.avg_cost = (
            (metric.avg_cost * (metric.total_requests - 1) + cost)
            / metric.total_requests
        )
        
        metric.last_used = now
        self._save_data()
    
    def record_tool_usage(self, tool_name: str, success: bool, duration: float):
        """Registra el uso de una herramienta."""
        now = datetime.now().isoformat()
        
        if tool_name not in self.tool_usage:
            self.tool_usage[tool_name] = ToolUsage(
                tool_name=tool_name, usage_count=0, success_count=0,
                avg_duration=0.0, last_used=now
            )
        
        usage = self.tool_usage[tool_name]
        usage.usage_count += 1
        if success:
            usage.success_count += 1
        
        usage.avg_duration = (
            (usage.avg_duration * (usage.usage_count - 1) + duration)
            / usage.usage_count
        )
        
        usage.last_used = now
        self._save_data()
    
    def record_error(self, error_type: str, context: str, suggested_fix: str = ""):
        """Registra un error para detectar patrones."""
        now = datetime.now().isoformat()
        
        # Buscar si ya existe este patrón
        for pattern in self.error_patterns:
            if pattern.error_type == error_type and pattern.context == context:
                pattern.frequency += 1
                pattern.last_seen = now
                if suggested_fix and not pattern.suggested_fix:
                    pattern.suggested_fix = suggested_fix
                self._save_data()
                return
        
        # Nuevo patrón
        self.error_patterns.append(ErrorPattern(
            error_type=error_type, frequency=1, context=context,
            suggested_fix=suggested_fix, first_seen=now, last_seen=now
        ))
        self._save_data()
    
    def get_best_model(self, provider: str = None) -> Optional[tuple]:
        """Recomienda el mejor modelo basado en métricas de rendimiento.
        
        Returns (provider, model) o None si no hay datos suficientes.
        """
        candidates = []
        for key, metric in self.performance_metrics.items():
            if provider and metric.provider != provider:
                continue
            if metric.total_requests < 5:  # Mínimo de datos
                continue
            candidates.append(metric)
        
        if not candidates:
            return None
        
        # Puntaje: éxito alto, latencia baja, costo bajo
        def score(m: PerformanceMetric) -> float:
            return (m.success_rate * 0.5) + (1 - min(m.avg_latency / 5000, 1)) * 0.3 + (1 - min(m.avg_cost / 0.1, 1)) * 0.2
        
        best = max(candidates, key=score)
        return (best.provider, best.model)
    
    def get_optimization_suggestions(self) -> List[str]:
        """Genera sugerencias de optimización basadas en análisis."""
        suggestions = []
        
        # Análisis de modelos
        for key, metric in self.performance_metrics.items():
            if metric.total_requests < 10:
                continue
            
            if metric.success_rate < 0.7:
                suggestions.append(
                    f" {metric.provider}:{metric.model} tiene baja tasa de éxito ({metric.success_rate:.1%}). "
                    f"Considera cambiar a otro modelo."
                )
            
            if metric.avg_latency > 3000:
                suggestions.append(
                    f"🐌 {metric.provider}:{metric.model} es lento ({metric.avg_latency:.0f}ms promedio). "
                    f"Considera un modelo más rápido para tareas interactivas."
                )
        
        # Análisis de herramientas
        for tool_name, usage in self.tool_usage.items():
            if usage.usage_count < 5:
                continue
            
            success_rate = usage.success_count / usage.usage_count
            if success_rate < 0.6:
                suggestions.append(
                    f" {tool_name} falla frecuentemente ({success_rate:.1%}). "
                    f"Revisa su configuración o evítala."
                )
        
        # Análisis de patrones de error
        for pattern in self.error_patterns:
            if pattern.frequency >= 3:
                suggestions.append(
                    f" Error recurrente: {pattern.error_type} ({pattern.frequency} veces). "
                    f"Sugerencia: {pattern.suggested_fix or 'Revisar configuración'}"
                )
        
        return suggestions
    
    def auto_optimize_agent_config(self, current_config: dict) -> dict:
        """Optimiza automáticamente la configuración del agente basándose en datos históricos."""
        optimized = current_config.copy()
        
        # Ajustar max_steps basado en éxito
        avg_success = 0
        if self.performance_metrics:
            avg_success = sum(m.success_rate for m in self.performance_metrics.values()) / len(self.performance_metrics)
        
        if avg_success > 0.85:
            optimized["max_steps"] = min(optimized.get("max_steps", 40) + 5, 60)
        elif avg_success < 0.6:
            optimized["max_steps"] = max(optimized.get("max_steps", 40) - 5, 20)
        
        # Ajustar tool_profile basado en uso de herramientas
        media_tools = {"generate_image", "edit_image", "animate_image", "generate_video"}
        media_usage = sum(self.tool_usage.get(t, ToolUsage(t, 0, 0, 0, "")).usage_count 
                         for t in media_tools)
        code_usage = sum(self.tool_usage.get(t, ToolUsage(t, 0, 0, 0, "")).usage_count 
                        for t in {"read_file", "write_file", "edit_file", "run_code"})
        
        if media_usage > code_usage * 2:
            optimized["tool_profile"] = "design"
        elif code_usage > media_usage * 2:
            optimized["tool_profile"] = "code"
        
        # Registrar optimización
        self._log_optimization(optimized)
        
        return optimized
    
    def _log_optimization(self, config: dict):
        """Registra cambios de configuración por automejora."""
        log_entry = {
            "timestamp": datetime.now().isoformat(),
            "config": config,
            "trigger": "auto_optimization"
        }
        
        logs = []
        if self.optimization_log.exists():
            try:
                logs = json.loads(self.optimization_log.read_text(encoding="utf-8"))
            except Exception:
                pass
        
        logs.append(log_entry)
        # Mantener solo los últimos 100 logs
        logs = logs[-100:]
        
        self.optimization_log.write_text(
            json.dumps(logs, indent=2, ensure_ascii=False),
            encoding="utf-8"
        )
    
    def get_diagnostic_report(self) -> dict:
        """Genera un reporte de diagnóstico del sistema."""
        return {
            "performance_metrics": {k: asdict(v) for k, v in self.performance_metrics.items()},
            "tool_usage": {k: asdict(v) for k, v in self.tool_usage.items()},
            "error_patterns": [asdict(p) for p in self.error_patterns],
            "optimization_suggestions": self.get_optimization_suggestions(),
            "best_model": self.get_best_model(),
            "timestamp": datetime.now().isoformat()
        }
