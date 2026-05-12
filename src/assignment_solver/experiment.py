from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from .algorithms import AlgorithmResult, branch_and_bound_assignment, greedy_assignment
from .dataset import Scenario, load_scenarios


@dataclass(frozen=True)
class ScenarioExperimentResult:
    scenario: Scenario
    greedy: AlgorithmResult
    branch_and_bound: AlgorithmResult

    @property
    def optimality_gap(self) -> int:
        return self.greedy.total_cost - self.branch_and_bound.total_cost


@dataclass(frozen=True)
class ExperimentBundle:
    dataset_path: Path
    time_limit_seconds: float
    scenario_results: list[ScenarioExperimentResult]

    def generated_files(self, output_dir: Path) -> list[Path]:
        charts_dir = output_dir / "charts"
        return [
            output_dir / "experiment_results.csv",
            output_dir / "assignment_details.csv",
            output_dir / "summary_by_size.csv",
            output_dir / "summary_by_scenario.csv",
            output_dir / "experiment_report.md",
            charts_dir / "runtime_comparison.svg",
            charts_dir / "cost_comparison.svg",
            charts_dir / "optimality_gap.svg",
            charts_dir / "nodes_explored.svg",
        ]


def run_full_experiment(dataset_path: Path, time_limit_seconds: float) -> ExperimentBundle:
    scenarios = load_scenarios(dataset_path)
    scenario_results: list[ScenarioExperimentResult] = []

    for scenario in scenarios:
        greedy_result = greedy_assignment(scenario.cost_matrix)
        branch_and_bound_result = branch_and_bound_assignment(
            scenario.cost_matrix,
            time_limit_seconds=time_limit_seconds,
            seed_with_greedy=True,
        )
        scenario_results.append(
            ScenarioExperimentResult(
                scenario=scenario,
                greedy=greedy_result,
                branch_and_bound=branch_and_bound_result,
            )
        )

    return ExperimentBundle(
        dataset_path=dataset_path,
        time_limit_seconds=time_limit_seconds,
        scenario_results=scenario_results,
    )