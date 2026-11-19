# Backend Dataset Marketplace (FastAPI + QC wav2vec2, CPU) — dùng chung cho máy ảo Azure (deploy/azure, scripts\deploy-azure.bat)
# và Hugging Face Spaces (deploy/huggingface, scripts\deploy-hf.bat).
# Ngữ cảnh build do script deploy dựng: backend/ (không có .env, .venv, tests), seed/, contracts/deployments/43113.json.
# Mọi bí mật (khóa relayer, JWT/TOKEN secret, DATABASE_URL, B2) truyền bằng biến môi trường lúc chạy — KHÔNG nằm trong image.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 PYTHONUTF8=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1

# Torch CPU trước (bản PyPI mặc định kèm CUDA, nặng vài GB), rồi các thư viện còn lại
COPY backend/requirements.txt /tmp/requirements.txt
RUN pip install --index-url https://download.pytorch.org/whl/cpu torch==2.6.0 torchaudio==2.6.0 \
 && pip install -r /tmp/requirements.txt

# Spaces chạy container bằng user uid 1000
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user HF_HOME=/home/user/.cache/huggingface

# Nạp sẵn model QC vào image: khởi động (và thức dậy sau khi Space ngủ) không phải tải lại ~380 MB
RUN python -c "from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor as P; m='nguyenvulebinh/wav2vec2-base-vietnamese-250h'; P.from_pretrained(m); Wav2Vec2ForCTC.from_pretrained(m)"

WORKDIR /app
COPY --chown=user backend /app/backend
COPY --chown=user seed /app/seed
COPY --chown=user contracts/deployments /app/contracts/deployments

WORKDIR /app/backend
EXPOSE 7860
# Một worker (vòng nền indexer chạy trong tiến trình). Sau proxy HTTPS của Spaces: lấy IP thật từ X-Forwarded-For (rate limit).
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860", "--proxy-headers", "--forwarded-allow-ips", "*"]
