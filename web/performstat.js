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
  --ps-bg: rgba(10, 12, 18, 0.92);
  --ps-border: rgba(255, 255, 255, 0.08);
  --ps-text: #e8eef5;
  --ps-muted: #9aa6b2;
  --ps-ram: #5ad6a1;
  --ps-gpu: #5aa4f6;
  --ps-vram: #f6c45a;
}

body.ps-has-performstat {
  padding-top: 46px;
}

#${BAR_ID} {
  position: fixed;
  top: 0;
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
    <div class="ps-item">
      <div class="ps-label">Memory</div>
      <div class="ps-bar"><span data-ps="ram-bar"></span></div>
      <div class="ps-meta" data-ps="ram-meta">Loading...</div>
    </div>
    <div class="ps-item">
      <div class="ps-label">GPU</div>
      <div class="ps-gpu-list" data-ps="gpu-list"></div>
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

function setBar(span, percent, colorVar) {
  if (!span) return;
  const pct = Math.max(0, Math.min(100, percent || 0));
  span.style.width = `${pct}%`;
  span.style.background = `var(${colorVar})`;
}

function renderStats(data) {
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
    vramBar.className = "ps-bar";
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
      meta.textContent = `GPU ${gpu.util_gpu}% · VRAM ${vramPct.toFixed(
        1
      )}% · ${gpu.temp}C`;
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
    ensureBar();
    await fetchStats();
    setInterval(fetchStats, REFRESH_MS);
  },
});
