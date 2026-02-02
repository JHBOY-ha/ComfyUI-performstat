import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const PANEL_ID = "performstat-panel";
const STYLE_ID = "performstat-style";
const REFRESH_MS = 1000;
const STORE_PREFIX = "performstat.";

const state = {
  visible: readBool("visible", true),
  showMemory: readBool("showMemory", true),
  showGpu: readBool("showGpu", true),
  showVram: readBool("showVram", true),
  showTemp: readBool("showTemp", true),
  gpuVisible: {},
};
const gpuSettingIds = new Set();

function readBool(key, fallback) {
  const value = localStorage.getItem(STORE_PREFIX + key);
  if (value == null) return fallback;
  return value === "true";
}

function writeBool(key, value) {
  localStorage.setItem(STORE_PREFIX + key, value ? "true" : "false");
}

function readPos() {
  const x = Number(localStorage.getItem(STORE_PREFIX + "x"));
  const y = Number(localStorage.getItem(STORE_PREFIX + "y"));
  if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };
  return { x: 16, y: 74 };
}

function writePos(x, y) {
  localStorage.setItem(STORE_PREFIX + "x", String(x));
  localStorage.setItem(STORE_PREFIX + "y", String(y));
}

function readSize() {
  const width = Number(localStorage.getItem(STORE_PREFIX + "width"));
  const height = Number(localStorage.getItem(STORE_PREFIX + "height"));
  return {
    width: Number.isFinite(width) ? width : 300,
    height: Number.isFinite(height) ? height : 0,
  };
}

function writeSize(width, height) {
  localStorage.setItem(STORE_PREFIX + "width", String(width));
  localStorage.setItem(STORE_PREFIX + "height", String(height));
}

function gpuVisibleKey(index) {
  return `gpuVisible.${index}`;
}

function isGpuVisible(index) {
  if (!(index in state.gpuVisible)) {
    state.gpuVisible[index] = readBool(gpuVisibleKey(index), true);
  }
  return state.gpuVisible[index];
}

function setGpuVisible(index, visible) {
  state.gpuVisible[index] = !!visible;
  writeBool(gpuVisibleKey(index), state.gpuVisible[index]);
}

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
#${PANEL_ID} {
  position: fixed;
  left: 16px;
  top: 74px;
  z-index: 2147483647;
  width: 300px;
  max-width: calc(100vw - 12px);
  min-width: 220px;
  min-height: 72px;
  color: #dce5f1;
  background: rgba(8, 12, 20, 0.94);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45);
  font-family: "Fira Code", "JetBrains Mono", "Menlo", monospace;
  font-size: 12px;
  letter-spacing: 0.1px;
  user-select: none;
  resize: both;
  overflow: hidden;
}

#${PANEL_ID}.ps-hidden {
  display: none;
}

#${PANEL_ID} .ps-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  cursor: move;
  color: #9fb0c3;
}

#${PANEL_ID} .ps-title {
  text-transform: uppercase;
  font-size: 10px;
  letter-spacing: 0.8px;
}

#${PANEL_ID} .ps-body {
  padding: 6px 8px 7px;
  display: grid;
  gap: 6px;
  height: calc(100% - 30px);
  overflow: auto;
}

#${PANEL_ID} .ps-block {
  display: grid;
  gap: 3px;
}

#${PANEL_ID} .ps-label {
  font-size: 10px;
  color: #93a2b3;
  text-transform: uppercase;
}

#${PANEL_ID} .ps-meta {
  color: #a8b6c8;
}

#${PANEL_ID} .ps-bar {
  height: 3px;
  width: 100%;
  min-width: 0;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

#${PANEL_ID} .ps-fill {
  height: 100%;
  width: 0%;
  border-radius: 999px;
  transition: width 0.25s ease;
}

#${PANEL_ID} .ps-fill-mem { background: #48d0a0; }
#${PANEL_ID} .ps-fill-gpu { background: #5f8ff8; }
#${PANEL_ID} .ps-fill-vram { background: #f3c75f; }

#${PANEL_ID} .ps-gpu-list {
  display: grid;
  gap: 4px;
  max-height: 60vh;
  overflow: auto;
  padding-right: 4px;
}

#${PANEL_ID} .ps-gpu {
  display: grid;
  gap: 2px;
  padding: 3px 0;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

#${PANEL_ID} .ps-gpu:first-child {
  border-top: none;
  padding-top: 0;
}

#${PANEL_ID} .ps-row {
  display: flex;
  justify-content: space-between;
  gap: 6px;
}

