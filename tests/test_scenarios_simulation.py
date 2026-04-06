"""
MAQGO - Simulación de escenarios cliente/proveedor
Verifica bugs, errores de redondeo y consistencia de precios.
Requiere API en vivo salvo skip (MAQGO_SKIP_LIVE_API_TESTS=1).
"""

import pytest
import requests

from tests.live_api_test_util import base_url, is_available

BASE_URL = base_url()

pytestmark = pytest.mark.skipif(
    not is_available(),
    reason=f'API no disponible en {BASE_URL} (levanta backend o exporta MAQGO_LIVE_API_TEST_URL)',
)


def api_post(path, json_data):
    return requests.post(f"{BASE_URL}{path}", json=json_data, timeout=10)


def api_get(path):
    return requests.get(f"{BASE_URL}{path}", timeout=10)


# ===========================================
# ESCENARIOS CLIENTE - RESERVA INMEDIATA
# ===========================================

class TestClienteInmediata:
    """Cliente pide reserva para hoy mismo"""

    def test_retroexcavadora_4h_con_translado(self):
        """Retroexcavadora 4h, con traslado - maquinaria por hora"""
        r = api_post("/api/pricing/immediate", {
            "machinery_type": "retroexcavadora",
            "base_price_hr": 45000,
            "hours": 4,
            "transport_cost": 25000,
            "is_immediate": True
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["final_price"] > 0
        assert d["transport_cost"] == 25000
        # Service = 45000*4*1.20 = 216000
        assert 200000 < d["breakdown"]["service_cost"] < 230000
        # Sin decimales raros
        assert isinstance(d["final_price"], (int, float))
        assert d["final_price"] == round(d["final_price"])

    def test_retroexcavadora_8h_sin_translado(self):
        """8 horas, sin traslado"""
        r = api_post("/api/pricing/immediate", {
            "machinery_type": "retroexcavadora",
            "base_price_hr": 80000,
            "hours": 8,
            "transport_cost": 0,
            "is_immediate": True
        })
        assert r.status_code == 200
        d = r.json()
        assert d["transport_cost"] == 0
        assert d["final_price"] > 0
        assert d["final_price"] == round(d["final_price"])

    def test_camion_pluma_por_viaje(self):
        """Camión pluma: cobro por viaje, NO por hora"""
        r = api_post("/api/pricing/immediate", {
            "machinery_type": "camion_pluma",
            "base_price_hr": 285000,  # precio por viaje
            "hours": 4,  # backend ignora horas para por-viaje
            "transport_cost": 0,  # camiones no tienen traslado
            "is_immediate": True
        })
        assert r.status_code == 200
        d = r.json()
        assert d["transport_cost"] == 0
        # Precio por viaje: base * multiplier, no base * hours
        assert d["breakdown"]["is_per_hour"] is False
        assert d["final_price"] > 0
        assert d["final_price"] == round(d["final_price"])

    def test_precios_con_decimales_no_rompen(self):
        """Precios con decimales (ej. 45250.5) no deben fallar"""
        r = api_post("/api/pricing/immediate", {
            "machinery_type": "retroexcavadora",
            "base_price_hr": 45250.5,
            "hours": 5,
            "transport_cost": 12345.75,
            "is_immediate": True
        })
        assert r.status_code == 200
        d = r.json()
        assert d["final_price"] > 0
        assert d["final_price"] == round(d["final_price"])

    def test_quote_client(self):
        """Quote retorna solo final_price. Acepta base_price o base_price_hr."""
        r = api_post("/api/pricing/quote/client", {
            "base_price": 45000,
            "hours": 4,
            "transport_cost": 25000
        })
        assert r.status_code == 200, f"Quote falló: {r.text}"
        d = r.json()
        assert "final_price" in d
        assert d["final_price"] > 0

    def test_quote_client_base_price_hr(self):
        """Quote con base_price_hr (formato frontend). Ver backend/routes/pricing.py get_client_quote."""
        r = api_post("/api/pricing/quote/client", {
            "base_price_hr": 45000,
            "hours": 4,
            "transport_cost": 25000
        })
        assert r.status_code == 200, (
            f"Quote base_price_hr: {r.status_code}. Revisa que backend tenga el fix y reinicia."
        )
        assert r.json()["final_price"] > 0


# ===========================================
# ESCENARIOS CLIENTE - RESERVA PROGRAMADA
# ===========================================

class TestClienteProgramada:
    """Cliente programa para otro día"""

    def test_un_dia_8h(self):
        r = api_post("/api/pricing/scheduled", {
            "machinery_type": "retroexcavadora",
            "base_price": 45000,
            "days": 1,
            "transport_cost": 25000
        })
        assert r.status_code == 200
        d = r.json()
        assert d["reservation_type"] == "scheduled"
        assert d["breakdown"]["service_cost"] == 45000 * 8
        assert d["final_price"] == round(d["final_price"])

    def test_multiples_dias(self):
        r = api_post("/api/pricing/scheduled", {
            "machinery_type": "excavadora",
            "base_price": 110000,
            "days": 5,
            "transport_cost": 35000
        })
        assert r.status_code == 200
        d = r.json()
        assert d["breakdown"]["service_cost"] == 110000 * 8 * 5
        assert d["final_price"] > 0

    def test_camion_programado_por_viaje(self):
        """Camión programado: días * precio por viaje"""
        r = api_post("/api/pricing/scheduled", {
            "machinery_type": "camion_tolva",
            "base_price": 240000,
            "days": 3,
            "transport_cost": 0
        })
        assert r.status_code == 200
        d = r.json()
        assert d["breakdown"]["is_per_hour"] is False
        assert d["breakdown"]["service_cost"] == 240000 * 3
        assert d["breakdown"]["transport_cost"] == 0


# ===========================================
# ESCENARIOS CLIENTE - HÍBRIDO (HOY + DÍAS EXTRA)
# ===========================================

class TestClienteHibrido:
    """Cliente pide hoy + días adicionales consecutivos"""

    def test_hoy_4h_mas_2_dias(self):
        r = api_post("/api/pricing/hybrid", {
            "machinery_type": "retroexcavadora",
            "base_price_hr": 45000,
            "hours_today": 4,
            "additional_days": 2,
            "transport_cost": 25000
        })
        assert r.status_code == 200
        d = r.json()
        assert d["reservation_type"] == "hybrid"
        assert d["today"]["hours"] == 4
        assert d["additional_days"]["days"] == 2
        assert d["final_price"] > 0
        assert d["final_price"] == round(d["final_price"])

    def test_hoy_8h_mas_5_dias(self):
        r = api_post("/api/pricing/hybrid", {
            "machinery_type": "retroexcavadora",
            "base_price_hr": 80000,
            "hours_today": 8,
            "additional_days": 5,
            "transport_cost": 0
        })
        assert r.status_code == 200
        d = r.json()
        today_cost = d["today"]["total_cost"]
        additional_cost = d["additional_days"]["total_cost"]
        assert today_cost > 0
        assert additional_cost == 80000 * 8 * 5  # 8h/día * 5 días
        assert d["final_price"] == round(d["final_price"])

    def test_hibrido_con_base_price_hr(self):
        """Hybrid debe aceptar base_price_hr"""
        r = api_post("/api/pricing/hybrid", {
            "base_price_hr": 50000,
            "hours_today": 6,
            "additional_days": 1,
            "transport_cost": 20000
        })
        assert r.status_code == 200
        assert r.json()["final_price"] > 0


# ===========================================
# CONSISTENCIA PROVEEDOR vs CLIENTE
# ===========================================

class TestConsistenciaProveedorCliente:
    """Cliente paga X, proveedor recibe Y. Comisiones coherentes."""

    def test_cliente_paga_maqgo_recibe_diferencia(self):
        """Cliente paga más que lo que recibe el proveedor (comisión MAQGO)"""
        r = api_post("/api/pricing/immediate", {
            "machinery_type": "retroexcavadora",
            "base_price_hr": 45000,
            "hours": 4,
            "transport_cost": 25000,
            "is_immediate": True
        })
        assert r.status_code == 200
        d = r.json()
        final_cliente = d["final_price"]
        net_proveedor = d["breakdown"]["provider_net"]
        assert final_cliente > net_proveedor
        # Diferencia razonable (comisión 10% cliente + 10% proveedor)
        diff = final_cliente - net_proveedor
        assert diff > 0

    def test_redondeo_sin_fracciones_raras(self):
        """Todos los valores monetarios deben ser enteros (multiplier es float OK)"""
        money_keys = {"service_cost", "transport_cost", "subtotal", "client_commission",
                      "client_commission_iva", "provider_commission", "provider_commission_iva",
                      "final_price", "provider_net", "base_price"}
        for machinery in ["retroexcavadora", "camion_pluma"]:
            r = api_post("/api/pricing/immediate", {
                "machinery_type": machinery,
                "base_price_hr": 45000,
                "hours": 4,
                "transport_cost": 25000,
                "is_immediate": True
            })
            assert r.status_code == 200, f"Fallo para {machinery}"
            d = r.json()
            assert d["final_price"] == int(d["final_price"])
            for k, v in d.get("breakdown", {}).items():
                if k in money_keys and isinstance(v, (int, float)):
                    assert v == round(v), f"breakdown.{k}={v} no es entero"


# ===========================================
# EDGE CASES Y VALIDACIONES
# ===========================================

class TestEdgeCases:
    """Casos límite"""

    def test_horas_invalidas_rechazadas(self):
        for h in [0, 1, 3, 9, 10]:
            r = api_post("/api/pricing/immediate", {
                "base_price_hr": 45000,
                "hours": h,
                "transport_cost": 0,
                "is_immediate": True
            })
            assert r.status_code in [400, 422], f"Horas={h} debería rechazarse"

    def test_base_price_cero_rechazado(self):
        r = api_post("/api/pricing/immediate", {
            "base_price_hr": 0,
            "hours": 4,
            "transport_cost": 0,
            "is_immediate": True
        })
        assert r.status_code in [400, 422]

    def test_maquinaria_invalida_rechazada(self):
        r = api_post("/api/pricing/immediate", {
            "machinery_type": "helicoptero",
            "base_price_hr": 45000,
            "hours": 4,
            "transport_cost": 0,
            "is_immediate": True
        })
        assert r.status_code in [400, 422]

    def test_todos_tipos_maquinaria_aceptados(self):
        tipos = [
            "retroexcavadora", "excavadora", "bulldozer", "motoniveladora",
            "compactadora", "minicargador", "grua", "camion_pluma",
            "camion_aljibe", "camion_tolva"
        ]
        for t in tipos:
            base = 50000 if t in ["retroexcavadora", "excavadora", "bulldozer", "motoniveladora", "compactadora", "minicargador"] else 250000
            r = api_post("/api/pricing/immediate", {
                "machinery_type": t,
                "base_price_hr": base,
                "hours": 4,
                "transport_cost": 25000 if "camion" not in t and t != "grua" else 0,
                "is_immediate": True
            })
            assert r.status_code == 200, f"Fallo para {t}: {r.text}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
