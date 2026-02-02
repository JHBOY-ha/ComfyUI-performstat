import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const BAR_ID = "performstat-bar";
const STYLE_ID = "performstat-style";
const REFRESH_MS = 1000;

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) {
    return;
  }
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
:root {
  --ps-bg: linear-gradient(135deg, rgba(18, 22, 34, 0.98), rgba(9, 12, 20, 0.98));
  --ps-border: rgba(255, 255, 255, 0.12);
  --ps-text: #e6eef7;
  --ps-muted: #a8b2bf;
  --ps-accent: #3bd6c6;
  --ps-warn: #ffb44d;
  --ps-pad: 10px;
}

body.ps-has-performstat {
  padding-top: 56px;
}

#${BAR_ID} {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 8px 14px;
  background: var(--ps-bg);
  color: var(--ps-text);
  border-bottom: 1px solid var(--ps-border);
  font-family: "Fira Code", "JetBrains Mono", "Menlo", monospace;
  font-size: 12px;
  letter-spacing: 0.2px;
  backdrop-filter: blur(6px);
}

#${BAR_ID} .ps-left {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 220px;
}

#${BAR_ID} .ps-title {
  font-weight: 600;
  color: var(--ps-accent);
  text-transform: uppercase;
  font-size: 11px;
}

#${BAR_ID} .ps-right {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 16px;
  flex: 1;
}

#${BAR_ID} .ps-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

#${BAR_ID} .ps-label {
  font-size: 10px;
  text-transform: uppercase;
  color: var(--ps-muted);
}

#${BAR_ID} .ps-value {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

#${BAR_ID} .ps-gpus {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

#${BAR_ID} .ps-warn {
  color: var(--ps-warn);
}

@media (max-width: 860px) {
  #${BAR_ID} {
    flex-direction: column;
    align-items: flex-start;
  }
  #${BAR_ID} .ps-right {
    grid-template-columns: 1fr;
    width: 100%;
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
    <div class="ps-left">
      <div class="ps-title">Performance</div>
      <div class="ps-value" data-ps="host">Loading...</div>
      <div class="ps-value" data-ps="time"></div>
    </div>
    <div class="ps-right">
      <div class="ps-block">
        <div class="ps-label">CPU</div>
        <div class="ps-value" data-ps="cpu"></div>
        <div class="ps-value" data-ps="ram"></div>
      </div>
      <div class="ps-block">
        <div class="ps-label">GPU</div>
        <div class="ps-gpus" data-ps="gpu"></div>
      </div>
    </div>
  `;
  document.body.appendChild(bar);
  return bar;
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

function summarizeCores(perCore) {
  if (!Array.isArray(perCore) || perCore.length === 0) {
    return "";
  }
  const limit = 12;
  const slice = perCore.slice(0, limit).map((v) => `${v.toFixed(0)}%`);
  const suffix = perCore.length > limit ? " ..." : "";
  return `Cores: ${slice.join(" ")}${suffix}`;
}

function renderStats(data) {
  const hostEl = document.querySelector(`[data-ps="host"]`);
  const timeEl = document.querySelector(`[data-ps="time"]`);
  const cpuEl = document.querySelector(`[data-ps="cpu"]`);
  const ramEl = document.querySelector(`[data-ps="ram"]`);
  const gpuEl = document.querySelector(`[data-ps="gpu"]`);

  if (!data || !data.ok) {
    hostEl.textContent = "Performance stats unavailable";
    cpuEl.textContent = "";
    ramEl.textContent = "";
    gpuEl.innerHTML = `<div class="ps-warn">No data</div>`;
    return;
  }

  hostEl.textContent = `${data.host} (${data.platform})`;
  timeEl.textContent = data.timestamp;

  if (data.cpu && data.cpu.error) {
    cpuEl.innerHTML = `<span class="ps-warn">${data.cpu.error}</span>`;
    ramEl.textContent = "";
  } else if (data.cpu) {
    cpuEl.textContent = `Total ${data.cpu.total.toFixed(1)}% · ${summarizeCores(
      data.cpu.per_core
    )}`;
    ramEl.textContent = `RAM ${data.cpu.memory.percent.toFixed(1)}% (${formatBytes(
      data.cpu.memory.used
    )}/${formatBytes(data.cpu.memory.total)})`;
  }

  gpuEl.innerHTML = "";
  if (!data.gpu) {
    gpuEl.innerHTML = `<div class="ps-warn">No GPU data</div>`;
    return;
  }
  if (data.gpu.error) {
    gpuEl.innerHTML = `<div class="ps-warn">${data.gpu.error}</div>`;
    return;
  }
  if (!data.gpu.gpus || data.gpu.gpus.length === 0) {
    gpuEl.innerHTML = `<div class="ps-warn">No GPU devices</div>`;
    return;
  }
  data.gpu.gpus.forEach((gpu) => {
    const line = document.createElement("div");
    if (data.gpu.provider === "nvidia_nvml") {
      const vramPct = (gpu.vram_used / gpu.vram_total) * 100;
      line.textContent = `[${gpu.index}] ${gpu.name} · ${gpu.util_gpu}% GPU · ${gpu.util_mem}% MEM · VRAM ${vramPct.toFixed(
        1
      )}% (${formatBytes(gpu.vram_used)}/${formatBytes(gpu.vram_total)}) · ${
        gpu.temp
      }C`;
    } else {
      line.textContent = `[${gpu.index}] ${gpu.name} · alloc ${formatBytes(
        gpu.allocated
      )} · reserv ${formatBytes(gpu.reserved)}`;
    }
    gpuEl.appendChild(line);
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
    ensureBar();
    await fetchStats();
    setInterval(fetchStats, REFRESH_MS);
  },
});
