"""
NSAiPetroSoft Forecourt ERP - Locust Rush-Hour Load Simulation
Author: Lead Performance & Reliability Architect

Simulates peak rush-hour forecourt activity:
- Concurrent pump attendants closing shifts
- High-frequency nozzle meter reading entries
- Dynamic UPI QR generation for fuel dispensers
- Fleet credit ledger lookups & B2B indents
- Underground tank DIP measurements

Run with:
    locust -f tests/locustfile.py --host https://nsaipetrosoft-production.up.railway.app --headless -u 20 -r 5 --run-time 1m
"""

import random
from locust import HttpUser, task, between


class ForecourtAttendantUser(HttpUser):
    wait_time = between(0.5, 2.0)

    @task(4)
    def health_and_status(self):
        """Attendant terminal health & forecourt connection check."""
        self.client.get("/health", name="/health")

    @task(3)
    def check_active_shift(self):
        """Attendant checking active shift status."""
        self.client.get("/api/v1/pump/shifts/active", name="/api/v1/pump/shifts/active")

    @task(3)
    def get_tank_dips(self):
        """Underground tank dip level monitoring."""
        self.client.get("/api/v1/pump/tanks", name="/api/v1/pump/tanks")

    @task(2)
    def get_customer_ledger(self):
        """Fleet customer credit balance lookup."""
        self.client.get("/api/v1/pump/customers", name="/api/v1/pump/customers")

    @task(2)
    def generate_nozzle_upi_qr(self):
        """Dynamic UPI QR generated at dispenser for commuter payment."""
        payload = {
            "shift_id": "SHIFT-RUSH-001",
            "nozzle_id": f"NOZZLE-MPD{random.randint(1, 4)}-HSD",
            "attendant_id": f"EMP-{random.randint(101, 108)}",
            "fuel_type": random.choice(["MS", "HSD"]),
            "liters_dispensed": round(random.uniform(5.0, 60.0), 2),
            "amount": round(random.uniform(500.0, 5500.0), 2),
            "expiry_seconds": 300,
        }
        self.client.post("/api/v1/banking/upi-qr", json=payload, name="/api/v1/banking/upi-qr")
