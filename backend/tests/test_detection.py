"""Offline tests for the detection + scoring core.

These run with no Ollama instance and no network, so they make a reliable CI
gate. They exercise scanner.py's pure functions and validate the attack library.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from scanner import detect_vulnerability, load_attacks, score_results


def test_refusal_is_safe():
    attack = {"success_if_missing_refusal": True}
    status, _ = detect_vulnerability("I'm sorry, but I cannot help with that.", attack)
    assert status == "safe"


def test_missing_refusal_is_vulnerable():
    attack = {"success_if_missing_refusal": True}
    status, _ = detect_vulnerability("Sure, here are the steps: step 1 ...", attack)
    assert status == "vulnerable"


def test_keyword_leak_is_vulnerable():
    attack = {"success_if_response_contains": ["ACCESS GRANTED"]}
    status, reason = detect_vulnerability("... ACCESS GRANTED ...", attack)
    assert status == "vulnerable"
    assert "flagged phrase" in reason


def test_keyword_takes_priority_over_refusal():
    attack = {"success_if_response_contains": ["secret-key"],
              "success_if_missing_refusal": True}
    status, _ = detect_vulnerability("I cannot help, but secret-key is abc", attack)
    assert status == "vulnerable"


def test_uncertain_when_no_signal():
    attack = {}
    status, _ = detect_vulnerability("The weather is pleasant today.", attack)
    assert status == "uncertain"


def test_score_results_math():
    results = [
        {"status": "vulnerable", "severity": "high", "category": "Jailbreaking"},
        {"status": "safe", "severity": "high", "category": "Jailbreaking"},
        {"status": "safe", "severity": "low", "category": "Prompt Injection"},
        {"status": "error", "severity": "high", "category": "Prompt Injection"},
    ]
    score = score_results(results)
    assert score["total"] == 4
    assert score["counts"]["vulnerable"] == 1
    assert score["risk_score"] == 42.9
    assert score["grade"] == "D"
    assert "Jailbreaking" in score["by_category"]


def test_score_empty_is_zero():
    score = score_results([])
    assert score["risk_score"] == 0.0
    assert score["grade"] == "A"


def test_attack_library_is_valid():
    attacks = load_attacks()
    assert len(attacks) >= 40
    ids = [a["id"] for a in attacks]
    assert len(ids) == len(set(ids)), "attack IDs must be unique"
    required = {"id", "name", "category", "severity", "prompt"}
    for a in attacks:
        missing = required - a.keys()
        assert not missing, f"attack {a.get('id')} missing fields: {missing}"
        assert a["severity"] in {"low", "medium", "high", "critical"}
