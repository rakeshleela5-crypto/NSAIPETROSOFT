import logging
import threading
import time
from typing import Any, Callable, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


class TTLCache:
    """
    Thread-safe in-memory TTL (Time-To-Live) cache with instant key and pattern invalidation (#6, #7).
    Guarantees thread-safe access across concurrent async worker threads via threading.RLock.
    """

    def __init__(self):
        self._cache: Dict[str, Tuple[Any, float]] = {}
        self._lock = threading.RLock()

    def get(self, key: str) -> Optional[Any]:
        """
        Retrieves a cached value if present and not expired.
        Returns None on cache miss or expiration.
        """
        with self._lock:
            entry = self._cache.get(key)
            if entry is None:
                return None
            value, expiry = entry
            if time.time() > expiry:
                # Expired: eagerly evict
                self._cache.pop(key, None)
                return None
            return value

    def set(self, key: str, value: Any, ttl_seconds: int = 300) -> None:
        """
        Stores a value in the cache with a specified TTL in seconds.
        """
        with self._lock:
            expiry = time.time() + max(1, ttl_seconds)
            self._cache[key] = (value, expiry)

    def delete(self, key: str) -> bool:
        """
        Explicitly evicts a single key from the cache.
        """
        with self._lock:
            return self._cache.pop(key, None) is not None

    def invalidate_prefix(self, prefix: str) -> int:
        """
        Evicts all keys matching a prefix (e.g. 'rates:', 'station:').
        Returns count of keys invalidated.
        """
        with self._lock:
            keys_to_delete = [k for k in self._cache.keys() if k.startswith(prefix)]
            for k in keys_to_delete:
                self._cache.pop(k, None)
            return len(keys_to_delete)

    def clear(self) -> None:
        """
        Wipes all entries from the cache.
        """
        with self._lock:
            self._cache.clear()

    def size(self) -> int:
        with self._lock:
            # Clean up expired on size check
            now = time.time()
            expired = [k for k, (_, exp) in self._cache.items() if now > exp]
            for k in expired:
                self._cache.pop(k, None)
            return len(self._cache)


# Global singleton instance
memory_cache = TTLCache()

# -----------------------------------------------------------------------------
# Domain-Specific Cache Keys & Invalidation Helpers (#6, #7)
# -----------------------------------------------------------------------------
KEY_DAILY_FUEL_RATES = "rates:daily_fuel_products"
KEY_STATION_PROFILE = "station:profile_settings"
KEY_FORECOURT_CONFIG = "station:forecourt_nozzles_tanks"
KEY_DASHBOARD_SUMMARY = "station:dashboard_summary"


def get_cached_rates() -> Optional[List[Dict[str, Any]]]:
    return memory_cache.get(KEY_DAILY_FUEL_RATES)


def set_cached_rates(rates: List[Dict[str, Any]], ttl_seconds: int = 600) -> None:
    memory_cache.set(KEY_DAILY_FUEL_RATES, rates, ttl_seconds=ttl_seconds)


def invalidate_rates_cache() -> None:
    """Instant invalidation called whenever fuel prices (MS, HSD, XP) are updated or reverted."""
    memory_cache.delete(KEY_DAILY_FUEL_RATES)
    memory_cache.delete(KEY_DASHBOARD_SUMMARY)
    logger.info("Daily fuel rates cache invalidated.")


def get_cached_station_profile() -> Optional[Dict[str, Any]]:
    return memory_cache.get(KEY_STATION_PROFILE)


def set_cached_station_profile(profile: Dict[str, Any], ttl_seconds: int = 1800) -> None:
    memory_cache.set(KEY_STATION_PROFILE, profile, ttl_seconds=ttl_seconds)


def get_cached_forecourt_config() -> Optional[Dict[str, Any]]:
    return memory_cache.get(KEY_FORECOURT_CONFIG)


def set_cached_forecourt_config(config: Dict[str, Any], ttl_seconds: int = 900) -> None:
    memory_cache.set(KEY_FORECOURT_CONFIG, config, ttl_seconds=ttl_seconds)


def invalidate_station_cache() -> None:
    """Instant invalidation called whenever tanks, nozzles, or station profile are modified."""
    memory_cache.invalidate_prefix("station:")
    logger.info("Station and forecourt configuration cache invalidated.")


def invalidate_all_caches() -> None:
    memory_cache.clear()
    logger.info("All in-memory application caches cleared.")
