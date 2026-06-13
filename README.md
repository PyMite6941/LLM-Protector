## ABOUT

Hello, I am Matt and I am a Cybersecurity student creating useful tools for the internet. This tool is local and helps LLMs have their prompt security evaluated through some simple tests.

LLM Protector scans a local Ollama model for prompt-injection and jailbreak vulnerabilities. It runs a library of attack prompts (`backend/test_attacks.yaml`) against the model you pick and reports each attack as vulnerable, safe, or uncertain.

To access the webpage for actual user experience go to https://www.i.will.add.this.later.vercel.app/

## QUICK START

```bash
./setup.sh
./run.sh
```

`run.sh` detects your OS (Windows Git Bash, WSL, macOS, Linux) and picks the right venv and Ollama launch method automatically. Once it's up, open http://localhost:5173.

## MANUAL SETUP

In `frontend/` run `npm install` to install the necessary dependencies.
In `backend/` run `python -m venv .venv` to create a virtual environment, then activate it and run `pip install -r requirements.txt` for the dependencies to be installed.

Note for WSL: the Linux venv lives at `backend/.venv-linux` instead of `backend/.venv`, so it doesn't clash with the Windows-built one.

## RUNNING MANUALLY

In `backend/` run `python main.py` while in the virtual environment — the API starts on http://localhost:8000.
In `frontend/` run `npm run dev` and navigate to the localhost url (http://localhost:5173).

## CONFIGURATION

`backend/.env`:

```
LLM_URL=http://127.0.0.1:11434
```

## WSL NOTES

- In WSL2, `localhost` does **not** reach Windows — WSL is a separate VM. The backend detects WSL and automatically falls back to the Windows host IP (the default gateway) when `LLM_URL` points at localhost.
- Ollama on Windows binds only to `127.0.0.1` by default, which WSL can't reach. `run.sh` starts it with `OLLAMA_HOST=0.0.0.0` so it listens on all interfaces. If Ollama was already running the normal way, quit it from the system tray first and let `run.sh` start it.
- If `/status` still shows `connected: false` with a timeout, allow the port through Windows Firewall (admin PowerShell):

```powershell
New-NetFirewallRule -DisplayName "Ollama WSL" -Direction Inbound -LocalPort 11434 -Protocol TCP -Action Allow
```
