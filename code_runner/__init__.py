"""Local Code Runner - execute code snippets in multiple languages."""
import subprocess
import tempfile
import os
from pathlib import Path

# cada runner es una invocación única (intérprete o "compilar-y-correr" en un paso).
# Si el intérprete/compilador no está instalado, run() devuelve un error claro.
RUNNERS = {
    "python": {"ext": ".py", "cmd": ["python"]},
    "javascript": {"ext": ".js", "cmd": ["node"]},
    "typescript": {"ext": ".ts", "cmd": ["npx", "tsx"]},
    "bash": {"ext": ".sh", "cmd": ["bash"]},
    "powershell": {"ext": ".ps1", "cmd": ["powershell", "-ExecutionPolicy", "Bypass", "-File"]},
    "go": {"ext": ".go", "cmd": ["go", "run"]},
    "ruby": {"ext": ".rb", "cmd": ["ruby"]},
    "php": {"ext": ".php", "cmd": ["php"]},
    "perl": {"ext": ".pl", "cmd": ["perl"]},
    "lua": {"ext": ".lua", "cmd": ["lua"]},
    "r": {"ext": ".R", "cmd": ["Rscript"]},
}


class CodeRunner:
    """Execute code snippets in temp files, capture output, auto-cleanup."""

    @staticmethod
    def run(code: str, language: str = "python", timeout: int = 30) -> dict:
        lang = language.lower()
        if lang not in RUNNERS:
            return {"success": False, "stdout": "", "stderr": "",
                    "error": f"Unsupported language: {language}. Supported: {list(RUNNERS.keys())}"}

        cfg = RUNNERS[lang]
        suffix = cfg["ext"]
        cmd = list(cfg["cmd"])
        if lang == "python":
            # en macOS/Linux suele existir solo python3
            import shutil
            exe = shutil.which("python") or shutil.which("python3")
            if exe:
                cmd = [exe]

        tmp = None
        try:
            with tempfile.NamedTemporaryFile(mode="w", suffix=suffix,
                                             delete=False, encoding="utf-8") as f:
                f.write(code)
                tmp = f.name

            result = subprocess.run(
                cmd + [tmp],
                capture_output=True, text=True, timeout=timeout,
                cwd=str(Path(tmp).parent),
                shell=(lang == "powershell"),  # needed for PS execution
                # imprescindible al correr desde una app sin consola (exe
                # windowed): stdin válido y sin ventanas de consola fantasma
                stdin=subprocess.DEVNULL,
                creationflags=(subprocess.CREATE_NO_WINDOW
                               if os.name == "nt" else 0),
            )
            return {
                "success": result.returncode == 0,
                "stdout": result.stdout,
                "stderr": result.stderr,
                "returncode": result.returncode,
            }
        except subprocess.TimeoutExpired:
            return {"success": False, "stdout": "", "stderr": f"Timeout after {timeout}s", "error": "timeout"}
        except FileNotFoundError:
            return {"success": False, "stdout": "", "stderr": "",
                    "error": f"Interpreter not found for {language}. Is it installed and in PATH?"}
        finally:
            if tmp and os.path.exists(tmp):
                os.unlink(tmp)

    @staticmethod
    def supported_languages() -> list[str]:
        return list(RUNNERS.keys())
