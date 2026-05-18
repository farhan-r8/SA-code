const state = {
  dashboard: null,
  scenario: null,
  selectedAlgorithm: "branch_and_bound",
  matrixMode: "greedy",
  selectedCell: null,
  greedyStepIndex: 0,
  branchStepIndex: 0,
  chartsVisible: false,
  autoplay: null,
};

const scenarioSelect = document.getElementById("scenarioSelect");
const timeLimitInput = document.getElementById("timeLimitInput");
const reloadButton = document.getElementById("reloadButton");
const scenarioMeta = document.getElementById("scenarioMeta");
const matrixContainer = document.getElementById("matrixContainer");
const matrixDetail = document.getElementById("matrixDetail");
const comparisonGrid = document.getElementById("comparisonGrid");
const greedyCanvas = document.getElementById("greedyCanvas");
const greedyInsight = document.getElementById("greedyInsight");
const greedyCaption = document.getElementById("greedyCaption");
const greedyStepLabel = document.getElementById("greedyStepLabel");
const branchCanvas = document.getElementById("branchCanvas");
const branchInsight = document.getElementById("branchInsight");
const branchCaption = document.getElementById("branchCaption");
const branchStepLabel = document.getElementById("branchStepLabel");
const sharedResetButton = document.getElementById("sharedResetButton");
const sharedPrevButton = document.getElementById("sharedPrevButton");
const sharedPlayButton = document.getElementById("sharedPlayButton");
const sharedNextButton = document.getElementById("sharedNextButton");
const chartsGrid = document.getElementById("chartsGrid");
const chartsPanel = document.getElementById("chartsPanel");
const toggleChartsButton = document.getElementById("toggleChartsButton");
const matrixModeButtons = Array.from(document.querySelectorAll("[data-matrix-mode]"));

const loadingTargets = [matrixContainer, comparisonGrid, greedyCanvas, branchCanvas, chartsGrid];

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

function setLoading(isLoading) {
  loadingTargets.forEach((element) => element?.classList.toggle("loading-block", isLoading));
  reloadButton.disabled = isLoading;
  reloadButton.textContent = isLoading ? "Memuat..." : "Terapkan";
}

function updateChartsVisibility() {
  chartsPanel.classList.toggle("is-hidden", !state.chartsVisible);
  toggleChartsButton.textContent = state.chartsVisible
    ? "Sembunyikan Grafik Performa"
    : "Tampilkan Grafik Performa";
}

function stopAutoplay() {
  if (state.autoplay) {
    clearInterval(state.autoplay);
    state.autoplay = null;
  }
  sharedPlayButton.textContent = "Play";
}

function updateMatrixModeButtons() {
  matrixModeButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.matrixMode === state.matrixMode);
  });
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

function getAssignmentsForMode(mode) {
  if (!state.scenario) return [];
  return mode === "greedy"
    ? state.scenario.greedy.assignments
    : state.scenario.branch_and_bound.assignments;
}

function getSelectedSet(mode) {
  return new Set(getAssignmentsForMode(mode).map((item) => `${item.worker_index}-${item.machine_index}`));
}

