import datetime
import json
import logging
import traceback
from typing import Any, Dict, Optional


SENSITIVE_KEYS = {
    "client_secret",
    "module_secret",
    "provider_secret",
    "webhook_secret",
    "decentro_client_secret",
    "password",
    "hashed_password",
    "manager_pin",
    "pin",
    "secret",
    "authorization",
    "access_token",
    "token",
}


def mask_value(val: Any) -> Any:
    if val is None:
        return None
    val_str = str(val)
    if len(val_str) <= 4:
        return "****"
    return f"{val_str[:2]}****{val_str[-2:]}"


def sanitize_dict(data: Any) -> Any:
    """Recursively mask sensitive keys in nested dicts/lists for security logging."""
    if isinstance(data, dict):
        sanitized = {}
        for k, v in data.items():
            if any(s_key in k.lower() for s_key in SENSITIVE_KEYS):
                sanitized[k] = mask_value(v)
            else:
                sanitized[k] = sanitize_dict(v)
        return sanitized
    elif isinstance(data, list):
        return [sanitize_dict(item) for item in data]
    return data


class StructuredJsonFormatter(logging.Formatter):
    """
    Production-grade JSON Formatter for Enterprise Cloud Observability.
    Emits single-line JSON logs compatible with Datadog, CloudWatch, Loki, and Railway.
    """

    def format(self, record: logging.LogRecord) -> str:
        log_entry: Dict[str, Any] = {
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        # Extract extra structured fields if passed via extra={}
        extra_fields = {}
        for key, value in record.__dict__.items():
            if key not in {
                "name",
                "msg",
                "args",
                "levelname",
                "levelno",
                "pathname",
                "filename",
                "module",
                "exc_info",
                "exc_text",
                "stack_info",
                "lineno",
                "funcName",
                "created",
                "msecs",
                "relativeCreated",
                "thread",
                "threadName",
                "processName",
                "process",
                "message",
            }:
                extra_fields[key] = sanitize_dict(value)

        if extra_fields:
            log_entry["context"] = extra_fields

        if record.exc_info:
            log_entry["exception"] = {
                "type": record.exc_info[0].__name__ if record.exc_info[0] else "Exception",
                "message": str(record.exc_info[1]),
                "stacktrace": traceback.format_exception(*record.exc_info),
            }

        return json.dumps(log_entry, default=str)


def setup_structured_logging(level: int = logging.INFO) -> logging.Logger:
    """Configure root logger or Decentro logger with JSON formatting."""
    logger = logging.getLogger("nsaipetrosoft.decentro")
    logger.setLevel(level)
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(StructuredJsonFormatter())
        logger.addHandler(handler)
        logger.propagate = False
    return logger


decentro_logger = setup_structured_logging()
