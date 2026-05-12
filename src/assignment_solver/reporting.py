from __future__ import annotations

from pathlib import Path
from xml.sax.saxutils import escape

import pandas as pd

from .experiment import ExperimentBundle, ScenarioExperimentResult


def _scenario_rows(bundle: ExperimentBundle) -> list[dict]:
    rows: list[dict] = []
    for result in bundle.scenario_results:
        rows.append(
            {
                "sheet_name": result.scenario.sheet_name,
                "scenario_name": result.scenario.scenario_name,
                "matrix_size": result.scenario.size,
                "greedy_cost": result.greedy.total_cost,
                "greedy_runtime_ms": round(result.greedy.runtime_ms, 6),
                "branch_and_bound_cost": result.branch_and_bound.total_cost,
                "branch_and_bound_runtime_ms": round(result.branch_and_bound.runtime_ms, 6),
                "optimality_gap": result.optimality_gap,
                "branch_and_bound_nodes": result.branch_and_bound.nodes_explored,
                "branch_and_bound_status": result.branch_and_bound.status,
                "upper_bound_seed": result.branch_and_bound.upper_bound_seed,
            }
        )
    return rows


def _assignment_rows(bundle: ExperimentBundle) -> list[dict]:
    rows: list[dict] = []
    for result in bundle.scenario_results:
        rows.extend(_algorithm_assignment_rows(result, "Greedy"))
        rows.extend(_algorithm_assignment_rows(result, "Branch and Bound"))
    return rows


def _algorithm_assignment_rows(
    result: ScenarioExperimentResult, algorithm_name: str
) -> list[dict]:
    algorithm_result = result.greedy if algorithm_name == "Greedy" else result.branch_and_bound
    rows: list[dict] = []
    for pair in algorithm_result.assignments:
        worker_label = result.scenario.workers[pair.worker_index]
        machine_label = result.scenario.machines[pair.machine_index]
        cost_value = result.scenario.cost_matrix[pair.worker_index][pair.machine_index]
        rows.append(
            {
                "sheet_name": result.scenario.sheet_name,
                "scenario_name": result.scenario.scenario_name,
                "algorithm": algorithm_name,
                "worker": worker_label,
                "machine": machine_label,
                "cost": cost_value,
            }
        )
    return rows


def _write_markdown_report(bundle: ExperimentBundle, results_df: pd.DataFrame, output_path: Path) -> None:
    best_gap_row = results_df.loc[results_df["optimality_gap"].idxmax()]
    slowest_row = results_df.loc[results_df["branch_and_bound_runtime_ms"].idxmax()]
    timeout_rows = results_df[results_df["branch_and_bound_status"] == "timeout"]

    report_lines = [
        "# Experiment Report",
        "",
        f"Dataset: `{bundle.dataset_path}`",
        f"Time limit per Branch and Bound scenario: `{bundle.time_limit_seconds}` seconds",
        "",
        "## Key Findings",
        "",
        f"- Greedy adalah algoritma tercepat pada seluruh skenario.",
        (
            f"- Optimality gap terbesar muncul pada `{best_gap_row['sheet_name']} - "
            f"{best_gap_row['scenario_name']}` dengan selisih biaya "
            f"`{int(best_gap_row['optimality_gap'])}`."
        ),
        (
            f"- Skenario Branch and Bound paling lambat adalah `{slowest_row['sheet_name']} - "
            f"{slowest_row['scenario_name']}` dengan waktu "
            f"`{slowest_row['branch_and_bound_runtime_ms']:.3f} ms`."
        ),
    ]

    if not timeout_rows.empty:
        report_lines.extend(
            [
                "",
                "## Timeout Scenarios",
                "",
            ]
        )
        for _, row in timeout_rows.iterrows():
            report_lines.append(
                f"- `{row['sheet_name']} - {row['scenario_name']}` berhenti karena batas waktu."
            )

    report_lines.extend(
        [
            "",
            "## Summary Table",
            "",
            _dataframe_to_markdown(results_df),
            "",
        ]
    )

    output_path.write_text("\n".join(report_lines), encoding="utf-8")


