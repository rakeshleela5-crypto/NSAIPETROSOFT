from datetime import date, datetime, timedelta, timezone

# Indian Standard Time (IST) is UTC + 5:30
# Petroleum stations across India operate strictly on IST business day cycles
IST = timezone(timedelta(hours=5, minutes=30), name="IST")


def now_ist() -> datetime:
    """Returns current datetime in Indian Standard Time (IST)"""
    return datetime.now(IST)


def today_ist() -> date:
    """Returns current calendar date in Indian Standard Time (IST)"""
    return datetime.now(IST).date()
