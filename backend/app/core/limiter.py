from slowapi import Limiter
from slowapi.util import get_remote_address

# Shared SlowAPI Rate Limiter (#2, #18, #42)
# - Default standard API rate limit: 120 req/min
# - Specialized limits: 5 req/min on auth, 20 req/min on Decentro banking triggers
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["120/minute"],
)
