FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY monitoring/requirements.txt /app/monitoring/requirements.txt
RUN pip install --no-cache-dir -r /app/monitoring/requirements.txt

# Copy codebase
COPY backend /app/backend
COPY monitoring /app/monitoring

ENV PYTHONPATH=/app
ENV PORT=8080

EXPOSE 8080

CMD ["uvicorn", "monitoring.main:app", "--host", "0.0.0.0", "--port", "8080"]
