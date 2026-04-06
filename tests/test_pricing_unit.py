"""
MAQGO - Tests unitarios de pricing (sin servidor HTTP)
Prueba el calculator directamente para validar lógica y redondeo.
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from pricing.calculator import (
    calculate_immediate_price,
    calculate_scheduled_price,
    calculate_hybrid_price,
)


class TestQuoteBasePriceLogic:
    """Verifica que base_price/base_price_hr se manejen correctamente"""

    def test_immediate_con_base_price(self):
        r = calculate_immediate_price(
            machinery_type="retroexcavadora",
            base_price=45000,
            hours=4,
            transport_cost=25000,
        )
        assert r["final_price"] > 0
        assert r["final_price"] == round(r["final_price"])

    def test_immediate_con_precio_decimal(self):
        r = calculate_immediate_price(
            machinery_type="retroexcavadora",
            base_price=45250.5,
            hours=5,
            transport_cost=12345.75,
        )
        assert r["final_price"] > 0
        assert r["final_price"] == round(r["final_price"])


class TestRedondeoFracciones:
    """Valores monetarios sin fracciones raras"""

    def test_todos_enteros_en_breakdown(self):
        money_keys = {"service_cost", "transport_cost", "subtotal", "client_commission",
                     "client_commission_iva", "provider_commission", "provider_commission_iva",
                     "final_price", "provider_net", "base_price"}
        r = calculate_immediate_price(
            machinery_type="retroexcavadora",
            base_price=45000,
            hours=4,
            transport_cost=25000,
        )
        for k, v in r["breakdown"].items():
            if k in money_keys:
                assert v == round(v), f"{k}={v}"


class TestCamionPorViaje:
    """Maquinaria por viaje (camiones) - REGRESIÓN: desglose no debe mostrar precio×horas"""

    def test_camion_immediate_flat_rate(self):
        r = calculate_immediate_price(
            machinery_type="camion_pluma",
            base_price=285000,
            hours=4,
            transport_cost=0,
        )
        assert r["breakdown"]["is_per_hour"] is False
        assert r["breakdown"]["transport_cost"] == 0
        assert r["final_price"] > 0

    def test_camion_tolva_service_amount_es_precio_viaje_no_por_horas(self):
        """Camión Tolva: service_amount = base_price (1 viaje), NO base_price * hours"""
        r = calculate_immediate_price(
            machinery_type="camion_tolva",
            base_price=45000,
            hours=4,
            transport_cost=0,
        )
        assert r["breakdown"]["is_per_hour"] is False
        # service_cost con multiplicador: 45000 * 1.20 = 54000
        assert r["breakdown"]["service_cost"] == 54000
        # base sin multiplicador = 45000 (un viaje)
        assert r["breakdown"]["service_cost"] != 180000, "NO debe ser 45000*4 (regresión desglose)"
