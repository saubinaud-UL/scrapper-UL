# UnaLuka - Sistema de Aprobación de Precios

Sistema web para revisar y aprobar cambios de precios sugeridos por el scraper de competencia.

## 🚀 Deploy Rápido (DigitalOcean)

### Opción 1: Docker (Recomendado)

```bash
# Construir imagen
docker build -t unaluka-prices .

# Ejecutar contenedor
docker run -d -p 3000:3000 --name unaluka-prices unaluka-prices
```

### Opción 2: Docker Compose

```bash
docker-compose up -d
```

### Opción 3: Node.js directo

```bash
npm install
npm start
```

---

## 📊 API Endpoints

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `GET` | `/api/products` | Lista productos pendientes |
| `GET` | `/api/stats` | Estadísticas (cantidad, última carga) |
| `POST` | `/api/sync` | Sincronizar productos desde n8n |
| `POST` | `/api/decisions` | Registrar aprobación/rechazo |
| `POST` | `/api/undo` | Deshacer última decisión |
| `GET` | `/api/decisions` | Obtener decisiones (para n8n) |
| `POST` | `/api/seed` | Generar 200 productos de prueba |
| `DELETE` | `/api/reset` | Limpiar todos los datos |

---

## 🔄 Flujo de Trabajo

```
┌─────────────┐     POST /api/sync      ┌──────────────┐
│    n8n      │ ──────────────────────► │   Backend    │
│  (Scraper)  │                         │  (Express)   │
└─────────────┘                         └──────┬───────┘
                                               │
                                               ▼
                                        ┌──────────────┐
                                        │   Frontend   │
                                        │ (200+ cards) │
                                        └──────┬───────┘
                                               │
                              Aprobar/Rechazar │
                                               ▼
                                        ┌──────────────┐
                                        │  Decisiones  │
                                        │  guardadas   │
                                        └──────┬───────┘
                                               │
                              GET /api/decisions│
                                               ▼
┌─────────────┐                         ┌──────────────┐
│    n8n      │ ◄────────────────────── │   Backend    │
│  (Aplica)   │                         │              │
└─────────────┘                         └──────────────┘
```

---

## 📦 Formato de Datos

### Sincronizar productos (desde n8n)

```bash
POST /api/sync
Content-Type: application/json

[
  {
    "sku": "APPLE-001",
    "name": "iPhone 15 Pro Max",
    "competitor_price_usd": 999,
    "competitor_price_local": 3796,
    "current_price_usd": 1099,
    "current_price_local": 4176,
    "margin_percentage": 10
  }
]
```

### Obtener decisiones (para n8n)

```bash
GET /api/decisions

# Respuesta:
[
  {
    "sku": "APPLE-001",
    "decision": "approved",
    "decided_at": "2024-01-27T22:30:00.000Z",
    "name": "iPhone 15 Pro Max",
    "competitor_price_usd": 999,
    "current_price_usd": 1099
  }
]
```

---

## ⚙️ Variables de Entorno

| Variable | Valor por defecto | Descripción |
|----------|-------------------|-------------|
| `PORT` | `3000` | Puerto del servidor |

---

## 🛠️ Estructura del Proyecto

```
├── server.js          # Backend Express + API
├── app.js             # Frontend JavaScript (virtual scrolling)
├── index.html         # Estructura HTML
├── styles.css         # Estilos (grid, toasts, undo)
├── logo.svg           # Logo UnaLuka
├── Dockerfile         # Para deploy con Docker
├── docker-compose.yml # Deploy simplificado
└── package.json       # Dependencias
```

---

## 📱 Funcionalidades Frontend

- **Virtual Scrolling**: Maneja 200+ productos sin lag
- **Grid 3 columnas**: Layout responsivo
- **Toast Notifications**: Feedback visual de acciones
- **Botón Deshacer**: Recuperar última acción
- **Animaciones**: Transiciones suaves

---

## 🌐 Deploy en DigitalOcean

### App Platform (más fácil)

1. Conecta tu repo de GitHub
2. Selecciona "Docker" como tipo
3. Puerto: `3000`
4. Deploy automático

### Droplet (más control)

```bash
# En el servidor
git clone <tu-repo>
cd scrapper-UL
docker-compose up -d
```

---

## 📝 Notas

- Los datos se guardan en memoria (se pierden al reiniciar)
- Para persistencia, migrar a PostgreSQL 17 (preparado en estructura)
- El sistema está listo para integrarse con n8n
