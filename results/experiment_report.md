# Experiment Report

Dataset: `D:\SEMESTER 4\strategi\UAS\source code\data\Dataset_uas.xlsx`
Time limit per Branch and Bound scenario: `10.0` seconds

## Key Findings

- Greedy adalah algoritma tercepat pada seluruh skenario.
- Optimality gap terbesar muncul pada `Varian 10x10 - Random` dengan selisih biaya `75`.
- Skenario Branch and Bound paling lambat adalah `Varian 12x12 - Skewed` dengan waktu `10000.005 ms`.

## Timeout Scenarios

- `Varian 12x12 - Skewed` berhenti karena batas waktu.

## Summary Table

| sheet_name | scenario_name | matrix_size | greedy_cost | greedy_runtime_ms | branch_and_bound_cost | branch_and_bound_runtime_ms | optimality_gap | branch_and_bound_nodes | branch_and_bound_status | upper_bound_seed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Varian 3x3 | Random | 3 | 46 | 0.0172 | 46 | 0.0289 | 0 | 1 | ok | 46 |
| Varian 3x3 | Structured | 3 | 6 | 0.0052 | 6 | 0.0173 | 0 | 1 | ok | 6 |
| Varian 3x3 | Greedy Trap | 3 | 17 | 0.0049 | 13 | 0.0259 | 4 | 8 | ok | 17 |
| Varian 5x5 | Random | 5 | 118 | 0.0104 | 96 | 0.0545 | 22 | 25 | ok | 118 |
| Varian 5x5 | Structured | 5 | 15 | 0.0095 | 15 | 0.0191 | 0 | 1 | ok | 15 |
| Varian 5x5 | Skewed | 5 | 349 | 0.0094 | 346 | 0.139 | 3 | 116 | ok | 349 |
| Varian 7x7 | Random | 7 | 148 | 0.0174 | 148 | 0.1365 | 0 | 85 | ok | 148 |
| Varian 7x7 | Sructured | 7 | 28 | 0.0174 | 28 | 0.0294 | 0 | 1 | ok | 28 |
| Varian 7x7 | Skewed | 7 | 527 | 0.0172 | 523 | 2.8871 | 4 | 2727 | ok | 527 |
| Varian 10x10 | Random | 10 | 248 | 0.0354 | 173 | 7.8318 | 75 | 5784 | ok | 248 |
| Varian 10x10 | Structured | 10 | 55 | 0.0358 | 55 | 0.056 | 0 | 1 | ok | 55 |
| Varian 10x10 | Skewed | 10 | 768 | 0.0341 | 767 | 1684.4742 | 1 | 1221241 | ok | 768 |
| Varian 12x12 | Random | 12 | 261 | 0.0689 | 214 | 78.1338 | 47 | 48936 | ok | 261 |
| Varian 12x12 | Structured | 12 | 78 | 0.0559 | 78 | 0.082 | 0 | 1 | ok | 78 |
| Varian 12x12 | Skewed | 12 | 849 | 0.0611 | 848 | 10000.0052 | 1 | 7274028 | timeout | 849 |
