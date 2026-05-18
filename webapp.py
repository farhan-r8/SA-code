from __future__ import annotations

import argparse
import json
import math
import mimetypes
import sys
import time
from dataclasses import dataclass
from functools import lru_cache
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

PROJECT_ROOT = Path(__file__).resolve().parent
SRC_DIR = PROJECT_ROOT / "src"
WEB_DIR = PROJECT_ROOT / "public"
RESULTS_DIR = PROJECT_ROOT / "results"
DEFAULT_DATASET = PROJECT_ROOT / "data" / "Dataset_uas.xlsx"

if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from assignment_solver.algorithms import greedy_assignment
from assignment_solver.dataset import Scenario
from assignment_solver.experiment import ExperimentBundle, ScenarioExperimentResult, run_full_experiment


@dataclass(frozen=True)
class DemoScenario:
    key: str
    label: str
    description: str
    matcher: str


DEMO_SCENARIOS = [
    DemoScenario(
        key="greedy-fail",
        label="Contoh Greedy Gagal",
        description="Menunjukkan Greedy memilih cepat, tetapi total biayanya kalah dari Branch and Bound.",
        matcher="max_gap",
    ),
    DemoScenario(
        key="hasil-sama",
        label="Contoh Hasil Sama",
        description="Menunjukkan ada skenario ketika Greedy dan Branch and Bound memberi biaya yang sama.",
        matcher="zero_gap",
    ),
    DemoScenario(
        key="timeout",
        label="Contoh Timeout BnB",
        description="Menunjukkan batas skalabilitas Branch and Bound pada ukuran yang lebih besar.",
        matcher="timeout",
    ),
]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Run a local web dashboard for the Greedy vs Branch and Bound assignment project."
    )
    parser.add_argument(
        "--dataset",
        default=str(DEFAULT_DATASET),
        help="Path to the Excel dataset file.",
    )
    parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="Host for the local web server.",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8000,
        help="Port for the local web server.",
    )
    parser.add_argument(
        "--time-limit",
        type=float,
        default=8.0,
        help="Time limit in seconds for Branch and Bound.",
    )
    return parser


def _serialize_assignment(
    scenario: Scenario,
    worker_index: int,
    machine_index: int,
) -> dict[str, object]:
    return {
        "worker_index": worker_index,
        "machine_index": machine_index,
        "worker": scenario.workers[worker_index],
        "machine": scenario.machines[machine_index],
        "cost": scenario.cost_matrix[worker_index][machine_index],
    }


def _serialize_algorithm_result(scenario: Scenario, result) -> dict[str, object]:
    return {
        "algorithm": result.algorithm,
        "total_cost": result.total_cost,
        "runtime_ms": round(result.runtime_ms, 4),
        "status": result.status,
        "nodes_explored": result.nodes_explored,
        "upper_bound_seed": result.upper_bound_seed,
        "assignments": [
            _serialize_assignment(scenario, pair.worker_index, pair.machine_index)
            for pair in result.assignments
        ],
    }


def _build_greedy_trace(scenario: Scenario) -> list[dict[str, object]]:
    size = scenario.size
    assigned_workers = [False] * size
    assigned_machines = [False] * size
    steps: list[dict[str, object]] = []

    for step_number in range(size):
        candidates: list[dict[str, object]] = []
        best_cost = math.inf
        selected_worker = -1
        selected_machine = -1

        for worker_index in range(size):
            if assigned_workers[worker_index]:
                continue
            for machine_index in range(size):
                if assigned_machines[machine_index]:
                    continue
                candidate_cost = scenario.cost_matrix[worker_index][machine_index]
                candidates.append(
                    {
                        "worker": scenario.workers[worker_index],
                        "machine": scenario.machines[machine_index],
                        "cost": candidate_cost,
                    }
                )
                if candidate_cost < best_cost:
                    best_cost = candidate_cost
                    selected_worker = worker_index
                    selected_machine = machine_index

        assigned_workers[selected_worker] = True
        assigned_machines[selected_machine] = True
        candidates.sort(key=lambda item: (item["cost"], item["worker"], item["machine"]))

        steps.append(
            {
                "step": step_number + 1,
                "selected": _serialize_assignment(scenario, selected_worker, selected_machine),
                "remaining_candidates": candidates[:8],
                "remaining_candidate_count": len(candidates),
            }
        )

    return steps


