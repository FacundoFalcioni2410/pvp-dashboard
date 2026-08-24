import os


def positive_env_int(name: str, default: int) -> int:
    """Read a positive integer env var, treating blank/invalid values as unset."""
    raw_value = os.getenv(name, "").strip()
    if not raw_value:
        return default
    try:
        value = int(raw_value)
    except ValueError:
        return default
    return value if value > 0 else default

PCT_DIF_COL = "% Dif con PVP"
RAZON_SOCIAL_COL = "RAZON SOCIAL"
USUARIO_ML_COL = "USUARIO ML"
TIPO_CLIENTE_COL = "TIPO DE CLIENTE"
FECHA_COL = "FECHA"
MLA_COL = "MLA"
PRECIO_COL = "Precio"
SKU_COL = "SKU"
PVP_COL = "PVP"
ROT_COL = "ROT"
CANAL_COL = "CANAL"
MACRO_FAMILIA_COL = "MACROFAMILIA"
MARCA_COL = "MARCA"

DEFAULT_THRESHOLD = 15.0
DEFAULT_UPLOAD_MB = 4 if os.getenv("VERCEL", "").lower() == "1" else 25
MAX_UPLOAD_BYTES = positive_env_int("PVP_MAX_UPLOAD_MB", DEFAULT_UPLOAD_MB) * 1024 * 1024
MAX_EXCEL_UNCOMPRESSED_BYTES = positive_env_int("PVP_MAX_EXCEL_UNCOMPRESSED_MB", 200) * 1024 * 1024
MAX_EXCEL_SHEETS = 50
MAX_EXCEL_ROWS = 500_000
MAX_EXCEL_COLUMNS = 250