function renderMatrix() {
  if (!state.scenario) {
    scenarioMeta.textContent = "-";
    matrixContainer.innerHTML = `<div class="empty-state">Pilih skenario lalu tekan Terapkan.</div>`;
    matrixDetail.textContent = "Tabel akan menandai pasangan pekerja dan tugas yang dipilih oleh algoritma.";
    return;
  }

  const selectedSet = getSelectedSet(state.matrixMode);
  const sizeClass =
    state.scenario.size >= 12 ? "matrix-large" : state.scenario.size >= 10 ? "matrix-medium" : "matrix-compact";
  scenarioMeta.textContent = `${state.scenario.workers.length}W x ${state.scenario.machines.length}T`;

  const header = state.scenario.machines.map((machine) => `<th>${machine}</th>`).join("");
  const rows = state.scenario.workers
    .map((worker, workerIndex) => {
      const cells = state.scenario.cost_matrix[workerIndex]
        .map((cost, machineIndex) => {
          const key = `${workerIndex}-${machineIndex}`;
          const classes = ["cell-clickable"];
          if (selectedSet.has(key)) {
            classes.push(state.matrixMode === "greedy" ? "cell-greedy" : "cell-bnb");
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
    <table class="matrix ${sizeClass}">
      <thead><tr><th></th>${header}</tr></thead>
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
      updateMatrixDetail();
    });
  });

  updateMatrixDetail();
}

function updateMatrixDetail() {
  if (!state.scenario) {
    matrixDetail.textContent = "Tabel akan menandai pasangan pekerja dan tugas yang dipilih oleh algoritma.";
    return;
  }

  const modeLabel = state.matrixMode === "greedy" ? "Greedy" : "Branch & Bound";
  if (!state.selectedCell) {
    matrixDetail.innerHTML = `
      <strong>Mode ${modeLabel}</strong>
      <span>Gunakan tombol lihat Greedy atau Branch &amp; Bound untuk mengganti highlight cost matrix, lalu klik sel untuk melihat detail biaya.</span>
    `;
    return;
  }

  const { workerIndex, machineIndex } = state.selectedCell;
  const worker = state.scenario.workers[workerIndex];
  const machine = state.scenario.machines[machineIndex];
  const cost = state.scenario.cost_matrix[workerIndex][machineIndex];
  const selectedSet = getSelectedSet(state.matrixMode);
  const key = `${workerIndex}-${machineIndex}`;

  matrixDetail.innerHTML = `
    <strong>${worker} -> ${machine}</strong>
    <span>Biaya: <b>${cost}</b></span>
    <span>Status pada ${modeLabel}: ${selectedSet.has(key) ? "masuk solusi akhir" : "tidak dipilih"}</span>
  `;
}

function buildResultCard(title, subtitle, data, options = {}) {
  const isBetter = options.isBetter;
  const isSelected = state.selectedAlgorithm === options.algorithmKey;
  return `
    <article class="result-card ${isBetter ? "result-card-best" : ""} ${isSelected ? "result-card-active" : ""}" data-algorithm-card="${options.algorithmKey}">
      <div class="result-card-top">
        <div>
          <h2 class="result-card-title">${title}</h2>
          <div class="result-card-subtitle">${subtitle}</div>
        </div>
        <div class="status-badge ${options.badgeClass ?? "badge-muted"}">${options.badge}</div>
      </div>
      <div class="result-metrics">
        <div class="metric-block metric-block-accent ${isBetter ? "metric-block-best" : ""}">
          <span class="metric-label">Total Cost</span>
          <strong class="metric-value ${isBetter ? "metric-value-best" : ""}">${formatNumber(data.total_cost)}</strong>
        </div>
        <div class="metric-block metric-block-accent">
          <span class="metric-label">Runtime Efficiency</span>
          <strong class="metric-runtime">${formatMs(data.runtime_ms)}</strong>
        </div>
      </div>
      <div class="result-footer-row">
        <div class="result-footer">Explored Nodes: ${formatNumber(data.nodes_explored)}</div>
        <div class="result-tail">${options.tail}</div>
      </div>
    </article>
  `;
}

function renderComparison() {
  if (!state.scenario) {
    comparisonGrid.innerHTML = `<article class="result-card"><div class="empty-state">Hasil perbandingan akan muncul setelah tombol Terapkan ditekan.</div></article>`;
    return;
  }

  const greedy = state.scenario.greedy;
  const branch = state.scenario.branch_and_bound;
  const branchBetter = branch.total_cost < greedy.total_cost;
  const greedyBetter = greedy.total_cost < branch.total_cost;
  const sameResult = greedy.total_cost === branch.total_cost;

  comparisonGrid.innerHTML = `
    ${buildResultCard("Greedy", "Heuristic Search", greedy, {
      algorithmKey: "greedy",
      isBetter: greedyBetter,
      badge: sameResult ? "Setara" : greedy.status === "ok" ? "Terminated" : greedy.status,
      badgeClass: sameResult ? "badge-neutral" : "badge-muted",
      tail: greedyBetter ? "Optimal choice" : "Fast selection",
    })}
    ${buildResultCard("Branch & Bound", "State Space Search", branch, {
      algorithmKey: "branch_and_bound",
      isBetter: branchBetter,
      badge: branchBetter ? "Lebih Optimal" : sameResult ? "Setara" : branch.status === "ok" ? "Verified" : branch.status,
      badgeClass: branchBetter ? "badge-best" : sameResult ? "badge-neutral" : "badge-primary",
      tail: branchBetter ? "Verified" : "Bounded search",
    })}
  `;

  comparisonGrid.querySelectorAll("[data-algorithm-card]").forEach((card) => {
    card.addEventListener("click", () => {
      state.selectedAlgorithm = card.dataset.algorithmCard;
      state.matrixMode = card.dataset.algorithmCard;
      updateMatrixModeButtons();
      renderComparison();
      renderMatrix();
    });
  });
}

function renderGreedyVisual() {
  const steps = state.scenario?.greedy_trace ?? [];
  if (steps.length === 0) {
    greedyStepLabel.textContent = "Langkah -";
    greedyCanvas.innerHTML = `<div class="empty-state">Visual greedy akan tampil setelah hasil diterapkan.</div>`;
    greedyInsight.innerHTML = "";
    greedyCaption.textContent = "";
    return;
  }

  state.greedyStepIndex = Math.max(0, Math.min(state.greedyStepIndex, steps.length - 1));
  const currentStep = steps[state.greedyStepIndex];
  const sequence = steps
    .slice(0, Math.min(steps.length, state.greedyStepIndex + 3))
    .map((step, index) => {
      const isCurrent = step.step === currentStep.step;
      const isPast = step.step < currentStep.step;
      const cls = isCurrent ? "sequence-card-current" : isPast ? "sequence-card-past" : "sequence-card-future";
      return `
        <div class="sequence-card ${cls}">
          <div class="sequence-card-title">${step.selected.worker} -> ${step.selected.machine}</div>
          <div class="sequence-card-meta">c:${step.selected.cost}</div>
        </div>
        ${index < Math.min(steps.length, state.greedyStepIndex + 3) - 1 ? '<div class="sequence-link"></div>' : ""}
      `;
    })
    .join("");

  greedyStepLabel.textContent = `${currentStep.step}/${steps.length}`;
  greedyCanvas.innerHTML = `
    <div class="sequence-flow">
      <div class="sequence-root">idx:0</div>
      <div class="sequence-link sequence-link-root"></div>
      ${sequence}
    </div>
  `;
  greedyInsight.innerHTML = `
    <div class="insight-chip insight-primary">Local minimum</div>
    <div class="insight-chip">${currentStep.selected.worker}</div>
    <div class="insight-chip">${currentStep.selected.machine}</div>
    <div class="insight-chip">Cost ${currentStep.selected.cost}</div>
  `;
  greedyCaption.innerHTML = `
    <strong>${currentStep.selected.worker} -> ${currentStep.selected.machine}</strong>
    <span>Greedy memilih biaya minimum yang masih valid pada langkah ini.</span>
  `;
}

function renderBranchVisual() {
  const steps = state.scenario?.branch_and_bound_trace ?? [];
  if (steps.length === 0) {
    branchStepLabel.textContent = "Langkah -";
    branchCanvas.innerHTML = `<div class="empty-state">Visual Branch and Bound akan tampil setelah hasil diterapkan.</div>`;
    branchInsight.innerHTML = "";
    branchCaption.textContent = "";
    return;
  }

  state.branchStepIndex = Math.max(0, Math.min(state.branchStepIndex, steps.length - 1));
  const currentStep = steps[state.branchStepIndex];
  const visibleSteps = steps.slice(0, Math.min(steps.length, state.branchStepIndex + 3));

  const sequence = visibleSteps
    .map((step, index) => {
      const isCurrent = step.step === currentStep.step;
      const kindClass =
        step.kind === "prune" || step.kind === "cutoff"
          ? "sequence-card-pruned"
          : isCurrent
            ? "sequence-card-current"
            : step.step < currentStep.step
              ? "sequence-card-past"
              : "sequence-card-future";
      const meta =
        step.new_cost !== undefined
          ? `lb:${step.new_cost}`
          : step.bound !== undefined
            ? `b:${step.bound}`
            : `c:${step.current_cost ?? 0}`;
      return `
        <div class="sequence-card ${kindClass}">
          <div class="sequence-card-title">${step.title}</div>
          <div class="sequence-card-meta">${meta}</div>
        </div>
        ${index < visibleSteps.length - 1 ? '<div class="sequence-link"></div>' : ""}
      `;
    })
    .join("");

  const summary = state.scenario.branch_and_bound_trace_summary;
  const activeLabel =
    currentStep.kind === "prune" || currentStep.kind === "cutoff" ? "Cabang dipangkas" : "Cabang aktif";

  branchStepLabel.textContent = `${currentStep.step}/${steps.length}`;
  branchCanvas.innerHTML = `
    <div class="sequence-flow">
      <div class="sequence-root">idx:0</div>
      <div class="sequence-link sequence-link-root"></div>
      ${sequence}
    </div>
  `;
  branchInsight.innerHTML = `
    <div class="insight-chip insight-primary">${activeLabel}</div>
    <div class="insight-chip">Nodes ${formatNumber(summary.nodes_explored)}</div>
    <div class="insight-chip">Pruned ${formatNumber(summary.pruned_nodes)}</div>
    <div class="insight-chip">Best ${formatNumber(summary.best_cost)}</div>
  `;
  branchCaption.innerHTML = `
    <strong>${currentStep.title}</strong>
    <span>${currentStep.detail}</span>
  `;
}

function renderSharedControls() {
  const greedySteps = state.scenario?.greedy_trace ?? [];
  const branchSteps = state.scenario?.branch_and_bound_trace ?? [];
  const maxGreedy = Math.max(greedySteps.length - 1, 0);
  const maxBranch = Math.max(branchSteps.length - 1, 0);
  const atStart = state.greedyStepIndex === 0 && state.branchStepIndex === 0;
  const atEnd = state.greedyStepIndex >= maxGreedy && state.branchStepIndex >= maxBranch;

  sharedResetButton.disabled = !state.scenario || atStart;
  sharedPrevButton.disabled = !state.scenario || atStart;
  sharedNextButton.disabled = !state.scenario || atEnd;
  sharedPlayButton.disabled = !state.scenario || (greedySteps.length <= 1 && branchSteps.length <= 1);
  sharedPlayButton.textContent = state.autoplay ? "Pause" : "Play";
}

function renderCharts() {
  if (!state.dashboard) {
    chartsGrid.innerHTML = `<div class="empty-state">Grafik akan tampil setelah data dashboard dimuat.</div>`;
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

function resetScenarioDerivedState() {
  stopAutoplay();
  state.selectedCell = null;
  state.greedyStepIndex = 0;
  state.branchStepIndex = 0;
}

function renderAllScenarioViews() {
  renderMatrix();
  renderComparison();
  renderGreedyVisual();
  renderBranchVisual();
  renderSharedControls();
}

function stepForward() {
  const greedySteps = state.scenario?.greedy_trace ?? [];
  const branchSteps = state.scenario?.branch_and_bound_trace ?? [];
  if (state.greedyStepIndex < greedySteps.length - 1) state.greedyStepIndex += 1;
  if (state.branchStepIndex < branchSteps.length - 1) state.branchStepIndex += 1;
  renderGreedyVisual();
  renderBranchVisual();
  renderSharedControls();
}

function stepBackward() {
  if (state.greedyStepIndex > 0) state.greedyStepIndex -= 1;
  if (state.branchStepIndex > 0) state.branchStepIndex -= 1;
  renderGreedyVisual();
  renderBranchVisual();
  renderSharedControls();
}

function resetSteps() {
  stopAutoplay();
  state.greedyStepIndex = 0;
  state.branchStepIndex = 0;
  renderGreedyVisual();
  renderBranchVisual();
  renderSharedControls();
}

function toggleAutoplay() {
  const greedySteps = state.scenario?.greedy_trace ?? [];
  const branchSteps = state.scenario?.branch_and_bound_trace ?? [];
  if (greedySteps.length <= 1 && branchSteps.length <= 1) return;

  if (state.autoplay) {
    stopAutoplay();
    renderSharedControls();
    return;
  }

  state.autoplay = setInterval(() => {
    const greedyDone = state.greedyStepIndex >= greedySteps.length - 1;
    const branchDone = state.branchStepIndex >= branchSteps.length - 1;
    if (greedyDone && branchDone) {
      stopAutoplay();
      renderSharedControls();
      return;
    }
    stepForward();
  }, 1800);
  renderSharedControls();
}

async function loadDashboard() {
  const currentSelection = scenarioSelect.value;
  state.dashboard = await fetchJson(`/api/dashboard${buildQuery()}`);
  renderScenarioOptions();
  if (
    currentSelection &&
    state.dashboard?.scenarios?.some((item) => String(item.id) === currentSelection)
  ) {
    scenarioSelect.value = currentSelection;
  }
  renderCharts();
}

async function loadScenario(scenarioId) {
  state.scenario = await fetchJson(`/api/scenarios/${scenarioId}${buildQuery()}`);
  resetScenarioDerivedState();
  renderAllScenarioViews();
}

reloadButton.addEventListener("click", async () => {
  const selectedScenarioId = scenarioSelect.value || String(state.dashboard?.scenarios?.[0]?.id ?? "");
  setLoading(true);
  try {
    await loadDashboard();
    if (selectedScenarioId) {
      scenarioSelect.value = selectedScenarioId;
      await loadScenario(selectedScenarioId);
    }
  } finally {
    setLoading(false);
  }
});

sharedResetButton.addEventListener("click", resetSteps);
sharedPrevButton.addEventListener("click", () => {
  stopAutoplay();
  stepBackward();
});
sharedNextButton.addEventListener("click", () => {
  stopAutoplay();
  stepForward();
});
sharedPlayButton.addEventListener("click", toggleAutoplay);

toggleChartsButton.addEventListener("click", () => {
  state.chartsVisible = !state.chartsVisible;
  updateChartsVisibility();
});

matrixModeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.matrixMode = button.dataset.matrixMode;
    state.selectedAlgorithm = state.matrixMode;
    updateMatrixModeButtons();
    renderComparison();
    renderMatrix();
  });
});

updateChartsVisibility();
updateMatrixModeButtons();
renderMatrix();
renderComparison();
renderGreedyVisual();
renderBranchVisual();
renderCharts();
renderSharedControls();

loadDashboard()
  .then(() => {
    const firstScenario = state.dashboard?.scenarios?.[0];
    if (firstScenario) scenarioSelect.value = String(firstScenario.id);
  })
  .catch((error) => {
    matrixContainer.innerHTML = `<div class="empty-state">Gagal memuat dashboard: ${error.message}</div>`;
  });
