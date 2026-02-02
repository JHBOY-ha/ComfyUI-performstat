import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const BAR_ID = "performstat-bar";
const STYLE_ID = "performstat-style";
const REFRESH_MS = 1000;
const STORE_PREFIX = "performstat.";

const state = {
  enabled: true,
  showMemory: true,
  showGpu: true,
  showVram: true,
  showTemp: true,
};

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) {
    return;
  }
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
:root {
  --ps-bg: rgba(10, 12, 18, 0.92);
  --ps-border: rgba(255, 255, 255, 0.08);
  --ps-text: #e8eef5;
  --ps-muted: #9aa6b2;
  --ps-ram: #5ad6a1;
  --ps-gpu: #5aa4f6;
  --ps-vram: #f6c45a;
}

body.ps-has-performstat {
  --ps-top-offset: 52px;
}

body.ps-has-performstat.ps-fixed-mode {
  padding-top: calc(var(--ps-top-offset) + 46px);
}

#${BAR_ID} {
  position: relative;
  left: 0;
  right: 0;
  z-index: 9999;
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 12px;
  padding: 8px 14px 9px;
  background: var(--ps-bg);
  color: var(--ps-text);
  border-bottom: 1px solid var(--ps-border);
  font-family: "Fira Code", "JetBrains Mono", "Menlo", monospace;
  font-size: 12px;
  letter-spacing: 0.1px;
  backdrop-filter: blur(6px);
}

#${BAR_ID}.ps-fixed {
  position: fixed;
  top: var(--ps-top-offset);
}

#${BAR_ID} .ps-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

#${BAR_ID} .ps-label {
  font-size: 10px;
  text-transform: uppercase;
  color: var(--ps-muted);
  letter-spacing: 0.8px;
}

#${BAR_ID} .ps-bar {
  height: 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

#${BAR_ID} .ps-bar span {
  display: block;
  height: 100%;
  width: 0;
  border-radius: 999px;
  transition: width 0.3s ease;
}

#${BAR_ID} .ps-meta {
  color: var(--ps-muted);
  font-size: 11px;
}

#${BAR_ID} .ps-gpu-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

#${BAR_ID} .ps-gpu-row {
  display: grid;
  grid-template-columns: 1fr;
  gap: 4px;
}

#${BAR_ID} .ps-gpu-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

#${BAR_ID} .ps-bars {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

#${BAR_ID} .ps-warn {
  color: #f6c45a;
}

#${BAR_ID}.ps-hidden {
  display: none;
}

#${BAR_ID}.ps-no-memory .ps-memory {
  display: none;
}

#${BAR_ID}.ps-no-gpu .ps-gpu {
  display: none;
}

#${BAR_ID}.ps-no-vram .ps-vram-wrap {
  display: none;
}

#${BAR_ID}.ps-no-temp .ps-temp {
  display: none;
}

