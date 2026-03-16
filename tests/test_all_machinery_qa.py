"""
MAQGO - QA exhaustivo por maquinaria
Prueba TODAS las maquinarias en reserva inmediata y programada.
Detecta regresiones en desglose, service_amount, traslado, etc.
"""

import os
import sys
import pytest
import requests

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from pricing.constants import (
    MACHINERY_PER_HOUR,
    MACHINERY_PER_SERVICE,
    MACHINERY_NEEDS_TRANSPORT,
    MACHINERY_NO_TRANSPORT,
)
from pricing.calculator import calculate_immediate_price, calculate_scheduled_price

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'http://localhost:8002').rstrip('/')

# Precios de referencia por maquinaria (REFERENCE_PRICES del backend)
BASE_PRICES = {
    'retroexcavadora': 80000,
    'excavadora': 110000,
    'bulldozer': 140000,
    'motoniveladora': 155000,
    'compactadora': 75000,
    'minicargador': 62500,
    'grua': 120000,
    'camion_pluma': 285000,
    'camion_aljibe': 260000,
    'camion_tolva': 240000,
}


class TestAllMachineryImmediate:
    """Reserva INMEDIATA - cada maquinaria"""

    @pytest.mark.parametrize("machinery", list(BASE_PRICES.keys()))
    def test_immediate_service_amount_correcto(self, machinery):
        """service_amount: por-hora = base*4, por-viaje = base (NO base*4)"""
        base = BASE_PRICES[machinery]
        r = calculate_immediate_price(
            machinery_type=machinery,
            base_price=base,
            hours=4,
            transport_cost=25000 if machinery in MACHINERY_NEEDS_TRANSPORT else 0,
        )
        is_per_hour = machinery in MACHINERY_PER_HOUR
        expected_service = base * 4 if is_per_hour else base
        actual = r['breakdown']['service_cost']
        # service_cost incluye multiplicador; para verificar lógica usamos base
        assert r['final_price'] > 0
        if is_per_hour:
            assert r['breakdown']['is_per_hour'] is True
            assert actual == round(base * 4 * 1.20), f"{machinery}: service_cost debe ser base*4*1.20"
        else:
            assert r['breakdown']['is_per_hour'] is False
            assert actual != base * 4, f"{machinery} REGRESIÓN: NO debe ser base*4 (es por viaje)"
            assert actual == round(base * 1.20), f"{machinery}: service_cost = base*1.20"

    @pytest.mark.parametrize("machinery", list(BASE_PRICES.keys()))
    def test_immediate_transport_logic(self, machinery):
        """Traslado: solo si MACHINERY_NEEDS_TRANSPORT"""
        base = BASE_PRICES[machinery]
        transport = 25000 if machinery in MACHINERY_NEEDS_TRANSPORT else 0
        r = calculate_immediate_price(
            machinery_type=machinery,
            base_price=base,
            hours=4,
            transport_cost=transport,
        )
        expected_transport = 25000 if machinery in MACHINERY_NEEDS_TRANSPORT else 0
        assert r['breakdown']['transport_cost'] == expected_transport, \
            f"{machinery}: transport_cost debe ser {expected_transport}"


class TestAllMachineryScheduled:
    """Reserva PROGRAMADA - cada maquinaria"""

    @pytest.mark.parametrize("machinery", list(BASE_PRICES.keys()))
    def test_scheduled_service_cost_correcto(self, machinery):
        """Por-hora: base*8*1 día. Por-viaje: base*1 día"""
        base = BASE_PRICES[machinery]
        r = calculate_scheduled_price(
            machinery_type=machinery,
            base_price=base,
            days=1,
            transport_cost=25000 if machinery in MACHINERY_NEEDS_TRANSPORT else 0,
        )
        is_per_hour = machinery in MACHINERY_PER_HOUR
        expected = base * 8 if is_per_hour else base
        assert r['breakdown']['service_cost'] == expected, \
            f"{machinery}: service_cost debe ser {expected}"

    @pytest.mark.parametrize("machinery", list(BASE_PRICES.keys()))
    def test_scheduled_multi_day(self, machinery):
        """Varios días: por-hora base*8*days, por-viaje base*days"""
        base = BASE_PRICES[machinery]
        r = calculate_scheduled_price(
            machinery_type=machinery,
            base_price=base,
            days=3,
            transport_cost=0,
        )
        is_per_hour = machinery in MACHINERY_PER_HOUR
        expected = base * 8 * 3 if is_per_hour else base * 3
        assert r['breakdown']['service_cost'] == expected


class TestAllMachineryAPI:
    """Tests API (requiere backend) - service_amount para frontend"""

    @pytest.mark.parametrize("machinery", list(BASE_PRICES.keys()))
    def test_api_immediate_service_amount(self, machinery):
        """API /immediate: service_amount correcto para desglose frontend"""
        try:
            resp = requests.post(f"{BASE_URL}/api/pricing/immediate", json={
                "machinery_type": machinery,
                "base_price_hr": BASE_PRICES[machinery],
                "hours": 4,
                "transport_cost": 25000 if machinery in MACHINERY_NEEDS_TRANSPORT else 0,
                "is_immediate": True,
            }, timeout=5)
        except requests.exceptions.ConnectionError:
            pytest.skip("Backend no disponible")
        assert resp.status_code == 200, f"{machinery}: {resp.text}"
        data = resp.json()
        is_per_trip = machinery in MACHINERY_PER_SERVICE
        expected = BASE_PRICES[machinery] if is_per_trip else BASE_PRICES[machinery] * 4
        assert data['service_amount'] == expected, \
            f"{machinery}: service_amount debe ser {expected} (es {'viaje' if is_per_trip else 'por hora'}), got {data['service_amount']}"

    @pytest.mark.parametrize("machinery", list(BASE_PRICES.keys()))
    def test_api_scheduled(self, machinery):
        """API /scheduled: respuesta válida"""
        try:
            resp = requests.post(f"{BASE_URL}/api/pricing/scheduled", json={
                "machinery_type": machinery,
                "base_price": BASE_PRICES[machinery],
                "days": 1,
                "transport_cost": 25000 if machinery in MACHINERY_NEEDS_TRANSPORT else 0,
            }, timeout=5)
        except requests.exceptions.ConnectionError:
            pytest.skip("Backend no disponible")
        assert resp.status_code == 200, f"{machinery}: {resp.text}"
        data = resp.json()
        assert 'final_price' in data
        assert data['final_price'] > 0
        assert 'breakdown' in data
        assert 'service_cost' in data['breakdown']


class TestRegresionDesglose:
    """Regresiones conocidas - NO deben volver"""

    def test_camion_tolva_no_muestra_precio_por_horas(self):
        """Camión Tolva: desglose NO debe mostrar base*4"""
        r = calculate_immediate_price(
            machinery_type='camion_tolva',
            base_price=45000,
            hours=4,
            transport_cost=0,
        )
        assert r['breakdown']['service_cost'] != 180000

    def test_todas_por_viaje_sin_transporte(self):
        """Camiones: transport_cost = 0"""
        for m in MACHINERY_PER_SERVICE:
            r = calculate_immediate_price(
                machinery_type=m,
                base_price=100000,
                hours=4,
                transport_cost=50000,  # Debe forzarse a 0
            )
            assert r['breakdown']['transport_cost'] == 0, f"{m} no debe cobrar traslado"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
