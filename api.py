import logging
import uvicorn
from fastapi import FastAPI, HTTPException, Body
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

# Importar nuestros scrapers existentes
from scrapers import AmazonScraper, EbayScraper

# Configurar Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("PriceScraperAPI")

app = FastAPI(
    title="PriceScraper API",
    description="API robusta para consultar precios en Amazon e eBay dado un ASIN/Query. Diseñada para integración con n8n.",
    version="1.0.0"
)

# Modelos de Datos (Input/Output)
class PriceRequest(BaseModel):
    asin: str
    query: Optional[str] = None # Opcional: Para búsqueda en eBay si el ASIN no funciona directo

class ProductData(BaseModel):
    store: str
    title: str
    price: float
    currency: str = "USD"
    url: str
    availability: str
    status: str # "Found", "Unavailable", "Error"

class PriceResponse(BaseModel):
    asin: str
    amazon: Optional[ProductData] = None
    ebay: Optional[ProductData] = None
    meta: Dict[str, Any]

@app.get("/")
def health_check():
    return {"status": "ok", "service": "PriceScraper API"}

@app.post("/check-prices", response_model=PriceResponse)
def check_prices(payload: PriceRequest = Body(...)):
    """
    Endpoint principal. Recibe un ASIN.
    1. Busca en Amazon por ASIN.
    2. Busca en eBay (usando el título de Amazon o el query opcional).
    3. Retorna JSON estructurado.
    """
    asin = payload.asin
    logger.info(f"Recibida solicitud para ASIN: {asin}")
    
    response = PriceResponse(asin=asin, meta={})
    
    # ---------------------------------------------------------
    # 1. Scraping Amazon
    # ---------------------------------------------------------
    search_term_for_ebay = payload.query
    
    try:
        amz_scraper = AmazonScraper()
        # Usamos get_product_by_asin que ya tienes optimizado
        amz_prod = amz_scraper.get_product_by_asin(asin)
        
        if amz_prod:
            response.amazon = ProductData(
                store="Amazon",
                title=amz_prod.nombre,
                price=amz_prod.precio,
                url=amz_prod.url,
                availability="In Stock" if amz_prod.disponible else "Unavailable",
                status="Found" if amz_prod.precio > 0 else "Unavailable"
            )
            # Usar título de Amazon para buscar en eBay si no se proveyó query
            if not search_term_for_ebay:
                # Limpieza básica para ebay
                search_term_for_ebay = ' '.join(amz_prod.nombre.split()[:6])
        else:
            # Si Amazon falla, marcamos como no encontrado
             logger.warning(f"Amazon no encontró ASIN: {asin}")
    
    except Exception as e:
        logger.error(f"Error scraping Amazon: {e}")
        response.meta["amazon_error"] = str(e)

    # ---------------------------------------------------------
    # 2. Scraping eBay (Solo si tenemos un término de búsqueda)
    # ---------------------------------------------------------
    if not search_term_for_ebay:
        search_term_for_ebay = asin # Último recurso: buscar por ASIN en eBay

    try:
        ebay_scraper = EbayScraper()
        # eBay search retorna lista. Tomamos el primero más relevante o barato.
        # safe_search devuelve lista de ProductResult
        ebay_results = ebay_scraper.safe_search(search_term_for_ebay, max_results=1)
        
        if ebay_results:
            best_ebay = ebay_results[0]
            response.ebay = ProductData(
                store="eBay",
                title=best_ebay.nombre,
                price=best_ebay.precio,
                url=best_ebay.url,
                availability="Available",
                status="Found"
            )
        else:
             logger.warning(f"eBay no encontró: {search_term_for_ebay}")

    except Exception as e:
        logger.error(f"Error scraping eBay: {e}")
        response.meta["ebay_error"] = str(e)
        
    response.meta["search_term_used_ebay"] = search_term_for_ebay
    return response

if __name__ == "__main__":
    # Permite correr directo: python api.py
    uvicorn.run(app, host="0.0.0.0", port=8000)
