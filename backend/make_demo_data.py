"""Bundle the latest demo_runs benchmark into the frontend as demoData.json.

Reads the most recent demo_runs/<timestamp>/ directory produced by pipeline.py
and writes frontend/src/demoData.json so the deployed demo can replay a real,
recorded multi-model scan with no backend.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from scanner import load_attacks

RUNS = Path(__file__).resolve().parent / "demo_runs"
OUT = Path(__file__).resolve().parent.parent / "frontend" / "src" / "demoData.json"


def latest_run() -> Path:
    dirs = sorted(p for p in RUNS.iterdir() if p.is_dir())
    if not dirs:
        sys.exit("No demo_runs/ found — run pipeline.py first.")
    return dirs[-1]


def main() -> None:
    run = latest_run()
    models = []
    for f in sorted(run.glob("*.json")):
        payload = json.loads(f.read_text(encoding="utf-8"))
        clean = [r for r in payload["results"] if r["status"] != "error"]
        models.append({
            "model": payload["model"],
            "score": payload["score"],
            "results": clean,
        })
    if not models:
        sys.exit(f"No model result files in {run}")
    attacks = [
        {"id": a["id"], "name": a["name"], "category": a["category"], "severity": a["severity"]}
        for a in load_attacks()
    ]
    data = {"generatedAt": run.name, "attacks": attacks, "models": models}
    OUT.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {OUT}: {len(models)} models, {len(attacks)} attacks, run {run.name}")


if __name__ == "__main__":
    main()
