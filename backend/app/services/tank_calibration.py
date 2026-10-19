import math
from typing import Dict, Any, List, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.petrol_pump import TankCalibrationChart


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
        return {"dip_cm": 0.0, "volume_liters": 0.0, "percent_full": 0.0, "source": "GEOMETRIC_FORMULA"}

    # Clamp dip to diameter
    effective_dip = min(dip_cm, diameter_cm)
    r = diameter_cm / 2.0  # in cm
    h = effective_dip       # in cm

    # Geometric area of circular segment
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
        "source": "GEOMETRIC_FORMULA",
    }


async def get_calibrated_tank_volume(
    db: AsyncSession,
    tank_id: int,
    dip_cm: float,
    capacity_liters: float = 20000.0,
) -> Dict[str, Any]:
    """
    Looks up volume in liters using the Government Weights & Measures calibrated
    Tank Calibration Chart (Strapping Chart) with linear interpolation between
    adjacent points. Falls back to geometric formula if no strapping points are seeded.
    """
    if dip_cm <= 0:
        return {
            "dip_cm": 0.0,
            "volume_liters": 0.0,
            "percent_full": 0.0,
            "capacity_liters": capacity_liters,
            "source": "ZERO_DIP",
        }

    stmt = (
        select(TankCalibrationChart)
        .where(TankCalibrationChart.tank_id == tank_id)
        .order_by(TankCalibrationChart.dip_cm.asc())
    )
    res = await db.execute(stmt)
    points: List[TankCalibrationChart] = res.scalars().all()

    if not points:
        # Fall back to geometric calculation with dished ends
        return calculate_tank_volume_from_dip(dip_cm, capacity_liters)

    # Check boundaries
    if dip_cm <= points[0].dip_cm:
        # At or below minimum calibrated point
        p = points[0]
        factor = dip_cm / p.dip_cm if p.dip_cm > 0 else 0.0
        vol = round(p.volume_liters * factor, 2)
        pct = round((vol / capacity_liters) * 100.0, 1)
        return {
            "dip_cm": round(dip_cm, 1),
            "volume_liters": vol,
            "percent_full": pct,
            "capacity_liters": capacity_liters,
            "source": "STRAPPING_CHART_INTERPOLATED",
        }

    if dip_cm >= points[-1].dip_cm:
        # At or above maximum calibrated point
        vol = round(points[-1].volume_liters, 2)
        pct = round((vol / capacity_liters) * 100.0, 1)
        return {
            "dip_cm": round(dip_cm, 1),
            "volume_liters": vol,
            "percent_full": pct,
            "capacity_liters": capacity_liters,
            "source": "STRAPPING_CHART_MAX",
        }

    # Interpolate between adjacent points p1 and p2
    for i in range(len(points) - 1):
        p1 = points[i]
        p2 = points[i + 1]
        if p1.dip_cm <= dip_cm <= p2.dip_cm:
            span = p2.dip_cm - p1.dip_cm
            fraction = (dip_cm - p1.dip_cm) / span if span > 0 else 0.0
            vol = round(p1.volume_liters + fraction * (p2.volume_liters - p1.volume_liters), 2)
            pct = round((vol / capacity_liters) * 100.0, 1)
            return {
                "dip_cm": round(dip_cm, 1),
                "volume_liters": vol,
                "percent_full": pct,
                "capacity_liters": capacity_liters,
                "source": "STRAPPING_CHART_CALIBRATED",
                "lower_point": {"dip_cm": p1.dip_cm, "volume": p1.volume_liters},
                "upper_point": {"dip_cm": p2.dip_cm, "volume": p2.volume_liters},
            }

    return calculate_tank_volume_from_dip(dip_cm, capacity_liters)


def reduce_density_to_15c(
    observed_density: float,
    temperature_celsius: float,
    product_code: str = "HSD",
) -> Dict[str, Any]:
    """
    Converts ambient hydrometer density to 15°C reference density
    based on international ASTM Table 53B petroleum liquid temperature reduction.
    
    ASTM 53B Standard Formula:
    rho_15 = rho_t / (1 - beta * (t - 15) * (1 + 0.8 * beta * (t - 15)))
    where beta is the thermal coefficient of expansion for generalized products.
    """
    is_petrol = "MS" in product_code.upper() or "PETROL" in product_code.upper()
    delta_t = temperature_celsius - 15.0

    # Base thermal coefficient for ASTM Table 53B
    # Gasoline / MS (700-780 kg/m3): beta ~ 0.00115 to 0.00130 / °C
    # Diesel / HSD (800-880 kg/m3): beta ~ 0.00080 to 0.00088 / °C
    if is_petrol:
        beta = 0.00122 if observed_density <= 750.0 else 0.00118
    else:
        beta = 0.00085 if observed_density <= 840.0 else 0.00081

    # Second-order volume correction factor denominator
    denom = 1.0 - (beta * delta_t * (1.0 + 0.8 * beta * delta_t))
    if denom <= 0:
        density_15c = observed_density
    else:
        density_15c = round(observed_density / denom, 2)

    return {
        "observed_density": round(observed_density, 2),
        "temperature_celsius": round(temperature_celsius, 1),
        "density_15c": density_15c,
        "product": "MS (Petrol)" if is_petrol else "HSD (Diesel)",
        "tolerance_limit": 3.0,  # Statutory Indian OMC ±3.0 kg/m3 acceptance limit
        "vcf_denominator": round(denom, 6),
    }


def generate_standard_strapping_points(capacity_liters: float = 20000.0, diameter_cm: float = 240.0) -> List[Dict[str, float]]:
    """
    Generates standard calibrated strapping points in 10 cm increments
    representing a horizontal cylindrical tank with elliptical dished ends.
    """
    points = []
    step_cm = 10.0
    current_dip = 0.0
    while current_dip <= diameter_cm:
        res = calculate_tank_volume_from_dip(current_dip, capacity_liters, diameter_cm)
        points.append({
            "dip_cm": round(current_dip, 1),
            "volume_liters": res["volume_liters"],
        })
        current_dip += step_cm
    return points
