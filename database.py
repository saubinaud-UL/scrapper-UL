"""
Módulo de base de datos usando SQLAlchemy.
"""
from datetime import datetime
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, ForeignKey, Text
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from config import DATABASE_URL

Base = declarative_base()

class SearchSession(Base):
    """Registro de una sesión de búsqueda."""
    __tablename__ = 'search_sessions'
    
    id = Column(Integer, primary_key=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    query = Column(String(255))
    products = relationship("ProductPrice", back_populates="session", cascade="all, delete-orphan")

class ProductPrice(Base):
    """Precio capturado de un producto."""
    __tablename__ = 'product_prices'
    
    id = Column(Integer, primary_key=True)
    session_id = Column(Integer, ForeignKey('search_sessions.id'))
    tienda = Column(String(50))
    nombre = Column(String(500))
    precio = Column(Float)
    precio_original = Column(Float, nullable=True)
    url = Column(Text)
    timestamp = Column(DateTime, default=datetime.utcnow)
    
    session = relationship("SearchSession", back_populates="products")

# Configuración del motor DB
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    """Inicializa la base de datos (crea tablas)."""
    Base.metadata.create_all(bind=engine)

def save_search_results(query: str, results: list):
    """Guarda los resultados de una búsqueda."""
    session = SessionLocal()
    try:
        # Crear sesión de búsqueda
        search_session = SearchSession(query=query)
        session.add(search_session)
        session.flush() # Para obtener el ID
        
        # Guardar productos
        for r in results:
            product = ProductPrice(
                session_id=search_session.id,
                tienda=r.tienda,
                nombre=r.nombre,
                precio=r.precio,
                precio_original=r.precio_original,
                url=r.url
            )
            session.add(product)
        
        session.commit()
    except Exception as e:
        session.rollback()
        raise e
    finally:
        session.close()

def get_recent_searches(limit: int = 10):
    """Obtiene búsquedas recientes."""
    session = SessionLocal()
    try:
        return session.query(SearchSession).order_by(SearchSession.timestamp.desc()).limit(limit).all()
    finally:
        session.close()
