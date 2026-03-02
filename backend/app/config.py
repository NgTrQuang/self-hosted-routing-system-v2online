import os

OSRM_BASE_URL: str = os.getenv("OSRM_BASE_URL", "https://router.project-osrm.org")
REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379")
CACHE_TTL: int = int(os.getenv("CACHE_TTL", "300"))
REQUEST_TIMEOUT: float = float(os.getenv("REQUEST_TIMEOUT", "15.0"))
USE_MOCK_OSRM: bool = os.getenv("USE_MOCK_OSRM", "false").lower() in ("true", "1", "yes")

_origins_env: str = os.getenv("ALLOWED_ORIGINS", "*")
ALLOWED_ORIGINS: list[str] = ["*"] if _origins_env == "*" else [o.strip() for o in _origins_env.split(",")]
