import asyncio
import json
import logging
import os
import time
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from scanner import (
    LLM_URL,
    SCAN_CONCURRENCY,
    SCAN_MAX_TOKENS,
    detect_vulnerability,
    load_attacks,
    query_model,
)

load_dotenv(Path(__file__).parent / ".env")

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("llm-protector")

app = FastAPI(title="LLM Protector API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ScanRequest(BaseModel):
    model: str
    attack_ids: list[str]
    system_prompt: str = ""


class AttackResult(BaseModel):
    id: str
    name: str
    category: str
    severity: str
    prompt: str
    response: str
    status: str
    reason: str


@app.get("/")
def root():
    return {"status": "ok"}


@app.get("/status")
async def ollama_status():
    """Check if Ollama is reachable at LLM_URL."""
    async with httpx.AsyncClient(timeout=5.0) as client:
        try:
            resp = await client.get(f"{LLM_URL}/api/tags")
            if resp.status_code == 200:
                return {"connected": True, "url": LLM_URL}
            return {"connected": False, "url": LLM_URL, "error": f"HTTP {resp.status_code}"}
        except Exception as e:
            return {"connected": False, "url": LLM_URL, "error": str(e)}


@app.get("/models")
async def list_models():
    """Return models installed in Ollama."""
    async with httpx.AsyncClient(timeout=5.0) as client:
        try:
            resp = await client.get(f"{LLM_URL}/api/tags")
            resp.raise_for_status()
            data = resp.json()
            return [m["name"] for m in data.get("models", [])]
        except Exception as e:
            raise HTTPException(503, f"Could not reach Ollama at {LLM_URL}: {e}") from e


@app.get("/attacks")
def list_attacks():
    """Return all attack definitions (id, name, category, severity)."""
    attacks = load_attacks()
    return [
        {k: a[k] for k in ("id", "name", "category", "severity")}
        for a in attacks
    ]


@app.post("/scan")
async def scan(req: ScanRequest):
    """Run the selected attacks and stream progress as NDJSON.

    Each line is one of:
      {"type": "log",    "message": "..."}
      {"type": "result", "data": {AttackResult fields}}
      {"type": "done",   "counts": {"vulnerable": n, "safe": n, ...}}
    """
    attacks = load_attacks()
    selected = [a for a in attacks if a["id"] in req.attack_ids]

    if not selected:
        raise HTTPException(400, "No valid attack IDs provided")

    base_url = LLM_URL.rstrip("/")
    sem = asyncio.Semaphore(SCAN_CONCURRENCY)
    queue: asyncio.Queue = asyncio.Queue()
    counts: dict[str, int] = {}

    async def emit_log(message: str):
        log.info(message)
        await queue.put({"type": "log", "message": message})

    async def run_attack(client: httpx.AsyncClient, attack: dict):
        async with sem:
            await emit_log(f"[{attack['id']}] sending prompt ({attack['severity']} / {attack['category']}) ...")
            start = time.monotonic()
            response_text = ""
            try:
                response_text = await query_model(client, base_url, req.model,
                                                  req.system_prompt, attack)
                status, reason = detect_vulnerability(response_text, attack)
            except httpx.ConnectError:
                status, reason = "error", f"Could not connect to Ollama at {base_url}"
            except Exception as e:
                status, reason = "error", str(e)

            elapsed = time.monotonic() - start
            counts[status] = counts.get(status, 0) + 1
            await emit_log(f"[{attack['id']}] {status.upper()} in {elapsed:.1f}s — {reason}")
            await queue.put({"type": "result", "data": AttackResult(
                id=attack["id"],
                name=attack["name"],
                category=attack["category"],
                severity=attack["severity"],
                prompt=attack["prompt"].strip(),
                response=response_text[:800],
                status=status,
                reason=reason,
            ).model_dump()})

    async def producer():
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                await asyncio.gather(*(run_attack(client, a) for a in selected))
        except Exception as e:
            log.exception("scan failed")
            await queue.put({"type": "log", "message": f"Scan aborted: {e}"})
        finally:
            await queue.put(None)

    async def stream():
        task = asyncio.create_task(producer())
        await emit_log(
            f"Scan started: {len(selected)} attacks against '{req.model}' "
            f"(concurrency {SCAN_CONCURRENCY}, max {SCAN_MAX_TOKENS} tokens per response)"
        )
        while True:
            item = await queue.get()
            if item is None:
                break
            yield json.dumps(item) + "\n"
        summary = ", ".join(f"{v} {k}" for k, v in sorted(counts.items())) or "no results"
        log.info(f"Scan finished: {summary}")
        yield json.dumps({"type": "done", "counts": counts}) + "\n"
        await task

    return StreamingResponse(stream(), media_type="application/x-ndjson")


if __name__ == "__main__":
    import uvicorn
    reload = os.getenv("DEV_RELOAD", "false").lower() == "true"
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=reload)
