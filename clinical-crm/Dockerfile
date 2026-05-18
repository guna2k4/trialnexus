FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y gcc && rm -rf /var/lib/apt/lists/*

COPY clinical-crm/ .
COPY brain/ ../brain/

RUN pip install --no-cache-dir fastapi uvicorn python-dotenv google-genai elasticsearch openai pydantic python-multipart tavily-python

EXPOSE 8000

CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000"]
