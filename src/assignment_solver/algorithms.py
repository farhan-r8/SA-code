from __future__ import annotations

import math
import time
from dataclasses import dataclass


@dataclass(frozen=True)
class AssignmentPair:
    worker_index: int
    machine_index: int


@dataclass(frozen=True)
class AlgorithmResult:
    algorithm: str
    total_cost: int
    assignments: list[AssignmentPair]
    runtime_ms: float
    status: str
    nodes_explored: int
    upper_bound_seed: int | None = None


def greedy_assignment(cost_matrix: list[list[int]]) -> AlgorithmResult:
    start = time.perf_counter()
    size = len(cost_matrix)
    assigned_workers = [False] * size
    assigned_machines = [False] * size
    assignments: list[AssignmentPair] = []
    total_cost = 0

    for _ in range(size):
        min_cost = math.inf
        selected_worker = -1
        selected_machine = -1

        for worker_index in range(size):
            if assigned_workers[worker_index]:
                continue
            for machine_index in range(size):
                if assigned_machines[machine_index]:
                    continue
                candidate = cost_matrix[worker_index][machine_index]
                if candidate < min_cost:
                    min_cost = candidate
                    selected_worker = worker_index
                    selected_machine = machine_index

        assigned_workers[selected_worker] = True
        assigned_machines[selected_machine] = True
        assignments.append(
            AssignmentPair(
                worker_index=selected_worker,
                machine_index=selected_machine,
            )
        )
        total_cost += int(min_cost)

    runtime_ms = (time.perf_counter() - start) * 1000
    return AlgorithmResult(
        algorithm="Greedy",
        total_cost=total_cost,
        assignments=assignments,
        runtime_ms=runtime_ms,
        status="ok",
        nodes_explored=0,
        upper_bound_seed=None,
    )


def branch_and_bound_assignment(
    cost_matrix: list[list[int]],
    time_limit_seconds: float = 8.0,
    seed_with_greedy: bool = True,
) -> AlgorithmResult:
    start = time.perf_counter()
    size = len(cost_matrix)

    greedy_seed = greedy_assignment(cost_matrix) if seed_with_greedy else None
    best_cost = greedy_seed.total_cost if greedy_seed else math.inf
    best_assignments = list(greedy_seed.assignments) if greedy_seed else []
    row_order = sorted(range(size), key=lambda idx: min(cost_matrix[idx]))
    sorted_machine_choices = [
        sorted(range(size), key=lambda machine_index: cost_matrix[row_index][machine_index])
        for row_index in range(size)
    ]

    current_assignment: list[int | None] = [None] * size
    nodes_explored = 0
    timed_out = False

    def lower_bound(depth: int, used_mask: int, current_cost: int) -> int:
        estimate = current_cost
        for row_position in range(depth, size):
            row_index = row_order[row_position]
            best_local = math.inf
            for machine_index in sorted_machine_choices[row_index]:
                if not (used_mask & (1 << machine_index)):
                    best_local = cost_matrix[row_index][machine_index]
                    break
            estimate += int(best_local)
        return estimate

    def search(depth: int, used_mask: int, current_cost: int) -> None:
        nonlocal best_cost, best_assignments, nodes_explored, timed_out

        if (time.perf_counter() - start) > time_limit_seconds:
            timed_out = True
            return

        nodes_explored += 1
        if depth == size:
            if current_cost < best_cost:
                best_cost = current_cost
                best_assignments = [
                    AssignmentPair(worker_index=row_index, machine_index=int(current_assignment[row_index]))
                    for row_index in range(size)
                ]
            return

        if lower_bound(depth, used_mask, current_cost) >= best_cost:
            return

        row_index = row_order[depth]
        for machine_index in sorted_machine_choices[row_index]:
            if used_mask & (1 << machine_index):
                continue

            new_cost = current_cost + cost_matrix[row_index][machine_index]
            if new_cost >= best_cost:
                continue

            current_assignment[row_index] = machine_index
            search(depth + 1, used_mask | (1 << machine_index), new_cost)
            current_assignment[row_index] = None

            if timed_out:
                return

    search(depth=0, used_mask=0, current_cost=0)

    runtime_ms = (time.perf_counter() - start) * 1000
    status = "timeout" if timed_out else "ok"

    return AlgorithmResult(
        algorithm="Branch and Bound",
        total_cost=int(best_cost),
        assignments=sorted(best_assignments, key=lambda pair: pair.worker_index),
        runtime_ms=runtime_ms,
        status=status,
        nodes_explored=nodes_explored,
        upper_bound_seed=greedy_seed.total_cost if greedy_seed else None,
    )