def _dataframe_to_markdown(dataframe: pd.DataFrame) -> str:
    columns = list(dataframe.columns)
    lines = [
        "| " + " | ".join(columns) + " |",
        "| " + " | ".join(["---"] * len(columns)) + " |",
    ]
    for _, row in dataframe.iterrows():
        values = [str(row[column]) for column in columns]
        lines.append("| " + " | ".join(values) + " |")
    return "\n".join(lines)


def _format_label(row: pd.Series) -> str:
    return f"{row['sheet_name']} / {row['scenario_name']}"


def _svg_bar_chart(
    labels: list[str],
    series: list[tuple[str, list[float], str]],
    title: str,
    y_axis_label: str,
    output_path: Path,
) -> None:
    width = 1400
    height = 800
    margin_left = 90
    margin_right = 40
    margin_top = 70
    margin_bottom = 240
    plot_width = width - margin_left - margin_right
    plot_height = height - margin_top - margin_bottom
    max_value = max(max(values) for _, values, _ in series) if series else 1.0
    max_value = max(max_value, 1.0)
    group_count = len(labels)
    series_count = len(series)
    group_width = plot_width / max(group_count, 1)
    bar_width = max((group_width * 0.7) / max(series_count, 1), 6.0)

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        '<rect width="100%" height="100%" fill="white"/>',
        f'<text x="{width / 2}" y="36" text-anchor="middle" font-size="24" font-family="Arial" fill="#222">{escape(title)}</text>',
        f'<text x="22" y="{margin_top + (plot_height / 2)}" transform="rotate(-90 22,{margin_top + (plot_height / 2)})" '
        f'text-anchor="middle" font-size="16" font-family="Arial" fill="#444">{escape(y_axis_label)}</text>',
    ]

    for tick_index in range(6):
        ratio = tick_index / 5
        y = margin_top + plot_height - (ratio * plot_height)
        tick_value = max_value * ratio
        parts.append(f'<line x1="{margin_left}" y1="{y}" x2="{width - margin_right}" y2="{y}" stroke="#dddddd" stroke-width="1"/>')
        parts.append(
            f'<text x="{margin_left - 10}" y="{y + 5}" text-anchor="end" font-size="12" font-family="Arial" fill="#555">'
            f"{tick_value:.1f}</text>"
        )

    parts.append(f'<line x1="{margin_left}" y1="{margin_top}" x2="{margin_left}" y2="{margin_top + plot_height}" stroke="#333" stroke-width="1.5"/>')
    parts.append(
        f'<line x1="{margin_left}" y1="{margin_top + plot_height}" x2="{width - margin_right}" y2="{margin_top + plot_height}" stroke="#333" stroke-width="1.5"/>'
    )

    for group_index, label in enumerate(labels):
        group_start = margin_left + group_index * group_width + (group_width * 0.15)
        for series_index, (_, values, color) in enumerate(series):
            value = values[group_index]
            bar_height = 0 if max_value == 0 else (value / max_value) * plot_height
            x = group_start + series_index * bar_width
            y = margin_top + plot_height - bar_height
            parts.append(
                f'<rect x="{x:.2f}" y="{y:.2f}" width="{bar_width:.2f}" height="{bar_height:.2f}" fill="{color}"/>'
            )
        label_x = margin_left + group_index * group_width + (group_width / 2)
        safe_label = escape(label)
        parts.append(
            f'<text x="{label_x:.2f}" y="{margin_top + plot_height + 20}" transform="rotate(45 {label_x:.2f},{margin_top + plot_height + 20})" '
            f'text-anchor="start" font-size="11" font-family="Arial" fill="#333">{safe_label}</text>'
        )

    legend_x = width - margin_right - 220
    legend_y = margin_top + 10
    for legend_index, (name, _, color) in enumerate(series):
        y = legend_y + legend_index * 24
        parts.append(f'<rect x="{legend_x}" y="{y - 12}" width="16" height="16" fill="{color}"/>')
        parts.append(
            f'<text x="{legend_x + 24}" y="{y}" font-size="13" font-family="Arial" fill="#333">{escape(name)}</text>'
        )

    parts.append("</svg>")
    output_path.write_text("\n".join(parts), encoding="utf-8")


