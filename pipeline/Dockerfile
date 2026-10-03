# Worker sandbox: everything the director agent and the render pipeline need, nothing else.
# One container per job; the job directory is mounted at /job.
FROM node:22-bookworm

ENV DEBIAN_FRONTEND=noninteractive \
    PIPELINE_HOME=/opt/pipeline \
    PIPELINE_PYTHON=/opt/venv/bin/python \
    HF_HOME=/opt/models \
    HYPERFRAMES_NO_TELEMETRY=1 \
    DISABLE_AUTOUPDATER=1

# Media + PDF tooling, Python, and the shared libraries headless Chrome needs.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg poppler-utils python3 python3-venv ca-certificates fonts-dejavu-core \
      libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 \
      libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2 libdbus-1-3 libexpat1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /tmp/requirements.txt
RUN python3 -m venv /opt/venv && /opt/venv/bin/pip install --no-cache-dir -r /tmp/requirements.txt \
    && mkdir -p /opt/models && /opt/venv/bin/python -c "from faster_whisper import WhisperModel; WhisperModel('small.en', device='cpu', compute_type='int8')" \
    && chown -R node:node /opt/models

RUN npm install -g --no-fund --no-audit hyperframes@0.8.114 @anthropic-ai/claude-code

COPY --chown=node:node . /opt/pipeline
RUN cd /opt/pipeline && rm -rf .venv node_modules && npm install --omit=dev --no-fund --no-audit && chmod +x run-job.sh bin/*

USER node
# HyperFrames' pinned Chrome (also used to print the PDF), and the local fallback voice model.
ENV HYPERFRAMES_PYTHON=/opt/venv/bin/python
RUN hyperframes browser ensure && mkdir -p "$HOME/.claude" \
    && hyperframes tts "Ready." -o /tmp/voice-check.wav && rm /tmp/voice-check.wav
ENV PATH=/opt/pipeline/bin:$PATH
WORKDIR /job
ENTRYPOINT ["/opt/pipeline/run-job.sh"]
CMD ["/job"]
