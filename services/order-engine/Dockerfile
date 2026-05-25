FROM python:3.12-slim

WORKDIR /app

COPY pyproject.toml .
RUN pip install uv && \
    uv pip compile pyproject.toml --extra gemini -o /tmp/requirements.txt && \
    uv pip install --system -r /tmp/requirements.txt

COPY . .

EXPOSE 8000
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