def _build_branch_and_bound_focus(scenario: Scenario, result) -> dict[str, object]:
    row_order = sorted(range(scenario.size), key=lambda idx: min(scenario.cost_matrix[idx]))
    machine_preferences = []
    for worker_index in row_order:
        ranked = sorted(
            range(scenario.size),
            key=lambda machine_index: scenario.cost_matrix[worker_index][machine_index],
        )
        machine_preferences.append(
            {
                "worker": scenario.workers[worker_index],
                "top_choices": [
                    {
                        "machine": scenario.machines[machine_index],
                        "cost": scenario.cost_matrix[worker_index][machine_index],
                    }
                    for machine_index in ranked[:3]
                ],
            }
        )

    return {
        "status": result.status,
        "upper_bound_seed": result.upper_bound_seed,
        "nodes_explored": result.nodes_explored,
        "row_priority": [
            {
                "worker": scenario.workers[worker_index],
                "best_local_cost": min(scenario.cost_matrix[worker_index]),
            }
            for worker_index in row_order
        ],
        "machine_preferences": machine_preferences,
    }


def _build_branch_and_bound_trace(
    scenario: Scenario,
    time_limit_seconds: float,
    max_events: int = 18,
) -> tuple[list[dict[str, object]], dict[str, object]]:
    start = time.perf_counter()
    greedy_seed = greedy_assignment(scenario.cost_matrix)
    best_cost = greedy_seed.total_cost
    size = scenario.size
    row_order = sorted(range(size), key=lambda idx: min(scenario.cost_matrix[idx]))
    sorted_machine_choices = [
        sorted(range(size), key=lambda machine_index: scenario.cost_matrix[row_index][machine_index])
        for row_index in range(size)
    ]
    current_assignment: list[int | None] = [None] * size
    events: list[dict[str, object]] = []
    nodes_explored = 0
    pruned_nodes = 0
    timed_out = False
    best_assignments = list(greedy_seed.assignments)

    def lower_bound(depth: int, used_mask: int, current_cost: int) -> int:
        estimate = current_cost
        for row_position in range(depth, size):
            row_index = row_order[row_position]
            best_local = math.inf
            for machine_index in sorted_machine_choices[row_index]:
                if not (used_mask & (1 << machine_index)):
                    best_local = scenario.cost_matrix[row_index][machine_index]
                    break
            estimate += int(best_local)
        return estimate

    def append_event(event: dict[str, object]) -> None:
        if len(events) < max_events:
            events.append(event)

    def search(depth: int, used_mask: int, current_cost: int) -> None:
        nonlocal best_cost, nodes_explored, pruned_nodes, timed_out, best_assignments

        if (time.perf_counter() - start) > time_limit_seconds:
            timed_out = True
            append_event(
                {
                    "kind": "timeout",
                    "title": "Pencarian dihentikan",
                    "detail": "Batas waktu tercapai sebelum seluruh cabang selesai dievaluasi.",
                    "depth": depth,
                    "current_cost": current_cost,
                }
            )
            return

        nodes_explored += 1
        bound = lower_bound(depth, used_mask, current_cost)
        append_event(
            {
                "kind": "visit",
                "title": f"Node level {depth} dieksplor",
                "detail": (
                    f"Biaya sementara {current_cost}, lower bound {bound}, "
                    f"best cost saat ini {best_cost}."
                ),
                "depth": depth,
                "current_cost": current_cost,
                "bound": bound,
            }
        )

        if depth == size:
            if current_cost < best_cost:
                best_cost = current_cost
                best_assignments = [
                    AssignmentPairLike(worker_index=row_index, machine_index=int(current_assignment[row_index]))
                    for row_index in range(size)
                ]
                append_event(
                    {
                        "kind": "improve",
                        "title": "Solusi terbaik diperbarui",
                        "detail": f"Ditemukan total biaya baru {best_cost}.",
                        "depth": depth,
                        "current_cost": current_cost,
                    }
                )
            return

        if bound >= best_cost:
            pruned_nodes += 1
            append_event(
                {
                    "kind": "prune",
                    "title": "Cabang dipangkas",
                    "detail": (
                        f"Lower bound {bound} tidak lebih baik dari best cost {best_cost}, "
                        "jadi cabang ini tidak dilanjutkan."
                    ),
                    "depth": depth,
                    "current_cost": current_cost,
                    "bound": bound,
                }
            )
            return

        row_index = row_order[depth]
        for machine_index in sorted_machine_choices[row_index]:
            if used_mask & (1 << machine_index):
                continue

            assignment_cost = scenario.cost_matrix[row_index][machine_index]
            new_cost = current_cost + assignment_cost
            append_event(
                {
                    "kind": "branch",
                    "title": f"Coba {scenario.workers[row_index]} -> {scenario.machines[machine_index]}",
                    "detail": (
                        f"Biaya assignment {assignment_cost}, akumulasi sementara menjadi {new_cost}."
                    ),
                    "depth": depth,
                    "current_cost": current_cost,
                    "new_cost": new_cost,
                }
            )

            if new_cost >= best_cost:
                pruned_nodes += 1
                append_event(
                    {
                        "kind": "cutoff",
                        "title": "Cabang dihentikan cepat",
                        "detail": (
                            f"Akumulasi biaya {new_cost} sudah tidak lebih baik dari best cost {best_cost}."
                        ),
                        "depth": depth + 1,
                        "current_cost": new_cost,
                    }
                )
                continue

            current_assignment[row_index] = machine_index
            search(depth + 1, used_mask | (1 << machine_index), new_cost)
            current_assignment[row_index] = None

            if timed_out:
                return

    search(depth=0, used_mask=0, current_cost=0)
    trace_summary = {
        "seed_cost": greedy_seed.total_cost,
        "best_cost": best_cost,
        "nodes_explored": nodes_explored,
        "pruned_nodes": pruned_nodes,
        "timed_out": timed_out,
    }
    return events, trace_summary