@media (max-width: 860px) {
  #${BAR_ID} {
    grid-template-columns: 1fr;
  }
  #${BAR_ID} .ps-bars {
    grid-template-columns: 1fr;
  }
}
`;
  document.head.appendChild(style);
  document.body.classList.add("ps-has-performstat");
}

function ensureBar() {
  let bar = document.getElementById(BAR_ID);
  if (bar) {
    return bar;
  }
  bar = document.createElement("div");
  bar.id = BAR_ID;
  bar.innerHTML = `
    <div class="ps-item ps-memory">
      <div class="ps-label">Memory</div>
      <div class="ps-bar"><span data-ps="ram-bar"></span></div>
      <div class="ps-meta" data-ps="ram-meta">Loading...</div>
    </div>
    <div class="ps-item ps-gpu">
      <div class="ps-label">GPU</div>
      <div class="ps-gpu-list" data-ps="gpu-list"></div>
    </div>
  `;
  mountBar(bar);
  applyLayoutMode(bar);
  applyVisibility();
  return bar;
}

function mountBar(bar) {
  const anchor = document.querySelector(
    ".comfyui-menu, #comfyui-menu, .comfy-menu, .top-panel, header"
  );
  if (anchor && anchor.parentElement) {
    anchor.insertAdjacentElement("afterend", bar);
    bar.dataset.psMounted = "embedded";
  } else {
    document.body.appendChild(bar);
    bar.dataset.psMounted = "fixed";
  }
}

function getTopOffset() {
  const candidates = document.querySelectorAll(
    ".comfyui-menu, #comfyui-menu, .comfy-menu, .top-panel, header"
  );
  let maxBottom = 0;
  candidates.forEach((el) => {
    const rect = el.getBoundingClientRect();
    if (rect.bottom > maxBottom) {
      maxBottom = rect.bottom;
    }
  });
  return Math.max(0, Math.ceil(maxBottom + 4));
}

function applyLayoutMode(bar) {
  if (!bar) return;
  document.body.classList.remove("ps-fixed-mode");
  bar.classList.remove("ps-fixed");

  if (bar.dataset.psMounted !== "fixed") {
    return;
  }

  const topOffset = getTopOffset();
  document.body.style.setProperty("--ps-top-offset", `${topOffset}px`);
  bar.classList.add("ps-fixed");
  document.body.classList.add("ps-fixed-mode");
}

function readBoolSetting(key, defaultValue) {
  const raw = localStorage.getItem(STORE_PREFIX + key);
  if (raw == null) return defaultValue;
  return raw === "true";
}

function writeBoolSetting(key, value) {
  localStorage.setItem(STORE_PREFIX + key, value ? "true" : "false");
}

function applyVisibility() {
  const bar = document.getElementById(BAR_ID);
  if (!bar) return;

  bar.classList.toggle("ps-hidden", !state.enabled);
  bar.classList.toggle("ps-no-memory", !state.showMemory);
  const hideGpuBlock = !state.showGpu && !state.showVram && !state.showTemp;
  bar.classList.toggle("ps-no-gpu", hideGpuBlock);
  bar.classList.toggle("ps-no-vram", !state.showVram);
  bar.classList.toggle("ps-no-temp", !state.showTemp);
  if (bar.dataset.psMounted === "fixed") {
    document.body.classList.toggle(
      "ps-fixed-mode",
      state.enabled && bar.classList.contains("ps-fixed")
    );
  }
}

function registerSetting(id, name, key, defaultValue) {
  const settings = app?.ui?.settings;
  const value = readBoolSetting(key, defaultValue);
  state[key] = value;

  if (!settings || typeof settings.addSetting !== "function") {
    return;
  }

  settings.addSetting({
    id,
    name,
    type: "boolean",
    defaultValue: value,
    onChange: (next) => {
      state[key] = !!next;
      writeBoolSetting(key, state[key]);
      applyVisibility();
    },
  });
}

function setupSettings() {
  registerSetting(
    "performstat.enabled",
    "PerformStat: Enable Top Bar",
    "enabled",
    true
  );
  registerSetting(
    "performstat.show_memory",
    "PerformStat: Show Memory",
    "showMemory",
    true
  );
  registerSetting(
    "performstat.show_gpu",
    "PerformStat: Show GPU Usage",
    "showGpu",
    true
  );
  registerSetting(
    "performstat.show_vram",
    "PerformStat: Show VRAM Usage",
    "showVram",
    true
  );
  registerSetting(
    "performstat.show_temp",
    "PerformStat: Show GPU Temperature",
    "showTemp",
    true
  );

  applyVisibility();
}

function formatBytes(num) {
  const step = 1024;
  let value = num;
  const units = ["B", "KB", "MB", "GB", "TB"];
  let unit = units[0];
  for (let i = 0; i < units.length; i += 1) {
    unit = units[i];
    if (value < step || i === units.length - 1) {
      break;
    }
    value /= step;
  }
  return `${value.toFixed(1)}${unit}`;
}

function setBar(span, percent, colorVar) {
  if (!span) return;
  const pct = Math.max(0, Math.min(100, percent || 0));
  span.style.width = `${pct}%`;
  span.style.background = `var(${colorVar})`;
}

function formatPercent(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "N/A";
  }
  return `${value.toFixed(1)}%`;
}

function renderStats(data) {
  if (!state.enabled) {
    return;
  }

  const ramBar = document.querySelector(`[data-ps="ram-bar"]`);
  const ramMeta = document.querySelector(`[data-ps="ram-meta"]`);
  const gpuList = document.querySelector(`[data-ps="gpu-list"]`);

  if (!data || !data.ok) {
    if (ramMeta) ramMeta.textContent = "No data";
    if (gpuList) gpuList.innerHTML = `<div class="ps-warn">No GPU data</div>`;
    return;
  }

  if (data.memory && data.memory.error) {
    if (ramMeta) ramMeta.textContent = data.memory.error;
    setBar(ramBar, 0, "--ps-ram");
  } else if (data.memory) {
    const pct = data.memory.percent || 0;
    setBar(ramBar, pct, "--ps-ram");
    if (ramMeta) {
      ramMeta.textContent = `${pct.toFixed(1)}% (${formatBytes(
        data.memory.used
      )}/${formatBytes(data.memory.total)})`;
    }
  }

  if (!gpuList) return;
  gpuList.innerHTML = "";
  if (!data.gpu) {
    gpuList.innerHTML = `<div class="ps-warn">No GPU data</div>`;
    return;
  }
  if (data.gpu.error) {
    gpuList.innerHTML = `<div class="ps-warn">${data.gpu.error}</div>`;
    return;
  }
  if (!data.gpu.gpus || data.gpu.gpus.length === 0) {
    gpuList.innerHTML = `<div class="ps-warn">No GPU devices</div>`;
    return;
  }

  data.gpu.gpus.forEach((gpu) => {
    const row = document.createElement("div");
    row.className = "ps-gpu-row";

    const name = document.createElement("div");
    name.className = "ps-gpu-name";
    name.textContent = `[${gpu.index}] ${gpu.name}`;

    const bars = document.createElement("div");
    bars.className = "ps-bars";

    const gpuBar = document.createElement("div");
    gpuBar.className = "ps-bar";
    const gpuFill = document.createElement("span");
    gpuBar.appendChild(gpuFill);

    const vramBar = document.createElement("div");
    vramBar.className = "ps-bar ps-vram-wrap";
    const vramFill = document.createElement("span");
    vramBar.appendChild(vramFill);

    bars.appendChild(gpuBar);
    bars.appendChild(vramBar);

    const meta = document.createElement("div");
    meta.className = "ps-meta";

    if (data.gpu.provider === "nvidia_nvml") {
      const vramPct = (gpu.vram_used / gpu.vram_total) * 100;
      setBar(gpuFill, gpu.util_gpu, "--ps-gpu");
      setBar(vramFill, vramPct, "--ps-vram");
      if (!state.showGpu) {
        gpuBar.style.display = "none";
      }
      if (!state.showVram) {
        vramBar.style.display = "none";
      }
      const parts = [];
      if (state.showGpu) parts.push(`GPU ${gpu.util_gpu}%`);
      if (state.showVram) parts.push(`VRAM ${vramPct.toFixed(1)}%`);
      if (state.showTemp) parts.push(`${gpu.temp}C`);
      meta.textContent = parts.join(" · ");
    } else if (data.gpu.provider === "apple_mps") {
      const vramPct =
        gpu.vram_total > 0 ? (gpu.vram_used / gpu.vram_total) * 100 : 0;
      const gpuPct =
        typeof gpu.util_gpu === "number" ? gpu.util_gpu : gpu.util_mem || 0;
      setBar(gpuFill, gpuPct, "--ps-gpu");
      setBar(vramFill, vramPct, "--ps-vram");
      if (!state.showGpu) {
        gpuBar.style.display = "none";
      }
      if (!state.showVram) {
        vramBar.style.display = "none";
      }
      const parts = [];
      if (state.showGpu) parts.push(`GPU ${formatPercent(gpu.util_gpu)}`);
      if (state.showVram) parts.push(`VRAM ${vramPct.toFixed(1)}%`);
      if (state.showTemp) {
        parts.push(gpu.temp == null ? "temp N/A" : `${gpu.temp}C`);
      }
      meta.textContent = parts.join(" · ");
    } else {
      setBar(gpuFill, 0, "--ps-gpu");
      setBar(vramFill, 0, "--ps-vram");
      meta.textContent = `alloc ${formatBytes(gpu.allocated)} · reserv ${formatBytes(
        gpu.reserved
      )}`;
    }

    row.appendChild(name);
    row.appendChild(bars);
    row.appendChild(meta);
    gpuList.appendChild(row);
  });
}

async function fetchStats() {
  try {
    const resp = await api.fetchApi("/performstat?sample_ms=100");
    if (!resp.ok) {
      renderStats({ ok: false });
      return;
    }
    const data = await resp.json();
    renderStats(data);
  } catch (err) {
    renderStats({ ok: false });
  }
}

app.registerExtension({
  name: "performstat.topbar",
  async setup() {
    ensureStyle();
    setupSettings();
    ensureBar();
    window.addEventListener("resize", () => {
      applyLayoutMode(ensureBar());
      applyVisibility();
    });
    await fetchStats();
    setInterval(fetchStats, REFRESH_MS);
  },
});
