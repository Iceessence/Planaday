# Planaday Optional Self-Hosted GPU Acceleration Service (RTX 5050 / CUDA)

This microservice is **100% optional**. Planaday runs completely offline and full-featured without it (using on-device `tesseract.js` OCR and client-side Canvas image enhancement).

When enabled on a Docker/Dockge host equipped with an NVIDIA GPU (such as an **NVIDIA RTX 5050 8GB**), it accelerates heavy workloads ONLY:
- Handwriting & multi-page document OCR (`PaddleOCR` / VLM mode)
- Heavy document image enhancement & shadow removal
- Local document embeddings for semantic clustering
- Timed CPU vs. GPU benchmarks

Routine UI actions, note typing, calendar views, and database queries **never** call the GPU service.

## Quick Start with Dockge / Docker Compose Overlay

Ensure the NVIDIA Container Toolkit is installed on your Linux/TrueNAS/Docker host, then run:

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build
```

Environment variables:
- `GPU_MEMORY_LIMIT_MB=6144` (safe default for 8GB RTX 5050 VRAM)
- `MODEL_CACHE_DIR=/models` (mapped to persistent volume `planaday_gpu_models` so downloaded models survive container updates)
- `PLANADAY_GPU_INTERNAL_TOKEN` (shared secret between Planaday server and `planaday-gpu` container)