#${PANEL_ID} .ps-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

#${PANEL_ID} .ps-warn {
  color: #f3c75f;
}

@media (max-width: 640px) {
  #${PANEL_ID} {
    width: calc(100vw - 12px);
    resize: none;
  }
}
`;
  document.head.appendChild(style);
}

function ensurePanel() {
  let panel = document.getElementById(PANEL_ID);
  if (panel) return panel;
  panel = document.createElement("div");
  panel.id = PANEL_ID;
  panel.innerHTML = `
    <div class="ps-head" data-ps="drag-handle">
      <div class="ps-title">PerformStat</div>
      <div class="ps-meta">H: Show/Hide</div>
    </div>
    <div class="ps-body">
      <div class="ps-block" data-ps="memory-block">
        <div class="ps-label">Memory</div>
        <div class="ps-bar"><div class="ps-fill ps-fill-mem" data-ps="mem-fill"></div></div>
        <div class="ps-meta" data-ps="mem-meta">Loading...</div>
      </div>
      <div class="ps-block" data-ps="gpu-block">
        <div class="ps-label">GPU</div>
        <div class="ps-gpu-list" data-ps="gpu-list"></div>
      </div>
    </div>
  `;
  document.body.appendChild(panel);
  applySize(panel);
  applyPosition(panel);
  applyVisibility(panel);
  setupDrag(panel);
  setupResize(panel);
  return panel;
}

function applySize(panel) {
  const size = readSize();
  const maxWidth = Math.max(220, window.innerWidth - 12);
  const maxHeight = Math.max(90, window.innerHeight - 12);
  const width = Math.max(220, Math.min(size.width, maxWidth));
  panel.style.width = `${width}px`;
  if (size.height > 90) {
    panel.style.height = `${Math.min(size.height, maxHeight)}px`;
  }
}

function applyPosition(panel) {
  const pos = readPos();
  const maxX = Math.max(0, window.innerWidth - panel.offsetWidth - 8);
  const maxY = Math.max(0, window.innerHeight - panel.offsetHeight - 8);
  const x = Math.max(8, Math.min(pos.x, maxX));
  const y = Math.max(8, Math.min(pos.y, maxY));
  panel.style.left = `${x}px`;
  panel.style.top = `${y}px`;
}

function setupDrag(panel) {
  const handle = panel.querySelector(`[data-ps="drag-handle"]`);
  if (!handle) return;
  let dragging = false;
  let dx = 0;
  let dy = 0;

  handle.addEventListener("pointerdown", (event) => {
    dragging = true;
    const rect = panel.getBoundingClientRect();
    dx = event.clientX - rect.left;
    dy = event.clientY - rect.top;
    handle.setPointerCapture(event.pointerId);
  });

  handle.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const maxX = Math.max(8, window.innerWidth - panel.offsetWidth - 8);
    const maxY = Math.max(8, window.innerHeight - panel.offsetHeight - 8);
    const x = Math.max(8, Math.min(event.clientX - dx, maxX));
    const y = Math.max(8, Math.min(event.clientY - dy, maxY));
    panel.style.left = `${x}px`;
    panel.style.top = `${y}px`;
  });

  handle.addEventListener("pointerup", (event) => {
    if (!dragging) return;
    dragging = false;
    handle.releasePointerCapture(event.pointerId);
    writePos(parseInt(panel.style.left, 10), parseInt(panel.style.top, 10));
  });
}

function setupResize(panel) {
  if (typeof ResizeObserver === "undefined") return;
  let timer = null;
  const observer = new ResizeObserver(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      writeSize(panel.offsetWidth, panel.offsetHeight);
      const x = parseInt(panel.style.left || "16", 10);
      const y = parseInt(panel.style.top || "74", 10);
      writePos(x, y);
      applyPosition(panel);
    }, 120);
  });
  observer.observe(panel);
}

function applyVisibility(panel) {
  if (!panel) return;
  panel.classList.toggle("ps-hidden", !state.visible);
  const memoryBlock = panel.querySelector(`[data-ps="memory-block"]`);
  const gpuBlock = panel.querySelector(`[data-ps="gpu-block"]`);
  if (memoryBlock) memoryBlock.style.display = state.showMemory ? "" : "none";
  if (gpuBlock) gpuBlock.style.display = state.showGpu ? "" : "none";
}

function setupHotkey() {
  window.addEventListener("keydown", (event) => {
    if (event.key.toLowerCase() !== "h") return;
    const tag = (document.activeElement?.tagName || "").toLowerCase();
    const editable = document.activeElement?.isContentEditable;
    if (tag === "input" || tag === "textarea" || editable) return;
    state.visible = !state.visible;
    writeBool("visible", state.visible);
    applyVisibility(ensurePanel());
  });
}

function setupSettings() {
  const settings = app?.ui?.settings;
  if (!settings || typeof settings.addSetting !== "function") return;

  settings.addSetting({
    id: "performstat.visible",
    name: "PerformStat: Enable Floating Panel",
    type: "boolean",
    defaultValue: state.visible,
    onChange: (next) => {
      state.visible = !!next;
      writeBool("visible", state.visible);
      applyVisibility(ensurePanel());
    },
  });
  settings.addSetting({
    id: "performstat.show_memory",
    name: "PerformStat: Show Memory",
    type: "boolean",
    defaultValue: state.showMemory,
    onChange: (next) => {
      state.showMemory = !!next;
      writeBool("showMemory", state.showMemory);
      applyVisibility(ensurePanel());
    },
  });
  settings.addSetting({
    id: "performstat.show_gpu",
    name: "PerformStat: Show GPU",
    type: "boolean",
    defaultValue: state.showGpu,
    onChange: (next) => {
      state.showGpu = !!next;
      writeBool("showGpu", state.showGpu);
      applyVisibility(ensurePanel());
    },
  });
  settings.addSetting({
    id: "performstat.show_vram",
    name: "PerformStat: Show VRAM",
    type: "boolean",
    defaultValue: state.showVram,
    onChange: (next) => {
      state.showVram = !!next;
      writeBool("showVram", state.showVram);
    },
  });
  settings.addSetting({
    id: "performstat.show_temp",
    name: "PerformStat: Show Temperature",
    type: "boolean",
    defaultValue: state.showTemp,
    onChange: (next) => {
      state.showTemp = !!next;
      writeBool("showTemp", state.showTemp);
    },
  });
}

function syncGpuSettings(gpuData) {
  const settings = app?.ui?.settings;
  if (!settings || typeof settings.addSetting !== "function") return;
  if (!gpuData || !Array.isArray(gpuData.gpus)) return;

  gpuData.gpus.forEach((gpu) => {
    const idx = gpu.index;
    const id = `performstat.gpu_visible_${idx}`;
    if (gpuSettingIds.has(id)) return;
    gpuSettingIds.add(id);
    const defaultValue = readBool(gpuVisibleKey(idx), true);
    state.gpuVisible[idx] = defaultValue;
    settings.addSetting({
      id,
      name: `PerformStat: Show GPU [${idx}] ${gpu.name}`,
      type: "boolean",
      defaultValue,
      onChange: (next) => {
        setGpuVisible(idx, !!next);
      },
    });
  });
}

function setBar(el, percent) {
  if (!el) return;
  const value = Math.max(0, Math.min(100, percent || 0));
  el.style.width = `${value}%`;
}

function formatBytes(num) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = Number(num) || 0;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(1)}${units[i]}`;
}

