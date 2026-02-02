import datetime as _dt
import platform as _platform
import re as _re
import subprocess as _subprocess

from aiohttp import web
from server import PromptServer


def _safe_import(name):
    try:
        module = __import__(name)
        return module, None
    except Exception as exc:
        return None, exc


def _format_bytes(num):
    step = 1024.0
    for unit in ["B", "KB", "MB", "GB", "TB"]:
        if num < step:
            return f"{num:.1f}{unit}"
        num /= step
    return f"{num:.1f}PB"


def _safe_call(func, default=None):
    try:
        return func()
    except Exception:
        return default


def _apple_ioreg_stats():
    try:
        output = _subprocess.check_output(
            ["ioreg", "-r", "-d", "1", "-w", "0", "-c", "IOAccelerator"],
            stderr=_subprocess.DEVNULL,
            text=True,
            timeout=0.6,
        )
    except Exception:
        return {}

    util_match = _re.search(r'"Device Utilization %" = (\d+)', output)
    temp_match = _re.search(r'"Temperature(?:\\(C\\))?" = (\d+)', output)

    data = {}
    if util_match:
        data["util_gpu"] = float(util_match.group(1))
    if temp_match:
        temp_raw = float(temp_match.group(1))
        # Some macOS builds report millidegrees.
        data["temp"] = temp_raw / 1000.0 if temp_raw > 200 else temp_raw
    return data


def _cpu_stats_struct(sample_interval_ms):
    psutil, err = _safe_import("psutil")
    if psutil is None:
        return {"error": f"psutil not available ({err})"}

    interval = max(sample_interval_ms, 0) / 1000.0
    cpu_percent = psutil.cpu_percent(interval=interval)
    per_core = psutil.cpu_percent(interval=None, percpu=True)
    mem = psutil.virtual_memory()
    swap = psutil.swap_memory()

    return {
        "total": cpu_percent,
        "per_core": per_core,
        "cores": len(per_core),
        "memory": {
            "percent": mem.percent,
            "used": mem.used,
            "total": mem.total,
        },
        "swap": {
            "percent": swap.percent,
            "used": swap.used,
            "total": swap.total,
        },
    }


def _memory_stats_struct():
    psutil, err = _safe_import("psutil")
    if psutil is None:
        return {"error": f"psutil not available ({err})"}

    mem = psutil.virtual_memory()
    return {
        "percent": mem.percent,
        "used": mem.used,
        "total": mem.total,
    }


def _cpu_stats(sample_interval_ms):
    data = _cpu_stats_struct(sample_interval_ms)
    if "error" in data:
        return f"CPU: {data['error']}"

    lines = [
        f"CPU: {data['total']:.1f}%",
        f"CPU cores: {data['cores']}",
        f"CPU per-core: {', '.join(f'{p:.1f}%' for p in data['per_core'])}",
        (
            "RAM: "
            f"{data['memory']['percent']:.1f}% "
            f"({_format_bytes(data['memory']['used'])}/"
            f"{_format_bytes(data['memory']['total'])})"
        ),
        (
            "Swap: "
            f"{data['swap']['percent']:.1f}% "
            f"({_format_bytes(data['swap']['used'])}/"
            f"{_format_bytes(data['swap']['total'])})"
        ),
    ]
    return "\n".join(lines)


def _gpu_stats_struct():
    pynvml, err = _safe_import("pynvml")
    if pynvml is not None:
        try:
            pynvml.nvmlInit()
            count = pynvml.nvmlDeviceGetCount()
            if count == 0:
                return {"provider": "nvidia_nvml", "gpus": []}
            gpus = []
            for idx in range(count):
                handle = pynvml.nvmlDeviceGetHandleByIndex(idx)
                name = pynvml.nvmlDeviceGetName(handle)
                mem = pynvml.nvmlDeviceGetMemoryInfo(handle)
                util = pynvml.nvmlDeviceGetUtilizationRates(handle)
                temp = pynvml.nvmlDeviceGetTemperature(
                    handle, pynvml.NVML_TEMPERATURE_GPU
                )
                gpus.append(
                    {
                        "index": idx,
                        "name": name.decode("utf-8", errors="ignore"),
                        "util_gpu": util.gpu,
                        "util_mem": util.memory,
                        "vram_used": mem.used,
                        "vram_total": mem.total,
                        "temp": temp,
                    }
                )
            return {"provider": "nvidia_nvml", "gpus": gpus}
        except Exception as exc:
            return {"error": f"NVML error ({exc})"}
        finally:
            try:
                pynvml.nvmlShutdown()
            except Exception:
                pass

    torch, torch_err = _safe_import("torch")
    if torch is None:
        return {
            "error": f"pynvml not available ({err}); torch not available ({torch_err})"
        }

    if not torch.cuda.is_available():
        if (
            _platform.system() == "Darwin"
            and hasattr(torch, "backends")
            and hasattr(torch.backends, "mps")
            and torch.backends.mps.is_available()
        ):
            allocated = _safe_call(
                lambda: int(getattr(torch.mps, "current_allocated_memory")()), 0
            )
            driver_alloc = _safe_call(
                lambda: int(getattr(torch.mps, "driver_allocated_memory")()), allocated
            )
            rec_max = _safe_call(
                lambda: int(getattr(torch.mps, "recommended_max_memory")()), 0
            )
            mem_total = _memory_stats_struct().get("total", 0)
            vram_total = rec_max if rec_max > 0 else mem_total
            vram_used = driver_alloc if driver_alloc > 0 else allocated
            vram_pct = (vram_used / vram_total * 100.0) if vram_total > 0 else 0.0

            extra = _apple_ioreg_stats()
            util_gpu = extra.get("util_gpu")
            if util_gpu is None and vram_pct > 1.0:
                # Fallback when macOS does not expose GPU utilization directly.
                util_gpu = min(100.0, max(0.0, vram_pct))
            status = "active" if (util_gpu or 0.0) > 5.0 or allocated > 0 else "idle"
            gpu = {
                "index": 0,
                "name": "Apple M-Series GPU (MPS)",
                "util_gpu": util_gpu,
                "util_mem": vram_pct,
                "vram_used": vram_used,
                "vram_total": vram_total,
                "temp": extra.get("temp"),
                "allocated": allocated,
                "status": status,
            }
            return {"provider": "apple_mps", "gpus": [gpu]}

        return {"provider": "torch", "gpus": []}

    gpus = []
    for idx in range(torch.cuda.device_count()):
        name = torch.cuda.get_device_name(idx)
        alloc = torch.cuda.memory_allocated(idx)
        reserved = torch.cuda.memory_reserved(idx)
        gpus.append(
            {
                "index": idx,
                "name": name,
                "allocated": alloc,
                "reserved": reserved,
            }
        )
    return {"provider": "torch", "gpus": gpus}


