const state = {
  dashboard: null,
  scenario: null,
  selectedAlgorithm: "greedy",
  selectedCell: null,
  greedyStepIndex: 0,
  branchStepIndex: 0,
  chartsVisible: false,
  autoplay: {
    greedy: null,
    branch: null,
  },
};

const scenarioSelect = document.getElementById("scenarioSelect");
const timeLimitInput = document.getElementById("timeLimitInput");
const reloadButton = document.getElementById("reloadButton");
const scenarioTitle = document.getElementById("scenarioTitle");
const scenarioMeta = document.getElementById("scenarioMeta");
const gapPill = document.getElementById("gapPill");
const resultSummary = document.getElementById("resultSummary");
const matrixContainer = document.getElementById("matrixContainer");
const cellDetail = document.getElementById("cellDetail");
const comparisonGrid = document.getElementById("comparisonGrid");
const greedyTimeline = document.getElementById("greedyTimeline");
const branchFocus = document.getElementById("branchFocus");
const branchTimeline = document.getElementById("branchTimeline");
const chartsGrid = document.getElementById("chartsGrid");
const chartsPanel = document.getElementById("chartsPanel");
const toggleChartsButton = document.getElementById("toggleChartsButton");
const switchButtons = Array.from(document.querySelectorAll(".switch-button"));
const greedyPrevButton = document.getElementById("greedyPrevButton");
const greedyNextButton = document.getElementById("greedyNextButton");
const greedyPlayButton = document.getElementById("greedyPlayButton");
const greedyStepLabel = document.getElementById("greedyStepLabel");
const branchPrevButton = document.getElementById("branchPrevButton");
const branchNextButton = document.getElementById("branchNextButton");
const branchPlayButton = document.getElementById("branchPlayButton");
const branchStepLabel = document.getElementById("branchStepLabel");

const loadingTargets = [
  matrixContainer,
  comparisonGrid,
  greedyTimeline,
  branchFocus,
  branchTimeline,
  chartsGrid,
];

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