def _save_chart(dataframe: pd.DataFrame, output_path: Path, kind: str) -> None:
    labels = [_format_label(row) for _, row in dataframe.iterrows()]

    if kind == "runtime":
        _svg_bar_chart(
            labels=labels,
            series=[
                ("Greedy", dataframe["greedy_runtime_ms"].tolist(), "#4c72b0"),
                ("Branch and Bound", dataframe["branch_and_bound_runtime_ms"].tolist(), "#dd8452"),
            ],
            title="Runtime Comparison",
            y_axis_label="Runtime (ms)",
            output_path=output_path,
        )
    elif kind == "cost":
        _svg_bar_chart(
            labels=labels,
            series=[
                ("Greedy", dataframe["greedy_cost"].tolist(), "#4c72b0"),
                ("Branch and Bound", dataframe["branch_and_bound_cost"].tolist(), "#55a868"),
            ],
            title="Cost Comparison",
            y_axis_label="Total Cost",
            output_path=output_path,
        )
    elif kind == "gap":
        _svg_bar_chart(
            labels=labels,
            series=[("Optimality Gap", dataframe["optimality_gap"].tolist(), "#c44e52")],
            title="Optimality Gap",
            y_axis_label="Greedy Cost - Branch and Bound Cost",
            output_path=output_path,
        )
    elif kind == "nodes":
        _svg_bar_chart(
            labels=labels,
            series=[("Nodes Explored", dataframe["branch_and_bound_nodes"].tolist(), "#8172b2")],
            title="Branch and Bound Nodes Explored",
            y_axis_label="Node Count",
            output_path=output_path,
        )
    else:
        raise ValueError(f"Unknown chart kind: {kind}")


def export_results_bundle(bundle: ExperimentBundle, output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    charts_dir = output_dir / "charts"
    charts_dir.mkdir(parents=True, exist_ok=True)

    results_df = pd.DataFrame(_scenario_rows(bundle))
    details_df = pd.DataFrame(_assignment_rows(bundle))

    summary_by_size = (
        results_df.groupby("matrix_size", as_index=False)
        .agg(
            greedy_cost_mean=("greedy_cost", "mean"),
            branch_and_bound_cost_mean=("branch_and_bound_cost", "mean"),
            greedy_runtime_ms_mean=("greedy_runtime_ms", "mean"),
            branch_and_bound_runtime_ms_mean=("branch_and_bound_runtime_ms", "mean"),
            optimality_gap_mean=("optimality_gap", "mean"),
        )
        .round(3)
    )

    summary_by_scenario = (
        results_df.groupby("scenario_name", as_index=False)
        .agg(
            greedy_cost_mean=("greedy_cost", "mean"),
            branch_and_bound_cost_mean=("branch_and_bound_cost", "mean"),
            greedy_runtime_ms_mean=("greedy_runtime_ms", "mean"),
            branch_and_bound_runtime_ms_mean=("branch_and_bound_runtime_ms", "mean"),
            optimality_gap_mean=("optimality_gap", "mean"),
        )
        .round(3)
    )

    results_df.to_csv(output_dir / "experiment_results.csv", index=False)
    details_df.to_csv(output_dir / "assignment_details.csv", index=False)
    summary_by_size.to_csv(output_dir / "summary_by_size.csv", index=False)
    summary_by_scenario.to_csv(output_dir / "summary_by_scenario.csv", index=False)

    _write_markdown_report(bundle, results_df, output_dir / "experiment_report.md")
    _save_chart(results_df, charts_dir / "runtime_comparison.svg", kind="runtime")
    _save_chart(results_df, charts_dir / "cost_comparison.svg", kind="cost")
    _save_chart(results_df, charts_dir / "optimality_gap.svg", kind="gap")
    _save_chart(results_df, charts_dir / "nodes_explored.svg", kind="nodes")