def _gpu_stats():
    data = _gpu_stats_struct()
    if "error" in data:
        return f"GPU: {data['error']}"

    if data["provider"] == "nvidia_nvml":
        if not data["gpus"]:
            return "GPU: no NVIDIA devices"
        lines = ["GPU (NVIDIA):"]
        for gpu in data["gpus"]:
            lines.append(
                f"  [{gpu['index']}] {gpu['name']}: "
                f"{gpu['util_gpu']}% GPU, {gpu['util_mem']}% MEM, "
                f"VRAM {gpu['vram_used'] / gpu['vram_total'] * 100:.1f}% "
                f"({_format_bytes(gpu['vram_used'])}/"
                f"{_format_bytes(gpu['vram_total'])}), "
                f"{gpu['temp']}C"
            )
        return "\n".join(lines)

    if data["provider"] == "apple_mps":
        if not data["gpus"]:
            return "GPU: no Apple MPS device"
        lines = ["GPU (Apple MPS):"]
        for gpu in data["gpus"]:
            vram_pct = (
                gpu["vram_used"] / gpu["vram_total"] * 100.0
                if gpu["vram_total"] > 0
                else 0.0
            )
            gpu_util = (
                f"{gpu['util_gpu']:.1f}%"
                if isinstance(gpu.get("util_gpu"), (int, float))
                else "N/A"
            )
            temp = (
                f"{gpu['temp']:.0f}C"
                if isinstance(gpu.get("temp"), (int, float))
                else "N/A"
            )
            lines.append(
                f"  [{gpu['index']}] {gpu['name']}: "
                f"{gpu_util} GPU, VRAM {vram_pct:.1f}% "
                f"({_format_bytes(gpu['vram_used'])}/"
                f"{_format_bytes(gpu['vram_total'])}), {temp}"
            )
        return "\n".join(lines)

    if not data["gpus"]:
        return "GPU: torch reports no CUDA device"

    lines = ["GPU (torch):"]
    for gpu in data["gpus"]:
        lines.append(
            f"  [{gpu['index']}] {gpu['name']}: allocated "
            f"{_format_bytes(gpu['allocated'])}, "
            f"reserved {_format_bytes(gpu['reserved'])}"
        )
    return "\n".join(lines)


def _build_stats_struct(sample_interval_ms):
    return {
        "ok": True,
        "memory": _memory_stats_struct(),
        "gpu": _gpu_stats_struct(),
    }


def _build_stats(sample_interval_ms):
    timestamp = _dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    header = [
        f"Time: {timestamp}",
        f"Host: {_platform.node()} ({_platform.system()} {_platform.release()})",
    ]
    cpu = _cpu_stats(sample_interval_ms)
    gpu = _gpu_stats()
    return "\n".join(header + [cpu, gpu])


@PromptServer.instance.routes.get("/performstat")
async def performstat_handler(request):
    sample_ms = request.query.get("sample_ms", "100")
    try:
        sample_ms = int(sample_ms)
    except ValueError:
        sample_ms = 100

    data = _build_stats_struct(sample_ms)
    return web.json_response(data)


class PerformanceStats:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "sample_interval_ms": (
                    "INT",
                    {"default": 100, "min": 0, "max": 1000, "step": 50},
                )
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("stats",)
    FUNCTION = "get_stats"
    CATEGORY = "utils/monitoring"

    def get_stats(self, sample_interval_ms=100):
        text = _build_stats(sample_interval_ms)
        return (text,)


NODE_CLASS_MAPPINGS = {"PerformanceStats": PerformanceStats}
NODE_DISPLAY_NAME_MAPPINGS = {"PerformanceStats": "Performance Stats (CPU/GPU)"}
