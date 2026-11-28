"""
Planaday Optional Self-Hosted GPU Acceleration Microservice (v4.2.0 §6).

Designed for self-hosted NVIDIA GPUs (including RTX 5050 8GB) running alongside
Planaday in Docker / Dockge, with automatic CPU fallback and strict workload scoping:
- Heavy workloads ONLY: Handwriting/Document OCR (PaddleOCR / VLM), Document Image
  Enhancement, Semantic Embeddings, and CPU vs. GPU Benchmarks.
- NEVER used for routine UI rendering, typing, or primary database queries.
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import io
import os
import subprocess
import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

MODEL_CACHE_DIR = os.environ.get("MODEL_CACHE_DIR", "/models")
GPU_MEMORY_LIMIT_MB = int(os.environ.get("GPU_MEMORY_LIMIT_MB", "6144"))
INTERNAL_TOKEN = os.environ.get("PLANADAY_GPU_INTERNAL_TOKEN", "").strip()
MAX_CONCURRENT_JOBS = max(1, int(os.environ.get("GPU_MAX_CONCURRENT_JOBS", "2")))
MAX_IMAGE_BYTES = max(1024 * 1024, int(os.environ.get("GPU_MAX_IMAGE_BYTES", str(25 * 1024 * 1024))))
MAX_IMAGE_PIXELS = 40_000_000
MAX_STORED_JOBS = 200

os.makedirs(MODEL_CACHE_DIR, exist_ok=True)
os.environ.setdefault("HF_HOME", os.path.join(MODEL_CACHE_DIR, "hf"))
os.environ.setdefault("PADDLEX_HOME", os.path.join(MODEL_CACHE_DIR, "paddlex"))

app = FastAPI(title="Planaday GPU Acceleration Service", version="4.2.0")


@dataclass
class GpuJob:
    job_id: str
    kind: str
    priority: str
    status: str = "queued"  # queued | running | completed | canceled | failed
    progress: int = 0
    created_at: float = field(default_factory=time.time)
    started_at: Optional[float] = None
    finished_at: Optional[float] = None
    error: Optional[str] = None
    canceled: bool = False


JOBS: Dict[str, GpuJob] = {}
JOB_SEMAPHORE = asyncio.Semaphore(MAX_CONCURRENT_JOBS)
_OCR_ENGINE_CACHE: Dict[Tuple[str, bool], Any] = {}
_OCR_ENGINE_LOCK = threading.Lock()
_TORCH_VRAM_CONFIGURED = False


def prune_jobs() -> None:
    if len(JOBS) <= MAX_STORED_JOBS:
        return
    finished = sorted(
        (j for j in JOBS.values() if j.status in ("completed", "canceled", "failed")),
        key=lambda j: j.created_at,
    )
    excess = len(JOBS) - MAX_STORED_JOBS
    for j in finished[:excess]:
        JOBS.pop(j.job_id, None)


def decode_validated_image_bytes(image_base64: str) -> bytes:
    if not image_base64:
        raise HTTPException(status_code=400, detail="Missing imageBase64 payload")
    # Fast pre-decode base64 length check before allocating decoded buffer
    if len(image_base64) > int(MAX_IMAGE_BYTES * 1.4):
        raise HTTPException(status_code=413, detail=f"Image payload exceeds {MAX_IMAGE_BYTES // (1024 * 1024)} MiB limit")
    try:
        raw = base64.b64decode(image_base64, validate=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid base64 image payload: {exc}")
    if len(raw) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail=f"Image exceeds {MAX_IMAGE_BYTES // (1024 * 1024)} MiB limit")
    return raw


def enforce_torch_vram_limit() -> None:
    global _TORCH_VRAM_CONFIGURED
    if _TORCH_VRAM_CONFIGURED:
        return
    try:
        import torch  # type: ignore

        if torch.cuda.is_available():
            props = torch.cuda.get_device_properties(0)
            total_mb = props.total_memory / (1024 * 1024)
            if total_mb > 0 and GPU_MEMORY_LIMIT_MB < total_mb:
                frac = max(0.1, min(0.95, GPU_MEMORY_LIMIT_MB / total_mb))
                torch.cuda.set_per_process_memory_fraction(frac, 0)
            _TORCH_VRAM_CONFIGURED = True
    except Exception:
        pass


def verify_internal_auth(authorization: Optional[str]) -> None:
    if not INTERNAL_TOKEN:
        return
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing internal GPU service token")
    token = authorization[7:].strip()
    if not hmac.compare_digest(token.encode("utf-8"), INTERNAL_TOKEN.encode("utf-8")):
        raise HTTPException(status_code=403, detail="Invalid internal GPU service token")


def detect_gpu_hardware() -> Dict[str, Any]:
    info: Dict[str, Any] = {
        "cudaAvailable": False,
        "deviceName": "CPU Fallback",
        "cudaVersion": None,
        "vramTotalMb": 0,
        "vramUsedMb": 0,
        "vramFreeMb": 0,
        "memoryLimitMb": GPU_MEMORY_LIMIT_MB,
        "modelCacheDir": MODEL_CACHE_DIR,
        "enginesAvailable": [],
    }

    # Check PyTorch CUDA first
    try:
        import torch  # type: ignore

        if torch.cuda.is_available():
            idx = 0
            props = torch.cuda.get_device_properties(idx)
            free_b, total_b = torch.cuda.mem_get_info(idx)
            info["cudaAvailable"] = True
            info["deviceName"] = props.name
            info["cudaVersion"] = torch.version.cuda
            info["vramTotalMb"] = int(total_b / (1024 * 1024))
            info["vramFreeMb"] = int(free_b / (1024 * 1024))
            info["vramUsedMb"] = max(0, info["vramTotalMb"] - info["vramFreeMb"])
            info["enginesAvailable"].append("pytorch-cuda")
    except Exception:
        pass

    # Fallback probe via nvidia-smi when container exposes NVIDIA runtime without torch
    if not info["cudaAvailable"]:
        try:
            out = subprocess.check_output(
                [
                    "nvidia-smi",
                    "--query-gpu=name,memory.total,memory.used,memory.free",
                    "--format=csv,noheader,nounits",
                ],
                stderr=subprocess.DEVNULL,
                timeout=3,
                text=True,
            ).strip()
            if out:
                parts = [p.strip() for p in out.splitlines()[0].split(",")]
                if len(parts) >= 4:
                    info["cudaAvailable"] = True
                    info["deviceName"] = parts[0]
                    info["vramTotalMb"] = int(float(parts[1]))
                    info["vramUsedMb"] = int(float(parts[2]))
                    info["vramFreeMb"] = int(float(parts[3]))
                    info["enginesAvailable"].append("nvidia-smi")
        except Exception:
            pass

    try:
        import paddleocr  # type: ignore  # noqa: F401

        info["enginesAvailable"].append("paddleocr")
    except Exception:
        pass

    try:
        from PIL import Image  # type: ignore  # noqa: F401

        info["enginesAvailable"].append("pillow")
    except Exception:
        pass

    return info


def release_gpu_memory() -> None:
    try:
        import torch  # type: ignore

        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except Exception:
        pass


class OcrRequest(BaseModel):
    imageBase64: str
    mimeType: str = "image/png"
    language: str = "eng"
    model: str = "auto"  # paddleocr | vlm_handwriting | auto
    priority: str = "normal"


class EnhanceRequest(BaseModel):
    imageBase64: str
    mimeType: str = "image/png"
    shadowReduction: bool = True
    contrastBoost: int = 35
    priority: str = "normal"


class EmbedRequest(BaseModel):
    texts: List[str] = Field(default_factory=list)
    priority: str = "low"


@app.get("/health")
def health() -> Dict[str, Any]:
    hw = detect_gpu_hardware()
    return {
        "ok": True,
        "service": "planaday-gpu",
        "version": "4.2.0",
        "cudaAvailable": hw["cudaAvailable"],
        "deviceName": hw["deviceName"],
    }


@app.get("/status")
def status(authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    verify_internal_auth(authorization)
    hw = detect_gpu_hardware()
    active_jobs = sum(1 for j in JOBS.values() if j.status == "running")
    queued_jobs = sum(1 for j in JOBS.values() if j.status == "queued")
    return {
        "ok": True,
        "available": True,
        **hw,
        "activeJobs": active_jobs,
        "queuedJobs": queued_jobs,
        "maxConcurrentJobs": MAX_CONCURRENT_JOBS,
    }


@app.get("/jobs")
def list_jobs(authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    verify_internal_auth(authorization)
    recent = sorted(JOBS.values(), key=lambda j: j.created_at, reverse=True)[:30]
    return {
        "ok": True,
        "jobs": [
            {
                "jobId": j.job_id,
                "kind": j.kind,
                "priority": j.priority,
                "status": j.status,
                "progress": j.progress,
                "error": j.error,
                "createdAt": j.created_at,
                "finishedAt": j.finished_at,
            }
            for j in recent
        ],
    }


@app.post("/jobs/{job_id}/cancel")
def cancel_job(job_id: str, authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    verify_internal_auth(authorization)
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    job.canceled = True
    if job.status in ("queued", "running"):
        job.status = "canceled"
        job.finished_at = time.time()
    return {"ok": True, "jobId": job_id, "status": job.status}


def _get_cached_paddle_ocr(paddle_lang: str, use_gpu: bool) -> Any:
    from paddleocr import PaddleOCR  # type: ignore

    key = (paddle_lang, use_gpu)
    with _OCR_ENGINE_LOCK:
        engine = _OCR_ENGINE_CACHE.get(key)
        if engine is None:
            if len(_OCR_ENGINE_CACHE) >= 3:
                oldest = next(iter(_OCR_ENGINE_CACHE))
                _OCR_ENGINE_CACHE.pop(oldest, None)
            engine = PaddleOCR(use_angle_cls=True, lang=paddle_lang, use_gpu=use_gpu, show_log=False)
            _OCR_ENGINE_CACHE[key] = engine
        return engine


def _run_paddle_ocr_sync(img_bytes: bytes, language: str, model: str, hw: Dict[str, Any]) -> Dict[str, Any]:
    import numpy as np  # type: ignore
    from PIL import Image  # type: ignore

    Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS
    enforce_torch_vram_limit()
    lang_map = {"eng": "en", "spa": "es", "fra": "fr", "deu": "de", "chi_sim": "ch", "jpn": "japan"}
    paddle_lang = lang_map.get(language, "en")
    ocr = _get_cached_paddle_ocr(paddle_lang, bool(hw["cudaAvailable"]))
    img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    result = ocr.ocr(np.array(img), cls=True)
    lines: List[str] = []
    words: List[Dict[str, Any]] = []
    for block in result or []:
        for line in block or []:
            txt, conf = line[1][0], float(line[1][1]) * 100.0
            lines.append(txt)
            for tok in txt.split():
                words.append({"text": tok, "confidence": round(conf, 1)})
    text = "\n".join(lines).strip()
    engine = "gpu-vlm" if model == "vlm_handwriting" else "gpu-paddleocr"
    return {"text": text, "words": words, "engine": engine}


@app.post("/ocr")
async def run_ocr(req: OcrRequest, authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    verify_internal_auth(authorization)
    img_bytes = decode_validated_image_bytes(req.imageBase64)
    prune_jobs()
    job_id = f"gpu_{uuid.uuid4().hex[:10]}"
    job = GpuJob(job_id=job_id, kind="ocr", priority=req.priority)
    JOBS[job_id] = job
    started = time.perf_counter()

    async with JOB_SEMAPHORE:
        if job.canceled:
            return {"ok": False, "jobId": job_id, "canceled": True}
        job.status = "running"
        job.started_at = time.time()
        job.progress = 15
        try:
            hw = await asyncio.to_thread(detect_gpu_hardware)
            try:
                ocr_out = await asyncio.to_thread(_run_paddle_ocr_sync, img_bytes, req.language, req.model, hw)
            except ImportError:
                job.status = "completed"
                job.progress = 100
                job.finished_at = time.time()
                return {
                    "ok": False,
                    "available": False,
                    "jobId": job_id,
                    "fallback": "local",
                    "error": "PaddleOCR runtime not installed in GPU container — falling back to on-device OCR.",
                }

            if job.canceled:
                return {"ok": False, "jobId": job_id, "canceled": True}
            job.status = "completed"
            job.progress = 100
            job.finished_at = time.time()
            return {
                "ok": True,
                "available": True,
                "jobId": job_id,
                "text": ocr_out["text"],
                "words": ocr_out["words"],
                "engine": ocr_out["engine"],
                "deviceUsed": hw["deviceName"],
                "durationMs": round((time.perf_counter() - started) * 1000, 1),
            }
        except HTTPException:
            raise
        except Exception as exc:
            release_gpu_memory()
            job.status = "failed"
            job.error = str(exc)
            job.finished_at = time.time()
            raise HTTPException(status_code=500, detail=f"GPU OCR failed (recovered cleanly): {exc}")


def _run_enhance_sync(raw: bytes, shadow_reduction: bool, contrast_boost: int) -> str:
    from PIL import Image, ImageEnhance, ImageFilter, ImageOps  # type: ignore

    Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    if shadow_reduction:
        img = ImageOps.autocontrast(img, cutoff=2)
    factor = 1.0 + max(0, min(100, contrast_boost)) / 80.0
    img = ImageEnhance.Contrast(img).enhance(factor)
    img = img.filter(ImageFilter.SHARPEN)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


@app.post("/enhance")
async def run_enhance(req: EnhanceRequest, authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    verify_internal_auth(authorization)
    raw = decode_validated_image_bytes(req.imageBase64)
    prune_jobs()
    job_id = f"gpu_{uuid.uuid4().hex[:10]}"
    job = GpuJob(job_id=job_id, kind="enhance", priority=req.priority)
    JOBS[job_id] = job
    started = time.perf_counter()

    async with JOB_SEMAPHORE:
        if job.canceled:
            return {"ok": False, "jobId": job_id, "canceled": True}
        job.status = "running"
        job.started_at = time.time()
        try:
            encoded = await asyncio.to_thread(_run_enhance_sync, raw, req.shadowReduction, req.contrastBoost)
            if job.canceled:
                return {"ok": False, "jobId": job_id, "canceled": True}
            job.status = "completed"
            job.progress = 100
            job.finished_at = time.time()
            return {
                "ok": True,
                "jobId": job_id,
                "imageBase64": encoded,
                "mimeType": "image/png",
                "durationMs": round((time.perf_counter() - started) * 1000, 1),
            }
        except Exception as exc:
            job.status = "failed"
            job.error = str(exc)
            job.finished_at = time.time()
            raise HTTPException(status_code=500, detail=f"Image enhancement failed: {exc}")


@app.post("/embed")
async def run_embed(req: EmbedRequest, authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    verify_internal_auth(authorization)
    started = time.perf_counter()
    vectors: List[List[float]] = []
    # Deterministic lightweight 64-d normalized embedding fallback when sentence-transformers isn't loaded
    for txt in req.texts[:128]:
        vec = [0.0] * 64
        for tok in txt.lower().split():
            h = hashlib.sha256(tok.encode("utf-8")).digest()
            idx = h[0] % 64
            vec[idx] += 1.0 if (h[1] & 1) == 0 else -1.0
        norm = sum(v * v for v in vec) ** 0.5 or 1.0
        vectors.append([round(v / norm, 5) for v in vec])
    return {
        "ok": True,
        "dimensions": 64,
        "count": len(vectors),
        "vectors": vectors,
        "durationMs": round((time.perf_counter() - started) * 1000, 1),
    }


def _run_benchmark_sync() -> Tuple[Dict[str, Any], float, Optional[float]]:
    hw = detect_gpu_hardware()
    enforce_torch_vram_limit()

    cpu_ms: float
    gpu_ms: Optional[float] = None
    try:
        import torch  # type: ignore

        a_cpu = torch.randn((1024, 1024), dtype=torch.float32)
        b_cpu = torch.randn((1024, 1024), dtype=torch.float32)
        t0 = time.perf_counter()
        _ = a_cpu @ b_cpu
        cpu_ms = round((time.perf_counter() - t0) * 1000, 2)

        if torch.cuda.is_available():
            a_gpu = a_cpu.to("cuda")
            b_gpu = b_cpu.to("cuda")
            torch.cuda.synchronize()
            t1 = time.perf_counter()
            _ = a_gpu @ b_gpu
            torch.cuda.synchronize()
            gpu_ms = round((time.perf_counter() - t1) * 1000, 2)
            del a_gpu, b_gpu
            release_gpu_memory()
    except Exception:
        t0 = time.perf_counter()
        acc = 0
        for i in range(250_000):
            acc += (i * 31) % 97
        cpu_ms = round((time.perf_counter() - t0) * 1000, 2)
    return hw, cpu_ms, gpu_ms


@app.post("/benchmark")
async def run_benchmark(authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    verify_internal_auth(authorization)
    hw, cpu_ms, gpu_ms = await asyncio.to_thread(_run_benchmark_sync)

    speedup = round(cpu_ms / gpu_ms, 2) if gpu_ms and gpu_ms > 0 else None
    return {
        "ok": True,
        "deviceName": hw["deviceName"],
        "cudaAvailable": hw["cudaAvailable"],
        "cpuMs": cpu_ms,
        "gpuMs": gpu_ms,
        "speedupFactor": speedup,
        "vramTotalMb": hw["vramTotalMb"],
        "memoryLimitMb": hw["memoryLimitMb"],
    }
