# 💰 Comparador de Precios - UnaLuka

Sistema de scraping y comparación de precios para e-commerce peruano.

## 📋 Descripción

Herramienta para el equipo de pricing de UnaLuka que permite comparar precios contra la competencia (Falabella, Juntoz, Oechsle, MercadoLibre) y tomar decisiones de repricing.

## 🚀 Instalación

```bash
# Clonar el repositorio
cd price_scraper

# Instalar dependencias
pip install -r requirements.txt
```

## 💻 Uso

```bash
# Ejecutar la aplicación
streamlit run app.py

# La app estará disponible en http://localhost:8501
```

## 📁 Estructura del proyecto

```
price_scraper/
├── scrapers/
│   ├── __init__.py       # Exports
│   ├── base.py           # Clase base abstracta
│   ├── falabella.py      # Scraper Falabella
│   ├── juntoz.py         # Scraper Juntoz
│   ├── oechsle.py        # Scraper Oechsle
│   └── mercadolibre.py   # Scraper MercadoLibre (API)
├── app.py                # Frontend Streamlit
├── config.py             # Configuración centralizada
├── utils.py              # Funciones auxiliares
├── requirements.txt      # Dependencias
└── README.md             # Este archivo
```

## 🎯 Funcionalidades

- **Búsqueda multi-tienda**: Busca en 4 tiendas simultáneamente
- **Comparación de precios**: Índice de competitividad visual
- **Exportación CSV**: Descarga resultados para análisis
- **Historial**: Guarda búsquedas de la sesión

## 📊 Índice de Competitividad

| Índice | Color | Significado |
|--------|-------|-------------|
| < 0.95 | ✅ Verde | Somos más baratos |
| 0.95 - 1.05 | ➖ Naranja | Precio similar |
| > 1.05 | ⚠️ Rojo | Somos más caros |

## 🔧 Configuración

Edita `config.py` para ajustar:
- User agents para rotación
- Timeouts de requests
- Delays entre peticiones
- Número de reintentos

## ⚠️ Notas

- **Juntoz y Oechsle**: Los scrapers son placeholders y requieren ajustes según la estructura real de cada sitio
- **Rate limiting**: Respeta los delays configurados para evitar bloqueos
- **MercadoLibre**: Usa API pública, más confiable que scraping HTML

## 📄 Licencia

Uso interno - UnaLuka
