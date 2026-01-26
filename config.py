"""
Configuración centralizada para el sistema de scraping.
"""
import random
from fake_useragent import UserAgent


# Timeouts y delays
REQUEST_TIMEOUT = 15
MIN_DELAY = 1.5
MAX_DELAY = 4.0
MAX_RETRIES = 3


def get_random_user_agent():
    """Retorna un User-Agent aleatorio usando fake_useragent, con un fallback."""
    try:
        ua = UserAgent()
        return ua.random
    except Exception:
        # Fallback User-Agent if fake_useragent fails (e.g., no internet, first run)
        return 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'


def get_headers() -> dict:
    """Retorna headers realistas con User-Agent aleatorio."""
    return {
        'User-Agent': get_random_user_agent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'es-PE,es-419;q=0.9,es;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Cache-Control': 'max-age=0',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
    }


def get_json_headers() -> dict:
    """Retorna headers para peticiones JSON/API."""
    return {
        'User-Agent': get_random_user_agent(),
        'Accept': 'application/json',
        'Accept-Language': 'es-PE,es;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
    }

# Configuración de Base de Datos
# Por defecto usa SQLite local, pero puede cambiarse por Postgres/MySQL url
DATABASE_URL = "sqlite:///prices.db"
