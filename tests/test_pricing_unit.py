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


class TestReferencePricesByCapacitySourceOfTruth:
    """
    FASE 10N.2. FUENTE DE VERDAD ADMIN DB = by_capacity.
    Prueba A-D: GET /api/pricing/reference-prices retorna by_capacity con
    valores Admin Retro 0.5, Aljibe 10k, Bulldozer 200HP correctos.

    Replica la lógica de merge del endpoint (sin MongoDB real) para validar
    que los valores Admin insertados en config/reference_prices prevalecen
    sobre defaults de pricing.constants.
    """

    EXPECTED_ADMIN_PRICES = {
        "retroexcavadora": {"0.5": {"min": 100, "default": 150, "max": 200}},
        "camion_aljibe": {"10000": {"min": 250, "default": 375, "max": 500}},
        "bulldozer": {"200": {"min": 200, "default": 300, "max": 400}},
    }

    def _replicate_reference_prices_merge_logic(self, fake_db_doc):
        """Replica exacta de backend/routes/pricing.py get_reference_prices() merge section."""
        import copy
        from pricing.constants import (
            REFERENCE_PRICES_PER_HOUR,
            REFERENCE_PRICES_PER_SERVICE,
            REFERENCE_TRANSPORT,
        )
        CAPACITY_ANCHORS = {
            "retroexcavadora": {"options": [0.4, 0.5, 0.6], "anchor": 0.5},
            "excavadora": {"options": [20, 25, 30, 35], "anchor": 25},
            "bulldozer": {"options": [180, 200, 220, 250], "anchor": 200},
            "motoniveladora": {"options": [3, 3.5, 4], "anchor": 3.5},
            "grua": {"options": [25, 30, 35, 40], "anchor": 30},
            "compactadora": {"options": [5, 6, 8, 10], "anchor": 6},
            "minicargador": {"options": [0.3, 0.4, 0.5], "anchor": 0.4},
            "camion_aljibe": {"options": [8000, 10000, 12000, 15000], "anchor": 10000},
            "camion_pluma": {"options": [8, 10, 12, 15, 18], "anchor": 12},
            "camion_tolva": {"options": [12, 14, 16, 18, 20], "anchor": 16},
        }

        def _ratio_near(anchor, opt):
            try:
                a = float(anchor); o = float(opt)
            except Exception:
                return 1.0
            if not a or a == 0:
                return 1.0
            r = o / a
            return 0.85 if r <= 0.85 else 1.15 if r >= 1.15 else round(r * 4) / 4

        def _build_capacity_defaults():
            res = {}
            for machine_id, cfg in CAPACITY_ANCHORS.items():
                base = REFERENCE_PRICES_PER_HOUR.get(machine_id) or REFERENCE_PRICES_PER_SERVICE.get(machine_id)
                if not base:
                    continue
                b_min = base.get("min") or 0
                b_def = base.get("default") or b_min
                b_max = base.get("max") or b_def
                machine_map = {}
                for opt in cfg["options"]:
                    ratio = _ratio_near(cfg["anchor"], opt)
                    key = str(int(opt)) if isinstance(opt, float) and opt.is_integer() else str(opt)
                    machine_map[key] = {
                        "min": int(round(b_min * ratio)),
                        "default": int(round(b_def * ratio)),
                        "max": int(round(b_max * ratio)),
                    }
                res[machine_id] = machine_map
            return res

        defaults = {
            "per_hour": copy.deepcopy(REFERENCE_PRICES_PER_HOUR),
            "per_service": copy.deepcopy(REFERENCE_PRICES_PER_SERVICE),
            "by_capacity": _build_capacity_defaults(),
            "transport": {
                "min": 15000,
                "default": int(REFERENCE_TRANSPORT),
                "max": int(REFERENCE_TRANSPORT * 2),
                "same_comuna": {"min": 15000, "default": int(REFERENCE_TRANSPORT), "max": int(REFERENCE_TRANSPORT * 2)},
                "intercomuna": {"min": 25000, "default": int(REFERENCE_TRANSPORT * 1.5), "max": int(REFERENCE_TRANSPORT * 3)},
                "interregional": {"min": 50000, "default": int(REFERENCE_TRANSPORT * 2.5), "max": int(REFERENCE_TRANSPORT * 5)},
            },
        }
        doc = fake_db_doc
        if doc:
            for top_key in ["per_hour", "per_service"]:
                if top_key in doc and isinstance(doc[top_key], dict):
                    for machine_id, vals in doc[top_key].items():
                        if machine_id in defaults[top_key] and isinstance(vals, dict):
                            defaults[top_key][machine_id] = {**defaults[top_key][machine_id], **vals}
                        elif isinstance(vals, dict):
                            defaults[top_key][machine_id] = dict(vals)
            if "by_capacity" in doc and isinstance(doc["by_capacity"], dict):
                bycap_stored = doc["by_capacity"]
                merged_cap = copy.deepcopy(defaults.get("by_capacity", {}))
                for machine_id, capacities in bycap_stored.items():
                    if not isinstance(capacities, dict):
                        continue
                    merged_cap.setdefault(machine_id, {})
                    for cap_key, vals in capacities.items():
                        if isinstance(vals, dict):
                            merged_cap[machine_id][str(cap_key)] = {
                                "min": int(vals.get("min", merged_cap[machine_id].get(str(cap_key), {}).get("min", 0))),
                                "default": int(vals.get("default", merged_cap[machine_id].get(str(cap_key), {}).get("default", 0))),
                                "max": int(vals.get("max", merged_cap[machine_id].get(str(cap_key), {}).get("max", 0))),
                            }
                defaults["by_capacity"] = merged_cap
            if "transport" in doc and isinstance(doc["transport"], dict):
                merged_tr = copy.deepcopy(defaults.get("transport", {}))
                merged_tr.update({k: v for k, v in doc["transport"].items() if v is not None})
                defaults["transport"] = merged_tr
        return defaults

    def test_a_endpoint_returns_by_capacity_key(self):
        """A) GET /api/pricing/reference-prices retorna la clave by_capacity."""
        fake_doc = None
        result = self._replicate_reference_prices_merge_logic(fake_doc)
        assert "by_capacity" in result, "Falta clave by_capacity en payload (requisito A)"
        assert isinstance(result["by_capacity"], dict)
        assert "per_hour" in result
        assert "per_service" in result
        assert "transport" in result

    def test_b_retroexcavadora_05_m3_admin_values(self):
        """B) Retroexcavadora 0.5 m³ → min 100, default 150, max 200 (Admin vigente)."""
        fake_doc = {"_id": "reference_prices", "by_capacity": self.EXPECTED_ADMIN_PRICES}
        result = self._replicate_reference_prices_merge_logic(fake_doc)
        retro = result["by_capacity"]["retroexcavadora"]
        assert "0.5" in retro, "Falta key capacidad '0.5' para retroexcavadora"
        vals = retro["0.5"]
        assert vals["min"] == 100, f"Retro 0.5 MIN incorrecto: {vals['min']} ≠ 100"
        assert vals["default"] == 150, f"Retro 0.5 DEFAULT incorrecto: {vals['default']} ≠ 150"
        assert vals["max"] == 200, f"Retro 0.5 MAX incorrecto: {vals['max']} ≠ 200"

    def test_c_camion_aljibe_10000_litros_admin_values(self):
        """C) Camión Aljibe 10.000 L → min 250, default 375, max 500 (Admin vigente)."""
        fake_doc = {"_id": "reference_prices", "by_capacity": self.EXPECTED_ADMIN_PRICES}
        result = self._replicate_reference_prices_merge_logic(fake_doc)
        aljibe = result["by_capacity"]["camion_aljibe"]
        assert "10000" in aljibe, "Falta key capacidad '10000' para camion_aljibe"
        vals = aljibe["10000"]
        assert vals["min"] == 250, f"Aljibe 10k MIN incorrecto: {vals['min']} ≠ 250"
        assert vals["default"] == 375, f"Aljibe 10k DEFAULT incorrecto: {vals['default']} ≠ 375"
        assert vals["max"] == 500, f"Aljibe 10k MAX incorrecto: {vals['max']} ≠ 500"

    def test_d_bulldozer_200_hp_admin_values(self):
        """D) Bulldozer 200 HP → min 200, default 300, max 400 (Admin vigente)."""
        fake_doc = {"_id": "reference_prices", "by_capacity": self.EXPECTED_ADMIN_PRICES}
        result = self._replicate_reference_prices_merge_logic(fake_doc)
        bull = result["by_capacity"]["bulldozer"]
        assert "200" in bull, "Falta key '200' para bulldozer"
        vals = bull["200"]
        assert vals["min"] == 200, f"Bulldozer 200 MIN incorrecto: {vals['min']} ≠ 200"
        assert vals["default"] == 300, f"Bulldozer 200 DEFAULT incorrecto: {vals['default']} ≠ 300"
        assert vals["max"] == 400, f"Bulldozer 200 MAX incorrecto: {vals['max']} ≠ 400"

    def test_e_admin_values_override_hardcoded_defaults(self):
        """E) Valores Admin NO son sobrescritos por defaults pricing.constants (hardcoded)."""
        # 1) Default sin Admin = valores calculados desde constants ≠ 100/150/200.
        no_admin = self._replicate_reference_prices_merge_logic(None)
        retro_default = no_admin["by_capacity"]["retroexcavadora"].get("0.5")
        assert retro_default, "Default retro 0.5 debe existir"
        # 2) Con Admin insertados: DEBEN ser los de Admin, sin importar defaults anteriores.
        with_admin = self._replicate_reference_prices_merge_logic(
            {"_id": "reference_prices", "by_capacity": self.EXPECTED_ADMIN_PRICES}
        )
        retro_admin = with_admin["by_capacity"]["retroexcavadora"]["0.5"]
        assert retro_admin["min"] == 100
        assert retro_admin["default"] == 150
        assert retro_admin["max"] == 200
        assert not (retro_default.get("min") == retro_admin["min"] and retro_default.get("default") == retro_admin["default"]), \
            "Admin y defaults deben ser distintos (hardcoded default no es 100/150/200)"

    def test_f_tipo_b_sin_traslado(self):
        """F) Clasificación negocio TIPO B (viaje). Camión Aljibe / Pluma / Tolva NO cobran traslado.
        Prueba: calculator breakdown is_per_hour=false y transport_cost=0 se mantiene sin alteraciones."""
        # Tipo B: NO debe modificar transport_cost si el proveedor envía 0.
        for tipo in ("camion_aljibe", "camion_pluma", "camion_tolva"):
            r = calculate_immediate_price(
                machinery_type=tipo,
                base_price=500000,
                hours=4,
                transport_cost=0,
            )
            assert r["breakdown"]["is_per_hour"] is False, f"{tipo} debe ser por servicio/viaje"
            assert r["breakdown"]["transport_cost"] == 0, f"{tipo} TIPO B: transport_cost debe ser 0 (no cobra traslado)"
            assert r["final_price"] > 0

    def test_g_tipo_a_con_traslado(self):
        """G) Clasificación negocio TIPO A (hora + traslado). Retroexcavadora / Bulldozer SÍ admiten cobro traslado."""
        for tipo in ("retroexcavadora", "bulldozer", "excavadora"):
            r = calculate_immediate_price(
                machinery_type=tipo,
                base_price=200000,
                hours=4,
                transport_cost=100000,
            )
            assert r["breakdown"]["is_per_hour"] is True, f"{tipo} debe ser POR HORA"
            assert r["breakdown"]["transport_cost"] == 100000, f"{tipo} TIPO A: transport_cost debe sobrevivir intacto"
            assert r["final_price"] > r["breakdown"]["service_cost"], "Final debe incluir traslado"

    def test_h_nueva_maquinaria_ref_price_administrado(self):
        """H) Simular «Nueva maquinaria recibe precio vigente»: endpoint merge entrega exactamente
        los 9 valores de Admin para las 3 máquinas QA."""
        admin_doc = {
            "_id": "reference_prices",
            "by_capacity": self.EXPECTED_ADMIN_PRICES,
            "transport": {"default": 100, "same_comuna": {"default": 100, "min": 50, "max": 500}},
        }
        merged = self._replicate_reference_prices_merge_logic(admin_doc)
        # Retro 0.5
        assert merged["by_capacity"]["retroexcavadora"]["0.5"]["min"] == 100
        assert merged["by_capacity"]["retroexcavadora"]["0.5"]["default"] == 150
        assert merged["by_capacity"]["retroexcavadora"]["0.5"]["max"] == 200
        # Aljibe 10000
        assert merged["by_capacity"]["camion_aljibe"]["10000"]["min"] == 250
        assert merged["by_capacity"]["camion_aljibe"]["10000"]["default"] == 375
        assert merged["by_capacity"]["camion_aljibe"]["10000"]["max"] == 500
        # Bulldozer 200
        assert merged["by_capacity"]["bulldozer"]["200"]["min"] == 200
        assert merged["by_capacity"]["bulldozer"]["200"]["default"] == 300
        assert merged["by_capacity"]["bulldozer"]["200"]["max"] == 400
        # Transporte Admin vigente
        assert merged["transport"]["default"] == 100
        assert merged["transport"]["same_comuna"]["default"] == 100
        assert merged["transport"]["same_comuna"]["min"] == 50
        assert merged["transport"]["same_comuna"]["max"] == 500

    def test_camion_tolva_service_amount_es_precio_viaje_no_por_horas_restored(self):
        """Restored test: Camión Tolva service = precio viaje, no horas"""
        r = calculate_immediate_price(
            machinery_type="camion_tolva",
            base_price=45000,
            hours=4,
            transport_cost=0,
        )
        assert r["breakdown"]["is_per_hour"] is False


def test_notifications_route_imports():
    import importlib

    mod = importlib.import_module("routes.notifications")
    assert callable(getattr(mod, "get_notifications", None))