@dataclass(frozen=True)
class AssignmentPairLike:
    worker_index: int
    machine_index: int


def _serialize_trace(trace: list[dict[str, object]]) -> list[dict[str, object]]:
    return [
        {
            "step": index + 1,
            **event,
        }
        for index, event in enumerate(trace)
    ]


def _pick_demo_targets(bundle: ExperimentBundle) -> dict[str, int | None]:
    max_gap_index = None
    zero_gap_index = None
    timeout_index = None
    max_gap_value = -1

    for index, result in enumerate(bundle.scenario_results):
        if result.optimality_gap > max_gap_value:
            max_gap_value = result.optimality_gap
            max_gap_index = index
        if zero_gap_index is None and result.optimality_gap == 0:
            zero_gap_index = index
        if timeout_index is None and result.branch_and_bound.status == "timeout":
            timeout_index = index

    return {
        "max_gap": max_gap_index,
        "zero_gap": zero_gap_index,
        "timeout": timeout_index,
    }


def _scenario_payload(
    result: ScenarioExperimentResult,
    scenario_id: int,
    time_limit_seconds: float,
) -> dict[str, object]:
    scenario = result.scenario
    branch_trace, branch_trace_summary = _build_branch_and_bound_trace(scenario, time_limit_seconds)
    return {
        "id": scenario_id,
        "sheet_name": scenario.sheet_name,
        "scenario_name": scenario.scenario_name,
        "title": f"{scenario.sheet_name} - {scenario.scenario_name}",
        "size": scenario.size,
        "workers": scenario.workers,
        "machines": scenario.machines,
        "cost_matrix": scenario.cost_matrix,
        "optimality_gap": result.optimality_gap,
        "greedy": _serialize_algorithm_result(scenario, result.greedy),
        "branch_and_bound": _serialize_algorithm_result(scenario, result.branch_and_bound),
        "greedy_trace": _build_greedy_trace(scenario),
        "branch_and_bound_focus": _build_branch_and_bound_focus(scenario, result.branch_and_bound),
        "branch_and_bound_trace": _serialize_trace(branch_trace),
        "branch_and_bound_trace_summary": branch_trace_summary,
    }


@lru_cache(maxsize=8)
def _load_bundle(dataset_path_text: str, time_limit_seconds: float) -> ExperimentBundle:
    return run_full_experiment(
        dataset_path=Path(dataset_path_text),
        time_limit_seconds=time_limit_seconds,
    )


def _build_dashboard(bundle: ExperimentBundle) -> dict[str, object]:
    scenario_items = []
    timeout_count = 0
    max_gap_result = max(bundle.scenario_results, key=lambda item: item.optimality_gap)
    demo_targets = _pick_demo_targets(bundle)
    average_gap = 0.0
    if bundle.scenario_results:
        average_gap = sum(item.optimality_gap for item in bundle.scenario_results) / len(
            bundle.scenario_results
        )

    for scenario_id, result in enumerate(bundle.scenario_results):
        if result.branch_and_bound.status == "timeout":
            timeout_count += 1
        scenario_items.append(
            {
                "id": scenario_id,
                "sheet_name": result.scenario.sheet_name,
                "scenario_name": result.scenario.scenario_name,
                "title": f"{result.scenario.sheet_name} - {result.scenario.scenario_name}",
                "size": result.scenario.size,
                "greedy_cost": result.greedy.total_cost,
                "branch_and_bound_cost": result.branch_and_bound.total_cost,
                "optimality_gap": result.optimality_gap,
                "greedy_runtime_ms": round(result.greedy.runtime_ms, 4),
                "branch_and_bound_runtime_ms": round(result.branch_and_bound.runtime_ms, 4),
                "branch_and_bound_status": result.branch_and_bound.status,
                "nodes_explored": result.branch_and_bound.nodes_explored,
            }
        )

    return {
        "dataset_path": str(bundle.dataset_path),
        "dataset_name": bundle.dataset_path.name,
        "time_limit_seconds": bundle.time_limit_seconds,
        "scenario_count": len(bundle.scenario_results),
        "timeout_count": timeout_count,
        "average_optimality_gap": round(average_gap, 2),
        "max_gap": {
            "value": max_gap_result.optimality_gap,
            "scenario": f"{max_gap_result.scenario.sheet_name} - {max_gap_result.scenario.scenario_name}",
        },
        "scenarios": scenario_items,
        "chart_paths": {
            "runtime": "/results/charts/runtime_comparison.svg",
            "cost": "/results/charts/cost_comparison.svg",
            "gap": "/results/charts/optimality_gap.svg",
            "nodes": "/results/charts/nodes_explored.svg",
        },
        "demo_modes": [
            {
                "key": demo.key,
                "label": demo.label,
                "description": demo.description,
                "scenario_id": demo_targets[demo.matcher],
            }
            for demo in DEMO_SCENARIOS
        ],
    }


