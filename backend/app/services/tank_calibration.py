import math
from typing import Dict, Any


def calculate_tank_volume_from_dip(
    dip_cm: float,
    capacity_liters: float = 20000.0,
    diameter_cm: float = 240.0,
) -> Dict[str, Any]:
    """
    Calculates liquid volume in liters for an underground horizontal cylindrical tank.
    Applies geometric partial volume integration for horizontal cylinder with dish ends:
    Depth h in cm, Radius R = diameter / 2.
    """
    if dip_cm <= 0:
        return {"dip_cm": 0.0, "volume_liters": 0.0, "percent_full": 0.0}

    # Clamp dip to diameter
    effective_dip = min(dip_cm, diameter_cm)
    r = diameter_cm / 2.0  # in cm
    h = effective_dip       # in cm

    # Geometric area of circular segment
    # theta = 2 * arccos((R - h) / R)
    ratio = max(-1.0, min(1.0, (r - h) / r))
    theta = 2.0 * math.acos(ratio)
    area_segment_cm2 = 0.5 * (r ** 2) * (theta - math.sin(theta))
    total_area_cm2 = math.pi * (r ** 2)

    fraction_full = area_segment_cm2 / total_area_cm2
    calculated_liters = round(fraction_full * capacity_liters, 2)
    percent_full = round(fraction_full * 100.0, 1)

    return {
        "dip_cm": round(dip_cm, 1),
        "volume_liters": calculated_liters,
        "percent_full": percent_full,
        "capacity_liters": capacity_liters,
    }


def reduce_density_to_15c(
    observed_density: float,
    temperature_celsius: float,
    product_code: str = "HSD",
) -> Dict[str, Any]:
    """
    Converts ambient hydrometer density to 15°C reference density
    based on Indian Standard / ASTM Table 53B petroleum reduction.
    """
    # Standard thermal expansion coefficient (kg/m3 per °C)
    # HSD (Diesel): ~0.70 kg/m3 per °C
    # MS (Petrol): ~0.84 kg/m3 per °C
    is_petrol = "MS" in product_code.upper() or "PETROL" in product_code.upper()
    coeff = 0.84 if is_petrol else 0.70

    temp_diff = temperature_celsius - 15.0
    density_15c = round(observed_density + (temp_diff * coeff), 2)

    return {
        "observed_density": observed_density,
        "temperature_celsius": temperature_celsius,
        "density_15c": density_15c,
        "product": "MS (Petrol)" if is_petrol else "HSD (Diesel)",
        "tolerance_limit": 3.0,  # Statutory ±3.0 kg/m3 OMC acceptance limit
    }
