FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    MODEL_CACHE_DIR=/models \
    GPU_MEMORY_LIMIT_MB=6144 \
    PORT=8100

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip libgl1 libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt /app/requirements.txt
RUN pip3 install --no-cache-dir -r /app/requirements.txt

# Optionally pre-install GPU OCR weights if BUILD_WITH_PADDLEOCR=1
ARG BUILD_WITH_PADDLEOCR=0
RUN if [ "$BUILD_WITH_PADDLEOCR" = "1" ]; then \
      pip3 install --no-cache-dir paddleocr paddlepaddle-gpu; \
    fi

COPY app.py /app/app.py
RUN mkdir -p /models

EXPOSE 8100
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8100"]