function getTimeLimit() {
  const parsed = Number.parseFloat(timeLimitInput.value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 8;
}

function buildQuery() {
  return `?time_limit=${encodeURIComponent(String(getTimeLimit()))}`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(value);
}

function formatMs(value) {
  return `${formatNumber(value)} ms`;
}

function isAutoplayRunning(kind) {
  return Boolean(state.autoplay[kind]);
}

function updatePlayButtons() {
  greedyPlayButton.textContent = isAutoplayRunning("greedy") ? "Pause" : "Play";
  branchPlayButton.textContent = isAutoplayRunning("branch") ? "Pause" : "Play";
}

function setLoading(isLoading) {
  loadingTargets.forEach((element) => element?.classList.toggle("loading-block", isLoading));
  reloadButton.disabled = isLoading;
  reloadButton.textContent = isLoading ? "Memuat..." : "Terapkan";
}

function stopAutoplay(kind) {
  if (state.autoplay[kind]) {
    clearInterval(state.autoplay[kind]);
    state.autoplay[kind] = null;
    updatePlayButtons();
  }
}

function stopAllAutoplay() {
  stopAutoplay("greedy");
  stopAutoplay("branch");
}

function updateChartsVisibility() {
  chartsPanel.classList.toggle("is-hidden", !state.chartsVisible);
  toggleChartsButton.textContent = state.chartsVisible ? "Sembunyikan Grafik" : "Tampilkan Grafik";
}

function getSelectedAssignments() {
  if (!state.scenario) return [];
  return state.scenario[state.selectedAlgorithm].assignments;
}

function renderScenarioOptions() {
  const scenarios = state.dashboard?.scenarios ?? [];
  scenarioSelect.innerHTML = scenarios
    .map(
      (scenario) => `
        <option value="${scenario.id}">
          ${scenario.title} (${scenario.size}x${scenario.size})
        </option>
      `
    )
    .join("");
}

function updateCellDetailFromSelection() {
  if (!state.scenario) {
    cellDetail.textContent = "Klik salah satu sel matriks untuk melihat rincian pasangan pekerja, mesin, dan biaya.";
    return;
  }

  if (!state.selectedCell) {
    const firstSelection = getSelectedAssignments()[0];
    if (firstSelection) {
      state.selectedCell = {
        workerIndex: firstSelection.worker_index,
        machineIndex: firstSelection.machine_index,
      };
    }
  }

  if (!state.selectedCell) {
    cellDetail.textContent = "Klik salah satu sel matriks untuk melihat rincian pasangan pekerja, mesin, dan biaya.";
    return;
  }

  const { workerIndex, machineIndex } = state.selectedCell;
  const worker = state.scenario.workers[workerIndex];
  const machine = state.scenario.machines[machineIndex];
  const cost = state.scenario.cost_matrix[workerIndex][machineIndex];
  const isGreedy = state.scenario.greedy.assignments.some(
    (item) => item.worker_index === workerIndex && item.machine_index === machineIndex
  );
  const isBranch = state.scenario.branch_and_bound.assignments.some(
    (item) => item.worker_index === workerIndex && item.machine_index === machineIndex
  );

  const badges = [];
  if (isGreedy) badges.push("termasuk dalam solusi Greedy");
  if (isBranch) badges.push("termasuk dalam solusi Branch and Bound");
  if (badges.length === 0) badges.push("tidak termasuk dalam solusi akhir");

  cellDetail.innerHTML = `
    <strong>${worker} -> ${machine}</strong><br />
    Biaya: <b>${cost}</b><br />
    Status penugasan: ${badges.join(", ")}
  `;
}

function renderMatrix() {
  if (!state.scenario) {
    matrixContainer.innerHTML = `<div class="empty-state">Hasil akan tampil setelah tombol Terapkan ditekan.</div>`;
    return;
  }

  const selectedAssignments = new Set(
    getSelectedAssignments().map((item) => `${item.worker_index}-${item.machine_index}`)
  );

  const header = state.scenario.machines.map((machine) => `<th>${machine}</th>`).join("");
  const rows = state.scenario.workers
    .map((worker, workerIndex) => {
      const cells = state.scenario.cost_matrix[workerIndex]
        .map((cost, machineIndex) => {
          const key = `${workerIndex}-${machineIndex}`;
          const classes = ["cell-clickable"];
          if (selectedAssignments.has(key)) {
            classes.push(state.selectedAlgorithm === "greedy" ? "cell-greedy" : "cell-bnb");
          }
          if (
            state.selectedCell &&
            state.selectedCell.workerIndex === workerIndex &&
            state.selectedCell.machineIndex === machineIndex
          ) {
            classes.push("cell-selected");
          }
          return `<td class="${classes.join(" ")}" data-worker-index="${workerIndex}" data-machine-index="${machineIndex}">${cost}</td>`;
        })
        .join("");
      return `<tr><th>${worker}</th>${cells}</tr>`;
    })
    .join("");

  matrixContainer.innerHTML = `
    <table class="matrix">
      <thead><tr><th>Pekerja \\ Mesin</th>${header}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  matrixContainer.querySelectorAll("td[data-worker-index]").forEach((cell) => {
    cell.addEventListener("click", () => {
      state.selectedCell = {
        workerIndex: Number(cell.dataset.workerIndex),
        machineIndex: Number(cell.dataset.machineIndex),
      };
      renderMatrix();
      updateCellDetailFromSelection();
    });
  });

  updateCellDetailFromSelection();
}

function renderComparison() {
  if (!state.scenario) {
    comparisonGrid.innerHTML = "";
    gapPill.textContent = "Gap: -";
    scenarioTitle.textContent = "Belum ditampilkan";
    scenarioMeta.textContent = "";
    resultSummary.innerHTML = 'Tekan <b>Terapkan</b> untuk melihat algoritma yang lebih optimal.';
    return;
  }

  gapPill.textContent = `Gap: ${state.scenario.optimality_gap}`;
  scenarioTitle.textContent = state.scenario.title;
  scenarioMeta.textContent = `${state.scenario.size} x ${state.scenario.size}`;

  let summaryLabel = "Kedua algoritma memberi hasil yang sama.";
  let summaryClass = "result-badge result-neutral";
  if (state.scenario.greedy.total_cost < state.scenario.branch_and_bound.total_cost) {
    summaryLabel = "Greedy memberi solusi lebih optimal pada skenario ini.";
    summaryClass = "result-badge result-greedy";
  } else if (state.scenario.branch_and_bound.total_cost < state.scenario.greedy.total_cost) {
    summaryLabel = "Branch and Bound memberi solusi lebih optimal pada skenario ini.";
    summaryClass = "result-badge result-bnb";
  }
  resultSummary.innerHTML = `<span class="${summaryClass}">${summaryLabel}</span>`;

  const algorithms = [
    {
      title: "Greedy",
      data: state.scenario.greedy,
      note: "Memilih biaya minimum yang masih valid pada setiap langkah keputusan.",
      better:
        state.scenario.greedy.total_cost < state.scenario.branch_and_bound.total_cost
          ? '<span class="mini-badge mini-greedy">Lebih optimal</span>'
          : state.scenario.greedy.total_cost === state.scenario.branch_and_bound.total_cost
            ? '<span class="mini-badge mini-neutral">Setara</span>'
            : "",
    },
    {
      title: "Branch and Bound",
      data: state.scenario.branch_and_bound,
      note: "Mengevaluasi ruang solusi dan memangkas cabang yang tidak lagi menjanjikan.",
      better:
        state.scenario.branch_and_bound.total_cost < state.scenario.greedy.total_cost
          ? '<span class="mini-badge mini-bnb">Lebih optimal</span>'
          : state.scenario.greedy.total_cost === state.scenario.branch_and_bound.total_cost
            ? '<span class="mini-badge mini-neutral">Setara</span>'
            : "",
    },
  ];

  comparisonGrid.innerHTML = algorithms
    .map(
      ({ title, data, note, better }) => `
        <article class="comparison-card">
          <div class="comparison-head">
            <h3>${title}</h3>
            ${better}
          </div>
          <p class="comparison-text">${note}</p>
          <div class="metric-row"><span>Total biaya</span><span>${formatNumber(data.total_cost)}</span></div>
          <div class="metric-row"><span>Runtime</span><span>${formatMs(data.runtime_ms)}</span></div>
          <div class="metric-row"><span>Status</span><span>${data.status}</span></div>
          <div class="metric-row"><span>Node dieksplor</span><span>${formatNumber(data.nodes_explored)}</span></div>
        </article>
      `
    )
    .join("");
}

function renderGreedyTimeline() {
  const steps = state.scenario?.greedy_trace ?? [];
  if (steps.length === 0) {
    greedyTimeline.innerHTML = `<div class="empty-state">Simulasi muncul setelah hasil diterapkan.</div>`;
    greedyStepLabel.textContent = "Langkah -";
    greedyPrevButton.disabled = true;
    greedyNextButton.disabled = true;
    return;
  }

  state.greedyStepIndex = Math.max(0, Math.min(state.greedyStepIndex, steps.length - 1));
  const step = steps[state.greedyStepIndex];
  greedyStepLabel.textContent = `Langkah ${step.step} / ${steps.length}`;
  greedyPrevButton.disabled = state.greedyStepIndex === 0;
  greedyNextButton.disabled = state.greedyStepIndex === steps.length - 1;

  greedyTimeline.innerHTML = `
    <article class="timeline-item">
      <strong>Langkah ${step.step}</strong>
      <p class="timeline-copy">
        Greedy memilih <b>${step.selected.worker}</b> ke <b>${step.selected.machine}</b>
        dengan biaya <b>${step.selected.cost}</b>.
      </p>
    </article>
  `;
}

function renderBranchFocus() {
  if (!state.scenario) {
    branchFocus.innerHTML = `<div class="empty-state">Ringkasan Branch and Bound muncul setelah hasil diterapkan.</div>`;
    branchTimeline.innerHTML = `<div class="empty-state">Simulasi muncul setelah hasil diterapkan.</div>`;
    branchStepLabel.textContent = "Langkah -";
    branchPrevButton.disabled = true;
    branchNextButton.disabled = true;
    return;
  }

  const focus = state.scenario.branch_and_bound_focus;
  branchFocus.innerHTML = `
    <article class="focus-item">
      <strong>Ringkasan Branch and Bound</strong>
      <p class="focus-copy">
        Status: <b>${focus.status}</b>, node dieksplorasi:
        <b>${formatNumber(focus.nodes_explored)}</b>, upper bound awal:
        <b>${focus.upper_bound_seed}</b>.
      </p>
    </article>
  `;

  const steps = state.scenario.branch_and_bound_trace ?? [];
  if (steps.length === 0) {
    branchTimeline.innerHTML = `<div class="empty-state">Belum ada jejak Branch and Bound.</div>`;
    branchStepLabel.textContent = "Langkah -";
    branchPrevButton.disabled = true;
    branchNextButton.disabled = true;
    return;
  }

  state.branchStepIndex = Math.max(0, Math.min(state.branchStepIndex, steps.length - 1));
  const step = steps[state.branchStepIndex];
  branchStepLabel.textContent = `Langkah ${step.step} / ${steps.length}`;
  branchPrevButton.disabled = state.branchStepIndex === 0;
  branchNextButton.disabled = state.branchStepIndex === steps.length - 1;

  branchTimeline.innerHTML = `
    <article class="timeline-item">
      <strong>${step.title}</strong>
      <p class="timeline-copy">${step.detail}</p>
    </article>
  `;
}

function renderCharts() {
  if (!state.dashboard) {
    chartsGrid.innerHTML = `<div class="empty-state">Grafik akan tampil setelah tombol Tampilkan Grafik ditekan.</div>`;
    return;
  }

  const items = [
    ["Runtime Comparison", state.dashboard.chart_paths.runtime],
    ["Cost Comparison", state.dashboard.chart_paths.cost],
    ["Optimality Gap", state.dashboard.chart_paths.gap],
  ];

  chartsGrid.innerHTML = items
    .map(
      ([title, path]) => `
        <article class="chart-card">
          <h3>${title}</h3>
          <img src="${path}" alt="${title}" />
        </article>
      `
    )
    .join("");
}

function updateAlgorithmButtons() {
  switchButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.algorithm === state.selectedAlgorithm);
  });
}

function resetScenarioDerivedState() {
  stopAllAutoplay();
  state.selectedCell = null;
  state.greedyStepIndex = 0;
  state.branchStepIndex = 0;
}

function toggleAutoplay(kind) {
  const steps =
    kind === "greedy" ? state.scenario?.greedy_trace ?? [] : state.scenario?.branch_and_bound_trace ?? [];
  const indexKey = kind === "greedy" ? "greedyStepIndex" : "branchStepIndex";
  const renderFn = kind === "greedy" ? renderGreedyTimeline : renderBranchFocus;

  if (steps.length <= 1) return;

  if (isAutoplayRunning(kind)) {
    stopAutoplay(kind);
    return;
  }

  stopAutoplay(kind === "greedy" ? "branch" : "greedy");
  state.autoplay[kind] = setInterval(() => {
    if (state[indexKey] >= steps.length - 1) {
      stopAutoplay(kind);
      return;
    }
    state[indexKey] += 1;
    renderFn();
  }, 1800);
  updatePlayButtons();
}

async function loadDashboard(renderResults = true) {
  const currentSelection = scenarioSelect.value;
  state.dashboard = await fetchJson(`/api/dashboard${buildQuery()}`);
  renderScenarioOptions();
  if (
    currentSelection &&
    state.dashboard?.scenarios?.some((item) => String(item.id) === currentSelection)
  ) {
    scenarioSelect.value = currentSelection;
  }
  if (renderResults) renderCharts();
}

async function loadScenario(scenarioId) {
  state.scenario = await fetchJson(`/api/scenarios/${scenarioId}${buildQuery()}`);
  resetScenarioDerivedState();
  renderMatrix();
  renderComparison();
  renderGreedyTimeline();
  renderBranchFocus();
}

switchButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.selectedAlgorithm = button.dataset.algorithm;
    updateAlgorithmButtons();
    renderMatrix();
  });
});

greedyPrevButton.addEventListener("click", () => {
  stopAutoplay("greedy");
  state.greedyStepIndex -= 1;
  renderGreedyTimeline();
});

greedyNextButton.addEventListener("click", () => {
  stopAutoplay("greedy");
  state.greedyStepIndex += 1;
  renderGreedyTimeline();
});

branchPrevButton.addEventListener("click", () => {
  stopAutoplay("branch");
  state.branchStepIndex -= 1;
  renderBranchFocus();
});

branchNextButton.addEventListener("click", () => {
  stopAutoplay("branch");
  state.branchStepIndex += 1;
  renderBranchFocus();
});

greedyPlayButton.addEventListener("click", () => toggleAutoplay("greedy"));
branchPlayButton.addEventListener("click", () => toggleAutoplay("branch"));

reloadButton.addEventListener("click", async () => {
  const selectedScenarioId =
    scenarioSelect.value || String(state.dashboard?.scenarios?.[0]?.id ?? "");

  setLoading(true);
  try {
    await loadDashboard(true);
    if (selectedScenarioId) {
      scenarioSelect.value = selectedScenarioId;
      await loadScenario(selectedScenarioId);
    }
  } finally {
    setLoading(false);
  }
});

toggleChartsButton.addEventListener("click", () => {
  state.chartsVisible = !state.chartsVisible;
  updateChartsVisibility();
});

updateAlgorithmButtons();
updatePlayButtons();
updateChartsVisibility();
renderMatrix();
renderComparison();
renderGreedyTimeline();
renderBranchFocus();
renderCharts();

loadDashboard(false)
  .then(() => {
    const firstScenario = state.dashboard?.scenarios?.[0];
    if (firstScenario) scenarioSelect.value = String(firstScenario.id);
  })
  .catch((error) => {
    matrixContainer.innerHTML = `<div class="empty-state">Gagal memuat dashboard: ${error.message}</div>`;
  });
