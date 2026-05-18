const state = {
  dashboard: null,
  scenario: null,
  selectedAlgorithm: "branch_and_bound",
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
const comparisonGrid = document.getElementById("comparisonGrid");
const greedyCanvas = document.getElementById("greedyCanvas");
const greedyCaption = document.getElementById("greedyCaption");
const greedyStepLabel = document.getElementById("greedyStepLabel");
const branchCanvas = document.getElementById("branchCanvas");
const branchCaption = document.getElementById("branchCaption");
const branchStepLabel = document.getElementById("branchStepLabel");
const sharedPrevButton = document.getElementById("sharedPrevButton");
const sharedPlayButton = document.getElementById("sharedPlayButton");
const sharedNextButton = document.getElementById("sharedNextButton");
const chartsGrid = document.getElementById("chartsGrid");
const chartsPanel = document.getElementById("chartsPanel");
const toggleChartsButton = document.getElementById("toggleChartsButton");

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
  sharedPlayButton.textContent = state.autoplay ? "||" : ">";
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

function renderMatrix() {
  if (!state.scenario) {
    scenarioMeta.textContent = "-";
    matrixContainer.innerHTML = `<div class="empty-state">Pilih skenario lalu tekan Terapkan.</div>`;
    return;
  }

  scenarioMeta.textContent = `${state.scenario.workers.length} Workers x ${state.scenario.machines.length} Tasks`;
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
    });
  });
}

function buildResultCard(title, data, options = {}) {
  const isBetter = options.isBetter;
  const isSelected = state.selectedAlgorithm === options.algorithmKey;
  const badge = options.badge
    ? `<div class="status-badge ${options.badgeClass ?? ""}">${options.badge}</div>`
    : `<div class="status-inline">${data.status === "ok" ? "Selesai" : data.status}</div>`;

  return `
    <article class="result-card ${isBetter ? "result-card-best" : ""} ${isSelected ? "result-card-active" : ""}" data-algorithm-card="${options.algorithmKey}">
      <div class="result-card-top">
        <h2 class="result-card-title">${title}</h2>
        ${badge}
      </div>
      <div class="section-divider"></div>
      <div class="result-metrics">
        <div class="metric-block">
          <span class="metric-label">Total Biaya</span>
          <strong class="metric-value ${isBetter ? "metric-value-best" : ""}">${formatNumber(data.total_cost)}</strong>
        </div>
        <div class="metric-block">
          <span class="metric-label">Runtime</span>
          <strong class="metric-runtime">${formatMs(data.runtime_ms)}</strong>
        </div>
      </div>
      <div class="section-divider"></div>
      <div class="result-footer">Node Dieksplor: ${formatNumber(data.nodes_explored)}</div>
    </article>
  `;
}

