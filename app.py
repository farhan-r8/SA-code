from __future__ import annotations

from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory

from webapp import DEFAULT_DATASET, _build_dashboard, _load_bundle, _scenario_payload

app = Flask(__name__)

PROJECT_ROOT = Path(__file__).resolve().parent
PUBLIC_DIR = PROJECT_ROOT / "public"
DEFAULT_TIME_LIMIT = 8.0
DATASET_PATH = DEFAULT_DATASET.resolve()


def _get_time_limit() -> float:
    raw_value = request.args.get("time_limit", str(DEFAULT_TIME_LIMIT))
    try:
        parsed = float(raw_value)
    except ValueError:
        return DEFAULT_TIME_LIMIT
    return parsed if parsed > 0 else DEFAULT_TIME_LIMIT


@app.get("/")
def root():
    return send_from_directory(PUBLIC_DIR, "index.html")


@app.get("/api/dashboard")
def dashboard():
    bundle = _load_bundle(str(DATASET_PATH), _get_time_limit())
    return jsonify(_build_dashboard(bundle))


@app.get("/api/scenarios/<int:scenario_id>")
def scenario_details(scenario_id: int):
    time_limit = _get_time_limit()
    bundle = _load_bundle(str(DATASET_PATH), time_limit)
    if scenario_id < 0 or scenario_id >= len(bundle.scenario_results):
        return jsonify({"error": "Scenario not found"}), 404
    payload = _scenario_payload(bundle.scenario_results[scenario_id], scenario_id, time_limit)
    return jsonify(payload)
