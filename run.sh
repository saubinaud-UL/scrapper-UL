#!/bin/bash
# Script para ejecutar la aplicación UnaLuka de forma sencilla

# Obtener directorio del script
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

# Verificar si estamos en Docker (Si es así, no usamos venv porque ya instalamos global)
if [ "$IN_DOCKER" = "true" ]; then
    echo "🐳 Modo Docker detectado. Usando entorno global Python..."
else
    # Verificar si existe el entorno virtual (Modo Local)
    if [ ! -d "venv" ]; then
        echo "⚠️  Entorno virtual no detectado. Creando..."
        python3 -m venv venv
        source venv/bin/activate
        echo "📦 Instalando dependencias..."
        pip install -r requirements.txt
    else
        source venv/bin/activate
    fi
fi

# Ejecutar la API en segundo plano
echo "🚀 Iniciando API (Puerto 8000)..."
python api.py > api.log 2>&1 &
API_PID=$!

# Ejecutar Streamlit en primer plano
echo "🚀 Iniciando Frontend (Puerto 8501)..."
streamlit run app.py --server.port 8501 --server.address 0.0.0.0

# Al salir, matar la API también
kill $API_PID