function renderStats(data) {
  const panel = ensurePanel();
  if (!state.visible) return;

  const memFill = panel.querySelector(`[data-ps="mem-fill"]`);
  const memMeta = panel.querySelector(`[data-ps="mem-meta"]`);
  const gpuList = panel.querySelector(`[data-ps="gpu-list"]`);
  if (!gpuList || !memMeta) return;

  if (!data || !data.ok) {
    memMeta.textContent = "No data";
    gpuList.innerHTML = `<div class="ps-warn">No GPU data</div>`;
    return;
  }

  if (data.memory?.error) {
    setBar(memFill, 0);
    memMeta.textContent = data.memory.error;
  } else if (data.memory) {
    const pct = data.memory.percent || 0;
    setBar(memFill, pct);
    memMeta.textContent = `${pct.toFixed(1)}% (${formatBytes(data.memory.used)}/${formatBytes(
      data.memory.total
    )})`;
  }

  gpuList.innerHTML = "";
  if (!data.gpu) {
    gpuList.innerHTML = `<div class="ps-warn">No GPU data</div>`;
    return;
  }
  if (data.gpu.error) {
    gpuList.innerHTML = `<div class="ps-warn">${data.gpu.error}</div>`;
    return;
  }
  if (!Array.isArray(data.gpu.gpus) || data.gpu.gpus.length === 0) {
    gpuList.innerHTML = `<div class="ps-warn">No GPU devices</div>`;
    return;
  }

  let visibleGpuCount = 0;
  data.gpu.gpus.forEach((gpu) => {
    if (!isGpuVisible(gpu.index)) return;
    visibleGpuCount += 1;

    const item = document.createElement("div");
    item.className = "ps-gpu";

    const row1 = document.createElement("div");
    row1.className = "ps-row";
    row1.innerHTML = `
      <div class="ps-name">[${gpu.index}] ${gpu.name}</div>
      <div class="ps-meta">${gpu.status ? gpu.status : ""}</div>
    `;

    const row2 = document.createElement("div");
    row2.className = "ps-row";

    const gpuBarWrap = document.createElement("div");
    gpuBarWrap.className = "ps-bar";
    gpuBarWrap.style.flex = "1 1 0";
    const gpuFill = document.createElement("div");
    gpuFill.className = "ps-fill ps-fill-gpu";
    gpuBarWrap.appendChild(gpuFill);

    const vramBarWrap = document.createElement("div");
    vramBarWrap.className = "ps-bar";
    vramBarWrap.style.flex = "1 1 0";
    const vramFill = document.createElement("div");
    vramFill.className = "ps-fill ps-fill-vram";
    vramBarWrap.appendChild(vramFill);

    if (!state.showGpu) gpuBarWrap.style.display = "none";
    if (!state.showVram) vramBarWrap.style.display = "none";
    row2.appendChild(gpuBarWrap);
    row2.appendChild(vramBarWrap);

    const row3 = document.createElement("div");
    row3.className = "ps-meta";
    const parts = [];

    if (data.gpu.provider === "nvidia_nvml") {
      const gpuPct = Number(gpu.util_gpu) || 0;
      const vramPct =
        gpu.vram_total > 0 ? (Number(gpu.vram_used) / Number(gpu.vram_total)) * 100 : 0;
      setBar(gpuFill, gpuPct);
      setBar(vramFill, vramPct);
      if (state.showGpu) parts.push(`GPU ${gpuPct.toFixed(0)}%`);
      if (state.showVram) parts.push(`VRAM ${vramPct.toFixed(1)}%`);
      if (state.showTemp) parts.push(`${gpu.temp}C`);
    } else if (data.gpu.provider === "apple_mps") {
      const gpuPct = Number(gpu.util_gpu);
      const memPct = Number(gpu.util_mem) || 0;
      const vramPct =
        gpu.vram_total > 0 ? (Number(gpu.vram_used) / Number(gpu.vram_total)) * 100 : memPct;
      setBar(gpuFill, Number.isFinite(gpuPct) ? gpuPct : memPct);
      setBar(vramFill, vramPct);
      if (state.showGpu) {
        parts.push(`GPU ${Number.isFinite(gpuPct) ? gpuPct.toFixed(1) : "N/A"}%`);
      }
      if (state.showVram) parts.push(`VRAM ${vramPct.toFixed(1)}%`);
      if (state.showTemp) {
        parts.push(typeof gpu.temp === "number" ? `${gpu.temp.toFixed(1)}C` : "temp --");
      }
    } else {
      const alloc = Number(gpu.allocated) || 0;
      const reserv = Number(gpu.reserved) || 0;
      const vramPct = reserv > 0 ? (alloc / reserv) * 100 : 0;
      setBar(gpuFill, 0);
      setBar(vramFill, vramPct);
      if (state.showVram) parts.push(`VRAM ${vramPct.toFixed(1)}%`);
      parts.push(`alloc ${formatBytes(alloc)}`);
    }

    row3.textContent = parts.join(" · ");

    item.appendChild(row1);
    item.appendChild(row2);
    item.appendChild(row3);
    gpuList.appendChild(item);
  });
  if (visibleGpuCount === 0) {
    gpuList.innerHTML = `<div class="ps-warn">All GPUs are hidden in settings</div>`;
  }
}

async function fetchStats() {
  try {
    const resp = await api.fetchApi("/performstat?sample_ms=100");
    if (!resp.ok) {
      renderStats({ ok: false });
      return;
    }
    const data = await resp.json();
    syncGpuSettings(data.gpu);
    renderStats(data);
  } catch (error) {
    renderStats({ ok: false });
  }
}

app.registerExtension({
  name: "performstat.panel",
  async setup() {
    ensureStyle();
    setupSettings();
    setupHotkey();
    ensurePanel();
    window.addEventListener("resize", () => {
      const panel = ensurePanel();
      applySize(panel);
      applyPosition(panel);
    });
    await fetchStats();
    setInterval(fetchStats, REFRESH_MS);
  },
});
