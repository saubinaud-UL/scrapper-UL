import re
import urllib.parse
from typing import Optional, List
import unicodedata


def normalize_query(query: str) -> str:
    """
    Normaliza la query de búsqueda:
    - Elimina acentos
    - Convierte a minúsculas
    - Codifica para URL
    """
    if not query:
        return ""
    
    # Normalizar unicode (eliminar acentos)
    text = unicodedata.normalize('NFKD', query).encode('ASCII', 'ignore').decode('utf-8')
    text = text.lower().strip()
    return text


def clean_product_name(name: str) -> str:
    """
    Limpia el nombre del producto para mejorar la búsqueda.
    Elimina 'regalos', 'ofertas', '+ cosas', parentesis, etc.
    """
    if not name:
        return ""
        
    # 1. Eliminar todo lo que esté después de un "+" o "-" o "|"
    name = re.split(r'[\+\|]', name)[0]
    
    # 3. Eliminar palabras "marketing"
    stop_words = [
        r'\boferta\b', r'\bpromo\b', r'\bregalo\b', r'\bgratis\b', 
        r'\benv[ií]o\b', r'\bdiscount\b', r'\bdscto\b', r'\boficial\b',
        r'\boriginal\b', r'\blibre\b', r'\bfabrica\b',
        r' de fabrica', r' copia'
    ]
    
    clean_name = name
    for word in stop_words:
        clean_name = re.sub(word, '', clean_name, flags=re.IGNORECASE)
        
    # 4. Limpiar espacios extra
    clean_name = re.sub(r'\s+', ' ', clean_name).strip()
    
    return clean_name


