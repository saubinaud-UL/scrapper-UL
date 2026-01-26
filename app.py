"""
Comparador de Precios - UnaLuka, Amazon, eBay
Diseño Visual: Unaluka.com (Rojo/Blanco/Azul)
Lógica Robusta: ASIN First + Pagination + Manual Link Fallback
"""
import sys
import os
import re
from urllib.parse import unquote, quote_plus

# Agregar el directorio padre al path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import streamlit as st
import logging

# Importar los scrapers
from scrapers import UnaLukaScraper, AmazonScraper, EbayScraper, ProductResult
from utils import truncate_text, extract_asin

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuración de la página
st.set_page_config(
    page_title="Buscador de Precios",
    page_icon="🛍️",
    layout="wide",
    initial_sidebar_state="collapsed"
)

# -----------------------------------------------------------------------------
# UNALUKA DESIGN SYSTEM (CSS)
# -----------------------------------------------------------------------------
st.markdown("""
<link href="https://fonts.googleapis.com/css2?family=Archivo:ital,wght@0,100..900;1,100..900&display=swap" rel="stylesheet">
<style>
    /* Global Font */
    html, body, [class*="css"] {
        font-family: 'Archivo', sans-serif !important;
        background-color: #FFFFFF;
        color: #333333;
    }
    
    /* Header Customization */
    header[data-testid="stHeader"] {
        background-color: #F30B0B !important;
        height: 60px !important;
    }
    
    /* Custom Header Container */
    .unaluka-header {
        background-color: #F30B0B;
        padding: 10px 30px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 20px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        width: 100%;
        position: fixed;
        top: 0;
        left: 0;
        z-index: 999999;
        height: 80px;
    }
    
    .unaluka-logo {
        height: 35px;
        width: auto;
    }
    
    /* Adjust main content padding because of fixed header */
    .block-container {
        padding-top: 100px !important;
    }

    /* Product Card */
    .product-card {
        background: #FFFFFF;
        border: 1px solid #EAEAEA;
        border-radius: 8px;
        padding: 15px;
        margin-bottom: 20px;
        transition: transform 0.2s, box-shadow 0.2s;
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
    }
    
    .product-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 5px 15px rgba(0,0,0,0.08);
        border-color: #0062BD;
    }
    
    .card-title {
        font-family: 'Archivo', sans-serif;
        font-weight: 600;
        font-size: 14px;
        color: #0062BD; /* Unaluka Blue */
        margin-bottom: 10px;
        line-height: 1.4;
        text-decoration: none;
        display: block;
        min-height: 40px;
    }
    
    .card-price {
        font-family: 'Archivo', sans-serif;
        font-weight: 700;
        font-size: 22px;
        color: #333333;
        margin-bottom: 5px;
    }
    
    .currency {
        font-size: 14px;
        vertical-align: top;
        font-weight: 500;
        margin-right: 2px;
    }
    
    .card-actions {
        margin-top: 15px;
    }
    
    .btn-buy {
        display: block;
        width: 100%;
        background-color: #000000;
        color: #FFFFFF !important;
        text-align: center;
        padding: 10px 0;
        border-radius: 4px;
        font-weight: 600;
        font-size: 14px;
        text-decoration: none;
        transition: background 0.2s;
    }
    
    .btn-buy:hover {
        background-color: #333333;
        color: #FFFFFF !important;
        text-decoration: none;
    }

    .sku-label {
        font-size: 11px;
        color: #999;
        margin-bottom: 5px;
    }

    .unavailable-badge {
        background-color: #f8d7da;
        color: #721c24;
        padding: 8px 10px;
        border-radius: 4px;
        font-size: 14px;
        font-weight: 600;
        text-align: center;
        margin: 10px 0;
        border: 1px solid #f5c6cb;
    }
    
    /* Clean up standard Streamlit elements */
    .stTextInput > div > div {
        border-radius: 50px !important;
        border: 1px solid #ddd;
    }
    
    /* Remove streamlit branding */
    #MainMenu {visibility: hidden;}
    footer {visibility: hidden;}
</style>

<!-- Custom Header -->
<div class="unaluka-header">
    <img src="https://unaluka.com/cdn/shop/files/UNALUKA_BLANCO-13_8c502049-c3b6-45ea-be20-c9ad8e0c7ade_150x.svg?v=1725871317" class="unaluka-logo" alt="Unaluka">
</div>
""", unsafe_allow_html=True)


# -----------------------------------------------------------------------------
# BUSINESS LOGIC & HELPERS
# -----------------------------------------------------------------------------

SCRAPERS = {
    'unaluka': ('UnaLuka', UnaLukaScraper),
    'amazon': ('Amazon', AmazonScraper),
    'ebay': ('eBay', EbayScraper),
}

def clean_term(text):
    if not text: return ""
    return text.replace('+', ' ').replace('-', ' ').strip()

