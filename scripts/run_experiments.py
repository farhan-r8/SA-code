from __future__ import annotations

import argparse
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = PROJECT_ROOT / "src"

if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from assignment_solver.experiment import run_full_experiment
from assignment_solver.reporting import export_results_bundle


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Run Greedy vs Branch and Bound experiments for assignment problem datasets."
    )
    parser.add_argument(
        "--dataset",
        required=True,
        help="Absolute path to the Excel dataset file.",
    )
    parser.add_argument(
        "--output-dir",
        default=str(PROJECT_ROOT / "results"),
        help="Directory where CSV, markdown, and charts will be saved.",
    )
    parser.add_argument(
        "--time-limit",
        type=float,
        default=8.0,
        help="Time limit in seconds for Branch and Bound per scenario.",
    )
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    dataset_path = Path(args.dataset).expanduser().resolve()
    output_dir = Path(args.output_dir).expanduser().resolve()

    bundle = run_full_experiment(dataset_path=dataset_path, time_limit_seconds=args.time_limit)
    export_results_bundle(bundle=bundle, output_dir=output_dir)

    print("Experiment finished successfully.")
    print(f"Dataset : {dataset_path}")
    print(f"Output  : {output_dir}")
    print("Generated files:")
    for generated in bundle.generated_files(output_dir):
        print(f" - {generated}")


if __name__ == "__main__":
    main()