function renderComparison() {
  if (!state.scenario) {
    comparisonGrid.innerHTML = `
      <article class="result-card">
        <div class="empty-state">Hasil perbandingan akan muncul setelah tombol Terapkan ditekan.</div>
      </article>
    `;
    return;
  }

  const greedy = state.scenario.greedy;
  const branch = state.scenario.branch_and_bound;
  const branchBetter = branch.total_cost < greedy.total_cost;
  const greedyBetter = greedy.total_cost < branch.total_cost;
  const sameResult = greedy.total_cost === branch.total_cost;

  comparisonGrid.innerHTML = `
    ${buildResultCard("Greedy", greedy, {
      algorithmKey: "greedy",
      isBetter: greedyBetter,
      badge: sameResult ? "Setara" : "Selesai",
      badgeClass: sameResult ? "badge-neutral" : "badge-muted",
    })}
    ${buildResultCard("Branch & Bound", branch, {
      algorithmKey: "branch_and_bound",
      isBetter: branchBetter,
      badge: branchBetter ? "Lebih Optimal" : sameResult ? "Setara" : "Selesai",
      badgeClass: branchBetter ? "badge-best" : sameResult ? "badge-neutral" : "badge-muted",
    })}
  `;

  comparisonGrid.querySelectorAll("[data-algorithm-card]").forEach((card) => {
    card.addEventListener("click", () => {
      state.selectedAlgorithm = card.dataset.algorithmCard;
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
    greedyCaption.textContent = "";
    return;
  }

  state.greedyStepIndex = Math.max(0, Math.min(state.greedyStepIndex, steps.length - 1));
  const step = steps[state.greedyStepIndex];
  const selected = step.selected;
  const workers = state.scenario?.workers ?? [];
  const selectedWorkers = steps.slice(0, state.greedyStepIndex + 1).map((item) => item.selected.worker);
  const upcomingWorkers = workers.filter((worker) => !selectedWorkers.includes(worker)).slice(0, 2);

  greedyStepLabel.textContent = `${step.step}/${steps.length}`;

  const previousNodes = selectedWorkers
    .map(
      (worker, index) => `
        <div class="flow-node ${index === state.greedyStepIndex ? "flow-node-active" : ""}">
          ${worker}
        </div>
        <div class="flow-link ${index === state.greedyStepIndex && upcomingWorkers.length === 0 ? "flow-link-soft" : ""}"></div>
      `
    )
    .join("");

  const upcomingNodes = upcomingWorkers
    .map(
      (worker, index) => `
        <div class="flow-node flow-node-muted">${worker}</div>
        ${index < upcomingWorkers.length - 1 ? '<div class="flow-link flow-link-soft"></div>' : ""}
      `
    )
    .join("");

  greedyCanvas.innerHTML = `
    <div class="flow-vertical">
      <div class="flow-root">R</div>
      <div class="flow-link"></div>
      ${previousNodes}
      ${upcomingNodes}
    </div>
  `;

  greedyCaption.innerHTML = `
    <strong>${selected.worker} -> ${selected.machine}</strong>
    <span>Biaya ${selected.cost}</span>
  `;
}

function renderBranchVisual() {
  const steps = state.scenario?.branch_and_bound_trace ?? [];
  if (steps.length === 0) {
    branchStepLabel.textContent = "Langkah -";
    branchCanvas.innerHTML = `<div class="empty-state">Visual Branch and Bound akan tampil setelah hasil diterapkan.</div>`;
    branchCaption.textContent = "";
    return;
  }

  state.branchStepIndex = Math.max(0, Math.min(state.branchStepIndex, steps.length - 1));
  const step = steps[state.branchStepIndex];
  const focus = state.scenario.branch_and_bound_focus;
  const workers = state.scenario?.workers ?? [];
  const leftLabel = focus.priority_worker ?? workers[0] ?? "W1";
  const rightLabel = focus.alternative_worker ?? workers[1] ?? "W2";
  const pruned = /pangkas|prune/i.test(step.detail);
  const branchLabel = pruned ? "Cabang dipangkas" : "Cabang aktif";

  branchStepLabel.textContent = `${step.step}/${steps.length}`;

  branchCanvas.innerHTML = `
    <div class="branch-tree">
      <div class="flow-root">R</div>
      <div class="branch-label">${branchLabel}</div>
      <div class="branch-connectors"></div>
      <div class="branch-row">
        <div class="branch-node branch-node-active">${leftLabel}</div>
        <div class="branch-node ${pruned ? "branch-node-pruned" : ""}">${rightLabel}</div>
      </div>
    </div>
  `;

  branchCaption.innerHTML = `
    <strong>${step.title}</strong>
    <span>${step.detail}</span>
  `;
}

function renderSharedControls() {
  const greedySteps = state.scenario?.greedy_trace ?? [];
  const branchSteps = state.scenario?.branch_and_bound_trace ?? [];
  const maxGreedy = Math.max(greedySteps.length - 1, 0);
  const maxBranch = Math.max(branchSteps.length - 1, 0);

  sharedPrevButton.disabled = !state.scenario || (state.greedyStepIndex === 0 && state.branchStepIndex === 0);
  sharedNextButton.disabled =
    !state.scenario || (state.greedyStepIndex >= maxGreedy && state.branchStepIndex >= maxBranch);
  sharedPlayButton.disabled = !state.scenario || (greedySteps.length <= 1 && branchSteps.length <= 1);
  sharedPlayButton.textContent = state.autoplay ? "||" : ">";
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

function toggleAutoplay() {
  const greedySteps = state.scenario?.greedy_trace ?? [];
  const branchSteps = state.scenario?.branch_and_bound_trace ?? [];
  if (greedySteps.length <= 1 && branchSteps.length <= 1) return;

  if (state.autoplay) {
    stopAutoplay();
    return;
  }

  state.autoplay = setInterval(() => {
    const greedyDone = state.greedyStepIndex >= greedySteps.length - 1;
    const branchDone = state.branchStepIndex >= branchSteps.length - 1;
    if (greedyDone && branchDone) {
      stopAutoplay();
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

sharedPrevButton.addEventListener("click", () => {
  stopAutoplay();
  stepBackward();
});

sharedNextButton.addEventListener("click", () => {
  stopAutoplay();
  stepForward();
});

sharedPlayButton.addEventListener("click", () => {
  toggleAutoplay();
});

toggleChartsButton.addEventListener("click", () => {
  state.chartsVisible = !state.chartsVisible;
  updateChartsVisibility();
});

updateChartsVisibility();
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