def extract_search_info(url_or_text):
    text = url_or_text.strip()
    if 'http' in text or 'www.' in text:
        if 'amazon.' in text:
            asin = extract_asin(text)
            if asin: return 'asin', asin, 'amazon'
            return 'url', text, 'amazon'
        elif 'ebay.' in text:
            return 'url', text, 'ebay'
        elif 'unaluka.' in text:
            return 'url', text, 'unaluka'
        return 'url', text, None
    return 'text', text, None

# -----------------------------------------------------------------------------
# SESSION STATE
# -----------------------------------------------------------------------------
if 'search_results' not in st.session_state:
    st.session_state.search_results = None
if 'visible_count' not in st.session_state:
    st.session_state.visible_count = 1
if 'last_query' not in st.session_state:
    st.session_state.last_query = ""
if 'search_terms' not in st.session_state:
    st.session_state.search_terms = {}

def render_product_card(product, store_key):
    symbol = "S/" if store_key == 'unaluka' else "$"
    
    # Lógica de Disponibilidad vs Precio
    if product.disponible and product.precio > 0:
        main_display = f"""<div class="card-price"><span class="currency">{symbol}</span>{product.precio:,.2f}</div>"""
        btn_class = "btn-buy"
        btn_text = "Ver Producto"
        btn_style = ""
    else:
        # Si no hay precio, mostrar la razón
        reason = str(product.sku) if product.sku else "No disponible"
        if len(reason) < 4 or (reason.startswith("B0") and len(reason)==10):
            reason = "No Disponible"
            
        main_display = f"""<div class="unavailable-badge">{reason}</div>"""
        btn_class = "btn-buy"
        btn_text = "Consultar"
        btn_style = "background-color: #6c757d; pointer-events: none;"

    vendedor = truncate_text(product.vendedor, 30)
    title = truncate_text(product.nombre, 80)
    
    html = f"""<div class="product-card"><div><div class="sku-label">{vendedor}</div><a href="{product.url}" target="_blank" class="card-title" title="{product.nombre}">{title}</a>{main_display}</div><div class="card-actions"><a href="{product.url}" target="_blank" class="{btn_class}" style="{btn_style}">{btn_text}</a></div></div>"""
    st.markdown(html, unsafe_allow_html=True)


# -----------------------------------------------------------------------------
# MAIN UI
# -----------------------------------------------------------------------------

st.markdown("<div style='margin-bottom: 20px;'></div>", unsafe_allow_html=True)

col1, col2 = st.columns([3, 1])
with col1:
    query = st.text_input("Buscador", placeholder="Pega un enlace de Amazon o escribe...", label_visibility="collapsed", key="search_input")
with col2:
    st.write("")
    search_clicked = st.button("Buscar", type="primary", use_container_width=True)

# Opción de cantidad de resultados (Para velocidad)
max_results_input = st.slider("Resultados a buscar (Menos = Más Rápido)", min_value=1, max_value=10, value=3, help="Determina cuántos productos analizará el robot en cada tienda.")

# Detectar nueva búsqueda
is_new_search = search_clicked or (query and query != st.session_state.last_query)