def _safe_float(query: dict[str, list[str]], key: str, default: float) -> float:
    raw_value = query.get(key, [str(default)])[0]
    try:
        return float(raw_value)
    except ValueError:
        return default


def _resolve_dataset(query: dict[str, list[str]], fallback: Path) -> Path:
    raw_value = query.get("dataset", [str(fallback)])[0]
    return Path(unquote(raw_value)).expanduser().resolve()


class DashboardRequestHandler(BaseHTTPRequestHandler):
    dataset_path: Path
    time_limit_seconds: float

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        route = parsed.path
        query = parse_qs(parsed.query)

        if route == "/":
            self._serve_file(WEB_DIR / "index.html", content_type="text/html; charset=utf-8")
            return
        if route == "/styles.css":
            self._serve_file(WEB_DIR / "styles.css", content_type="text/css; charset=utf-8")
            return
        if route == "/app.js":
            self._serve_file(WEB_DIR / "app.js", content_type="application/javascript; charset=utf-8")
            return
        if route.startswith("/results/"):
            relative_path = route.removeprefix("/results/")
            self._serve_file(RESULTS_DIR / relative_path)
            return
        if route == "/api/dashboard":
            self._handle_dashboard(query)
            return
        if route.startswith("/api/scenarios/"):
            self._handle_scenario(route, query)
            return

        self.send_error(HTTPStatus.NOT_FOUND, "Route not found")

    def log_message(self, format: str, *args) -> None:
        return

    def _handle_dashboard(self, query: dict[str, list[str]]) -> None:
        dataset_path = _resolve_dataset(query, self.dataset_path)
        time_limit_seconds = _safe_float(query, "time_limit", self.time_limit_seconds)
        bundle = _load_bundle(str(dataset_path), time_limit_seconds)
        self._send_json(_build_dashboard(bundle))

    def _handle_scenario(self, route: str, query: dict[str, list[str]]) -> None:
        scenario_id_text = route.rsplit("/", maxsplit=1)[-1]
        if not scenario_id_text.isdigit():
            self.send_error(HTTPStatus.BAD_REQUEST, "Scenario id must be numeric")
            return

        dataset_path = _resolve_dataset(query, self.dataset_path)
        time_limit_seconds = _safe_float(query, "time_limit", self.time_limit_seconds)
        bundle = _load_bundle(str(dataset_path), time_limit_seconds)

        scenario_id = int(scenario_id_text)
        if scenario_id < 0 or scenario_id >= len(bundle.scenario_results):
            self.send_error(HTTPStatus.NOT_FOUND, "Scenario not found")
            return

        payload = _scenario_payload(
            bundle.scenario_results[scenario_id],
            scenario_id,
            time_limit_seconds,
        )
        self._send_json(payload)

    def _serve_file(self, file_path: Path, content_type: str | None = None) -> None:
        target = file_path.resolve()
        allowed_roots = [WEB_DIR.resolve(), RESULTS_DIR.resolve()]
        if not any(root == target or root in target.parents for root in allowed_roots):
            self.send_error(HTTPStatus.FORBIDDEN, "File access denied")
            return
        if not target.exists() or not target.is_file():
            self.send_error(HTTPStatus.NOT_FOUND, "File not found")
            return

        guessed_type, _ = mimetypes.guess_type(str(target))
        final_type = content_type or guessed_type or "application/octet-stream"
        data = target.read_bytes()

        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", final_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _send_json(self, payload: dict[str, object]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    dataset_path = Path(args.dataset).expanduser().resolve()
    if not dataset_path.exists():
        raise FileNotFoundError(f"Dataset file not found: {dataset_path}")

    handler_class = type(
        "ConfiguredDashboardHandler",
        (DashboardRequestHandler,),
        {
            "dataset_path": dataset_path,
            "time_limit_seconds": args.time_limit,
        },
    )

    server = ThreadingHTTPServer((args.host, args.port), handler_class)
    print(f"Dashboard running at http://{args.host}:{args.port}")
    print(f"Dataset : {dataset_path}")
    print(f"Time limit Branch and Bound : {args.time_limit} seconds")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
