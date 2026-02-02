# ComfyUI-performstat

Simple ComfyUI custom node that reports CPU, RAM, and GPU usage.

## Install

1. Copy this folder into `ComfyUI/custom_nodes/ComfyUI-performstat`.
2. Install dependencies:

```bash
pip install -r custom_nodes/ComfyUI-performstat/requirements.txt
```

3. Restart ComfyUI.

## Usage

Add node: `Performance Stats (CPU/GPU)` and connect its output to a text display node.

Top bar: after restart, a fixed status bar appears at the top of the page and refreshes every 1s.

## Notes

- NVIDIA GPU stats use NVML via `pynvml`.
- If NVML is unavailable, the node falls back to torch CUDA memory stats.