if is_new_search:
    if not query:
        st.warning("Escribe algo para buscar.")
    else:
        # Resetear estado
        st.session_state.last_query = query
        st.session_state.visible_count = max_results_input 
        st.session_state.search_results = {'unaluka': [], 'amazon': [], 'ebay': []}
        
        # Analizar input y extraer ASIN
        asin = extract_asin(query)
        search_term_ebay = query 
        
        main_product_amazon = None
        results = {'unaluka': [], 'amazon': [], 'ebay': []}
        
        # STATUS CONTAINER
        with st.status(f"Procesando...", expanded=True) as status:
            
            # PASO 1: Si hay ASIN, búsqueda directa
            if asin:
                st.write(f"🆔 ASIN Detectado: **{asin}**")
                
                # Amazon
                try:
                    amz_scraper = AmazonScraper()
                    main_product_amazon = amz_scraper.get_product_by_asin(asin)
                    if main_product_amazon:
                        results['amazon'] = [main_product_amazon]
                        # Título limpio para eBay y fallback de Unaluka
                        clean_title = clean_term(main_product_amazon.nombre)
                        search_term_ebay = ' '.join(clean_title.split()[:5])
                except Exception as e:
                    logger.error(f"Error Amazon ASIN: {e}")
                
                # Unaluka (Search by ASIN)
                try:
                    una_scraper = UnaLukaScraper()
                    una_items = una_scraper.safe_search(asin, max_results=max_results_input)
                    if una_items:
                        results['unaluka'] = una_items
                    else:
                        st.info("ASIN no encontrado en Unaluka. Se intentará buscar por nombre...")
                except Exception as e:
                    logger.error(f"Error Unaluka ASIN: {e}")
            
            else:
                # Flujo normal Texto/URL generica
                st.write(f"🔎 Buscando '{query}'...")
                tipo, data, source = extract_search_info(query)
                if tipo == 'url' and source == 'unaluka':
                     try:
                        st.write("Analizando enlace de Unaluka...")
                        una_prod = UnaLukaScraper().get_product_by_url(data)
                        if una_prod:
                            results['unaluka'] = [una_prod]
                            # Si encontramos ASIN en la página de Unaluka, aprovecharlo!
                            if una_prod.sku and una_prod.sku.startswith("B0"):
                                asin = una_prod.sku
                                st.write(f"🆔 ASIN encontrado en Unaluka: {asin}")
                            
                            # Preparar término para eBay/Amazon fallback
                            clean_title = clean_term(una_prod.nombre)
                            search_term_ebay = ' '.join(clean_title.split()[:5])
                            
                            # Si obtuvimos ASIN, buscar en Amazon ahora mismo
                            if asin and not results['amazon']:
                                try:
                                    amz = AmazonScraper().get_product_by_asin(asin)
                                    if amz: results['amazon'] = [amz]
                                except: pass
                     except Exception as e:
                        logger.error(f"Error Unaluka URL: {e}") 
            
            # PASO 2: Fallbacks y búsquedas faltantes
            
            # Fallback Unaluka: SOLO si NO había ASIN.
            # El usuario pidió explícitamente NO buscar por nombre si tenemos ASIN, para evitar errores de variantes.
            if not results['unaluka'] and not asin:
                search_term_unaluka = query
                # Si tenemos producto de Amazon (que vendría de búsqueda texto en este caso), usar su título?
                # Si no hay ASIN, es búsqueda texto pura.
                
                try:
                    una_items = UnaLukaScraper().safe_search(search_term_unaluka, max_results=max_results_input)
                    if una_items:
                        results['unaluka'] = una_items
                except: pass

            # eBay
            if not results['ebay']:
                st.write(f"🔴 Buscando en eBay: '{search_term_ebay}'")
                try:
                     items = EbayScraper().safe_search(search_term_ebay, max_results=max_results_input)
                     results['ebay'] = items
                except Exception as e: logger.error(f"eBay Error: {e}")
            
            # Fallback Amazon (si no hubo ASIN)
            if not results['amazon'] and not asin:
                 try:
                    items = AmazonScraper().safe_search(query, max_results=max_results_input)
                    results['amazon'] = items
                 except: pass

            status.update(label="¡Búsqueda Finalizada!", state="complete", expanded=False)
        
        # Guardar resultados en Session State
        st.session_state.search_results = results
        st.session_state.search_terms = {
            'unaluka': query if not main_product_amazon else clean_term(main_product_amazon.nombre),
            'amazon': query if not main_product_amazon else clean_term(main_product_amazon.nombre),
            'ebay': search_term_ebay
        }

# RENDERIZADO DESDE SESSION STATE
if st.session_state.search_results:
    results = st.session_state.search_results
    search_terms = st.session_state.get('search_terms', {})
    
    cols = st.columns(3)
    stores_order = ['unaluka', 'amazon', 'ebay']
    
    has_more_global = False
    
    for idx, store in enumerate(stores_order):
        with cols[idx]:
            label = SCRAPERS[store][0]
            st.markdown(f"<h3 style='border-bottom: 2px solid #F30B0B; padding-bottom: 5px; font-size: 18px;'>{label}</h3>", unsafe_allow_html=True)
            
            items = results.get(store, [])
            if not items:
                # Mostrar tarjeta de "Sin Resultados" con link manual
                term = search_terms.get(store, query)
                if not term: term = query
                
                if store == 'unaluka':
                    search_url = f"https://unaluka.com/search?q={quote_plus(term)}"
                elif store == 'amazon':
                    search_url = f"https://www.amazon.com/s?k={quote_plus(term)}"
                else:
                    search_url = f"https://www.ebay.com/sch/i.html?_nkw={quote_plus(term)}"
                
                st.info("Sin resultados automáticos.")
                st.markdown(f"""
                <div class="product-card" style="justify-content: center; text-align: center; height: auto; padding: 20px; background-color: #f9f9f9;">
                    <div style="font-weight: 500; margin-bottom: 10px; font-size: 13px;">¿No lo encuentras?</div>
                    <a href="{search_url}" target="_blank" class="btn-buy" style="background-color: #666; font-size: 12px;">
                        Buscar manual en {label.split()[-1]}
                    </a>
                </div>
                """, unsafe_allow_html=True)
            else:
                # Paginación
                visible_items = items[:st.session_state.visible_count]
                for item in visible_items:
                    render_product_card(item, store)
                    
                if len(items) > st.session_state.visible_count:
                    has_more_global = True
                    remaining = len(items) - st.session_state.visible_count
                    st.caption(f"+ {remaining} resultados más")

    # Botón Ver Más
    if has_more_global:
        st.markdown("<br>", unsafe_allow_html=True)
        _, btn_col, _ = st.columns(3)
        with btn_col:
            if st.button("Ver más resultados ➕", use_container_width=True):
                st.session_state.visible_count += 3
                st.rerun()

# Footer
st.markdown("<div style='margin-top: 50px; text-align: center; color: #ccc; font-size: 12px;'>PriceScraper v2.3</div>", unsafe_allow_html=True)