def parse_price(text: str) -> Optional[float]:
    """
    Convierte texto de precio peruano a float.
    """
    if not text:
        return None
    
    text = str(text).strip()
    patterns = [
        r'S/?\s*\.?\s*([\d,]+(?:\.\d{2})?)',
        r'([\d,]+(?:\.\d{2})?)\s*(?:soles?)?',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            price_str = match.group(1).replace(',', '')
            try:
                return float(price_str)
            except ValueError:
                continue
    return None


def truncate_text(text: str, max_length: int = 60) -> str:
    """
    Trunca texto agregando ... si excede el límite.
    """
    if not text:
        return ""
    if len(text) <= max_length:
        return text
    return text[:max_length - 3] + "..."


def format_price(price: float) -> str:
    return f"S/ {price:,.2f}"


def calculate_competitiveness(precio_unaluka: float, precio_competencia: float) -> dict:
    if precio_competencia <= 0:
        return {
            'indice': 0,
            'color': 'gray',
            'emoji': '❓',
            'texto': 'Sin datos',
            'diferencia_pct': 0
        }
    
    indice = precio_unaluka / precio_competencia
    diferencia_pct = ((precio_competencia - precio_unaluka) / precio_competencia) * 100
    
    if indice < 0.95:
        color = 'green'
        emoji = '✅'
        texto = 'Somos más baratos'
    elif indice > 1.05:
        color = 'red'
        emoji = '⚠️'
        texto = 'Somos más caros'
    else:
        color = 'orange'
        emoji = '➖'
        texto = 'Precio similar'
    
    return {
        'indice': round(indice, 2),
        'color': color,
        'emoji': emoji,
        'texto': texto,
        'diferencia_pct': round(diferencia_pct, 1)
    }


def extract_keywords(name: str) -> list[str]:
    """
    Extrae palabras clave importantes de cualquier producto.
    """
    if not name:
        return []

    # 1. Normalizar
    name_lower = name.lower()
    
    # 2. Conservar números
    name_clean = re.sub(r'[\(\)\[\]\-\+\/\|\,\.]', ' ', name_lower)
    
    # 3. Eliminar palabras genéricas
    stop_words = {
        'nuevo', 'new', 'original', 'oferta', 'offer', 'promo', 'regalo', 'gift',
        'envio', 'shipping', 'gratis', 'free', 'discount', 'descuento',
        'de', 'para', 'for', 'con', 'with', 'the', 'and', 'y', 'en', 'in', 'on', 'a',
        'sellado', 'sealed', 'caja', 'box', 'unlocked', 'liberado',
        'garantia', 'warranty', 'stock', 'entrega', 'delivery',
        '2024', '2025', '2023', 'año', 'year', 'version', 'global',
        'mejor', 'best', 'top', 'calidad', 'quality', 'precio', 'price',
        'color', 'colour', 'talla', 'size', 'modelo', 'model'
    }
    
    words = name_clean.split()
    keywords = []
    
    for w in words:
        if w in stop_words or len(w) < 2:
            continue
        keywords.append(w)
            
    return keywords[:8]


def check_relevance(product_name: str, query: str) -> bool:
    """
    Verifica relevancia usando coincidencia estricta.
    """
    if not product_name or not query:
        return False
        
    query_keywords = extract_keywords(query)
    
    if not query_keywords:
        return True
        
    product_name_norm = product_name.lower()
    product_keywords = set(extract_keywords(product_name))
    
    matches = 0
    
    for qk in query_keywords:
        if any(qk in pk for pk in product_keywords):
            matches += 1
                
    # Calcular score
    match_ratio = matches / len(query_keywords)
    
    # --- REGLA 0: Modificadores Críticos (Pro, Max, Ultra, Plus, Mini, Air) ---
    # Si la query dice "Pro", el producto DEBE decir "Pro".
    # Importante para distinguir "MacBook Air" de "MacBook Pro".
    critical_modifiers = ['pro', 'max', 'ultra', 'plus', 'mini', 'air', 'lite', 'se']
    for mod in critical_modifiers:
        # Check boundary to avoid finding 'pro' in 'protector'
        if f" {mod} " in f" {query.lower()} ":
             # Buscar en producto (con boundaries)
             if f" {mod}" not in f" {product_name_norm} " and f"{mod} " not in f" {product_name_norm} ":
                 return False

    # --- REGLA 1: STRICT NUMBER/MODEL CHECK ---
    for qk in query_keywords:
        is_year = qk.isdigit() and len(qk) == 4
        is_model = any(c.isdigit() for c in qk) and len(qk) < 6
        
        if is_year or is_model:
            found = False
            for pk in product_keywords:
                if qk in pk:
                    found = True
                    break
            
            if not found:
                if is_year: return False
                if len(qk) <= 3: return False 

    # --- REGLA 2: Matching Ratio (Aumentado a 66%) ---
    if match_ratio < 0.66:
        return False
        
    # --- REGLA 3: Lista Negra Accesorios ---
    accessories = [
        'funda', 'case', 'carcasa', 'protector', 'mica', 'vidrio', 
        'correa', 'banda', 'soporte', 'cable', 'cargador', 'adaptador',
        'repuesto', 'pantalla lcd', 'display', 'bateria', 'teclado para',
        'mouse pad', 'skin', 'sticker', 'cover', 'holder', 'stand',
        'dock', 'hub', 'sleeve', 'bolsa', 'mochila', 'estuche',
        'conjunto de pantalla', 'lcd screen', 'replacement',
        'control', 'juego de', 'kit de', 'set de', 'partes',
        'remote', 'controller', 'joystick', 'mando', 'dualsense',
        'glass', 'tempered', 'silicone', 'bumper', 'film', 'charger',
        'mount', 'strap', 'band', 'keyboard for'
    ]
    
    query_lower = query.lower()
    
    for acc in accessories:
        if acc in product_name_norm and acc not in query_lower:
            return False
            
    # --- REGLA 4: Marcas Conocidas ---
    known_brands = [
        'apple', 'samsung', 'sony', 'lg', 'hp', 'dell', 'lenovo', 'asus', 'acer',
        'microsoft', 'google', 'huawei', 'xiaomi', 'oppo', 'realme', 'motorola',
        'nokia', 'philips', 'panasonic', 'toshiba', 'canon', 'nikon', 'bose',
        'jbl', 'beats', 'logitech', 'razer', 'corsair', 'nintendo', 'playstation',
        'xbox', 'macbook', 'iphone', 'ipad', 'airpods', 'galaxy', 'pixel',
        'mac', 'dior', 'chanel', 'zara', 'nike', 'adidas', 'lego', 'barbie', 'funko',
        'casio', 'garmin', 'rolex', 'omega', 'seiko'
    ]
    
    for brand in known_brands:
        if brand in query_lower and brand not in product_name_norm:
            return False

    return True


def extract_asin(url: str) -> Optional[str]:
    if not url:
        return None
    patterns = [r'/dp/([A-Z0-9]{10})', r'/gp/product/([A-Z0-9]{10})', r'/ASIN/([A-Z0-9]{10})', r'dp/([A-Z0-9]{10})']
    for pattern in patterns:
        match = re.search(pattern, url)
        if match: return match.group(1)
    match = re.search(r'\b(B0[A-Z0-9]{8})\b', url)
    if match: return match.group(1)
    return None
