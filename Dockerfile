FROM mcr.microsoft.com/playwright/python:v1.40.0-jammy

WORKDIR /app

# Copiar requirements primero para aprovechar caché
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar el resto del código
COPY . .

# Asegurar que el script de inicio sea ejecutable
RUN chmod +x run.sh

# Instalar navegadores (aunque la imagen base ya debería tenerlos, esto asegura consistencia)
RUN playwright install chromium
RUN playwright install-deps

# Exponer puertos
# 8501: Streamlit
# 8000: FastAPI
EXPOSE 8501 8000

# Variables de entorno
ENV PYTHONUNBUFFERED=1
ENV IN_DOCKER=true

# Comando de inicio
CMD ["./run.sh"]
