import os
import shutil
from pathlib import Path

ROOT = Path(__file__).parent.parent
SKIP       = {".venv", ".venv-linux", "node_modules", ".git"}
CACHE_DIRS = {"__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache"}
CACHE_EXTS = {".pyc", ".pyo"}
VITE_DIRS  = [
    ROOT / "frontend" / "node_modules" / ".vite",
    ROOT / "frontend" / "node_modules" / ".cache",
]

removed = 0

for dirpath, dirs, files in os.walk(ROOT, topdown=True):
    p = Path(dirpath)

    # Remove cache dirs and prune them (os.walk won't descend into removed entries)
    for d in [d for d in dirs if d in CACHE_DIRS]:
        shutil.rmtree(p / d, ignore_errors=True)
        dirs.remove(d)
        removed += 1

    # Prune skip dirs so os.walk never descends into them
    dirs[:] = [d for d in dirs if d not in SKIP]

    for f in files:
        if os.path.splitext(f)[1] in CACHE_EXTS:
            try:
                os.unlink(p / f)
                removed += 1
            except OSError:
                pass

for d in VITE_DIRS:
    if d.exists():
        shutil.rmtree(d, ignore_errors=True)
        removed += 1

print(f"Cleared {removed} cache(s)." if removed else "No caches to clear.")
