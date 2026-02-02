# ComfyUI-performstat

Simple ComfyUI custom node that reports CPU, RAM, and GPU usage.

## Install

### Option 1: Git clone to `custom_nodes`

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/JHBOY-ha/ComfyUI-performstat.git
cd ComfyUI-performstat
pip install -r requirements.txt
```

Then restart ComfyUI.

### Option 2: Install via ComfyUI Manager (GitHub URL)

1. Open **ComfyUI Manager**.
2. Choose install from **Install via Git URL**.
3. Paste repo URL: `https://github.com/JHBOY-ha/ComfyUI-performstat.git`
4. Install and restart ComfyUI.

## Usage

Add node: `Performance Stats (CPU/GPU)` and connect its output to a text display node.

Floating panel: after restart, a compact floating panel appears (1s refresh), always on top.
You can drag and resize the panel with mouse, and press `H` to show/hide quickly.
You can toggle bar visibility and metric items in ComfyUI settings:
- PerformStat: Enable Top Bar
- PerformStat: Show Memory
- PerformStat: Show GPU Usage
- PerformStat: Show VRAM Usage
- PerformStat: Show GPU Temperature
- PerformStat: Show GPU [index] <name> (auto-generated after startup scan)

## Notes

- NVIDIA GPU stats use NVML via `pynvml`.
- If NVML is unavailable, the node falls back to torch CUDA memory stats.
- Apple Silicon is supported via torch MPS memory metrics; GPU utilization/temperature are best-effort on macOS.
- Apple Silicon meta line includes `status` (active/idle) to avoid empty/N/A state feedback.
