"""
MAQGO - Pricing API Tests
Tests for the pricing endpoints (Opción C - Híbrido implementation)

Features tested:
- POST /api/pricing/immediate - returns service_amount, transport_cost, immediate_bonus, iva, final_price
- GET /api/pricing/multiplier/{hours} - returns multiplier and adjustment range
- GET /api/pricing/multipliers - returns all multipliers
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test constants matching backend (pricing/constants.py IMMEDIATE_MULTIPLIERS)
MULTIPLIERS = {4: 1.20, 5: 1.175, 6: 1.15, 7: 1.125, 8: 1.10}
MAQGO_COMMISSION_RATE = 0.15
IVA_RATE = 0.19


class TestPricingImmediateEndpoint:
    """Tests for POST /api/pricing/immediate endpoint"""
    
    def test_immediate_pricing_basic(self):
        """Test basic immediate pricing calculation with required fields"""
        response = requests.post(f"{BASE_URL}/api/pricing/immediate", json={
            "base_price_hr": 45000,
            "hours": 4,
            "transport_cost": 25000,
            "is_immediate": True
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify all required fields for "Opción C - Híbrido" display
        assert "final_price" in data, "Missing final_price"
        assert "service_amount" in data, "Missing service_amount"
        assert "transport_cost" in data, "Missing transport_cost"
        assert "immediate_bonus" in data, "Missing immediate_bonus"
        # API returns client_commission_iva (IVA sobre comisión cliente)
        assert "client_commission_iva" in data or "iva" in data, "Missing iva or client_commission_iva"
        
        # Verify values are positive numbers
        assert data["final_price"] > 0, "final_price should be positive"
        assert data["service_amount"] > 0, "service_amount should be positive"
        assert data["transport_cost"] >= 0, "transport_cost should be non-negative"
        assert data["immediate_bonus"] >= 0, "immediate_bonus should be non-negative"
        iva_val = data.get("client_commission_iva", data.get("iva", 0))
        assert iva_val >= 0, "iva should be non-negative"
        
        iva_val = data.get("client_commission_iva", data.get("iva", 0))
        print(f"✅ Immediate pricing response: final_price={data['final_price']}, service_amount={data['service_amount']}, transport_cost={data['transport_cost']}, immediate_bonus={data['immediate_bonus']}, iva={iva_val}")
    
    def test_immediate_pricing_4_hours(self):
        """Test immediate pricing for 4 hours (highest multiplier 1.30)"""
        base_price = 45000
        hours = 4
        transport = 25000
        
        response = requests.post(f"{BASE_URL}/api/pricing/immediate", json={
            "base_price_hr": base_price,
            "hours": hours,
            "transport_cost": transport,
            "is_immediate": True
        })
        
        assert response.status_code == 200
        data = response.json()
        
        # service_amount should be base_price * hours (without multiplier for display)
        expected_service = base_price * hours
        assert data["service_amount"] == expected_service, f"Expected service_amount {expected_service}, got {data['service_amount']}"
        
        # immediate_bonus should be positive (multiplier effect)
        assert data["immediate_bonus"] > 0, "immediate_bonus should be positive for immediate reservation"
        
        print(f"✅ 4-hour pricing: service={data['service_amount']}, bonus={data['immediate_bonus']}, total={data['final_price']}")
    
    def test_immediate_pricing_8_hours(self):
        """Test immediate pricing for 8 hours (lowest multiplier 1.10)"""
        base_price = 45000
        hours = 8
        transport = 25000
        
        response = requests.post(f"{BASE_URL}/api/pricing/immediate", json={
            "base_price_hr": base_price,
            "hours": hours,
            "transport_cost": transport,
            "is_immediate": True
        })
        
        assert response.status_code == 200
        data = response.json()
        
        expected_service = base_price * hours
        assert data["service_amount"] == expected_service
        
        # 8 hours has lower multiplier, so bonus should be less than 4 hours
        print(f"✅ 8-hour pricing: service={data['service_amount']}, bonus={data['immediate_bonus']}, total={data['final_price']}")
    
    def test_immediate_pricing_no_transport(self):
        """Test immediate pricing without transport cost"""
        response = requests.post(f"{BASE_URL}/api/pricing/immediate", json={
            "base_price_hr": 50000,
            "hours": 6,
            "transport_cost": 0,
            "is_immediate": True
        })
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["transport_cost"] == 0, "transport_cost should be 0"
        assert data["final_price"] > 0, "final_price should still be positive"
        
        print(f"✅ No transport pricing: final_price={data['final_price']}")
    
    def test_immediate_pricing_all_hours(self):
        """Test immediate pricing for all valid hour values (4-8)"""
        base_price = 45000
        transport = 25000
        
        for hours in [4, 5, 6, 7, 8]:
            response = requests.post(f"{BASE_URL}/api/pricing/immediate", json={
                "base_price_hr": base_price,
                "hours": hours,
                "transport_cost": transport,
                "is_immediate": True
            })
            
            assert response.status_code == 200, f"Failed for {hours} hours"
            data = response.json()
            
            assert data["service_amount"] == base_price * hours
            assert data["final_price"] > 0
            
            print(f"✅ {hours}h: service={data['service_amount']}, bonus={data['immediate_bonus']}, total={data['final_price']}")
    
    def test_immediate_pricing_camion_tolva_per_trip(self):
        """Camión Tolva: service_amount = precio viaje, NO precio × horas (regresión desglose)"""
        response = requests.post(f"{BASE_URL}/api/pricing/immediate", json={
            "machinery_type": "camion_tolva",
            "base_price_hr": 45000,
            "hours": 4,
            "transport_cost": 0,
            "is_immediate": True
        })
        assert response.status_code == 200
        data = response.json()
        # Para por-viaje: service_amount = base_price (1 viaje), no 45000*4
        assert data["service_amount"] == 45000, f"service_amount debe ser 45000 (viaje), no {data['service_amount']}"
        assert data["service_amount"] != 180000, "Regresión: NO debe ser precio×horas"
        print(f"✅ Camión Tolva: service_amount={data['service_amount']} (correcto: precio viaje)")

    def test_immediate_pricing_invalid_hours_low(self):
        """Test that hours below 4 are rejected"""
        response = requests.post(f"{BASE_URL}/api/pricing/immediate", json={
            "base_price_hr": 45000,
            "hours": 3,
            "transport_cost": 25000,
            "is_immediate": True
        })
        
        assert response.status_code == 422 or response.status_code == 400, f"Expected 400/422 for invalid hours, got {response.status_code}"
        print(f"✅ Correctly rejected hours=3 with status {response.status_code}")
    
    def test_immediate_pricing_invalid_hours_high(self):
        """Test that hours above 8 are rejected"""
        response = requests.post(f"{BASE_URL}/api/pricing/immediate", json={
            "base_price_hr": 45000,
            "hours": 9,
            "transport_cost": 25000,
            "is_immediate": True
        })
        
        assert response.status_code == 422 or response.status_code == 400, f"Expected 400/422 for invalid hours, got {response.status_code}"
        print(f"✅ Correctly rejected hours=9 with status {response.status_code}")
    
    def test_immediate_pricing_missing_base_price(self):
        """Test that missing base price is rejected"""
        response = requests.post(f"{BASE_URL}/api/pricing/immediate", json={
            "hours": 4,
            "transport_cost": 25000,
            "is_immediate": True
        })
        
        # Should fail because base_price is required
        assert response.status_code in [400, 422], f"Expected 400/422 for missing base_price, got {response.status_code}"
        print(f"✅ Correctly rejected missing base_price with status {response.status_code}")


class TestMultiplierEndpoints:
    """Tests for multiplier-related endpoints"""
    
    def test_get_multiplier_4_hours(self):
        """Test GET /api/pricing/multiplier/4"""
        response = requests.get(f"{BASE_URL}/api/pricing/multiplier/4")
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["hours"] == 4
        assert data["system_multiplier"] == 1.20  # IMMEDIATE_MULTIPLIERS[4]
        assert "adjustment_range" in data
        assert "min" in data["adjustment_range"]
        assert "max" in data["adjustment_range"]
        
        print(f"✅ Multiplier for 4h: {data['system_multiplier']}, range: {data['adjustment_range']}")
    
    def test_get_multiplier_8_hours(self):
        """Test GET /api/pricing/multiplier/8"""
        response = requests.get(f"{BASE_URL}/api/pricing/multiplier/8")
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["hours"] == 8
        assert data["system_multiplier"] == 1.10
        
        print(f"✅ Multiplier for 8h: {data['system_multiplier']}, range: {data['adjustment_range']}")
    
    def test_get_all_multipliers(self):
        """Test GET /api/pricing/multipliers"""
        response = requests.get(f"{BASE_URL}/api/pricing/multipliers")
        
        assert response.status_code == 200
        data = response.json()
        
        assert "multipliers" in data
        assert "limits" in data
        
        # Verify all hours 4-8 are present
        for hours in [4, 5, 6, 7, 8]:
            assert str(hours) in data["multipliers"], f"Missing multiplier for {hours} hours"
        
        # Verify limits
        assert data["limits"]["min_hours"] == 4
        assert data["limits"]["max_hours"] == 8
        
        print(f"✅ All multipliers retrieved: {list(data['multipliers'].keys())}")
    
    def test_multiplier_adjustment_range(self):
        """Test that adjustment range is ±5% from system multiplier"""
        for hours in [4, 5, 6, 7, 8]:
            response = requests.get(f"{BASE_URL}/api/pricing/multiplier/{hours}")
            assert response.status_code == 200
            data = response.json()
            
            system_mult = data["system_multiplier"]
            adj_range = data["adjustment_range"]
            
            # Range should be approximately ±0.05 from system multiplier
            # Backend uses PROVIDER_ADJUSTMENT_RANGE = 0.05
            expected_min = max(system_mult - 0.05, 1.05)  # Min absolute is 1.05
            expected_max = min(system_mult + 0.05, 1.35)  # Max absolute is 1.35
            
            assert abs(adj_range["min"] - expected_min) < 0.02, f"Min range mismatch for {hours}h: got {adj_range['min']}, expected ~{expected_min}"
            assert abs(adj_range["max"] - expected_max) < 0.02, f"Max range mismatch for {hours}h: got {adj_range['max']}, expected ~{expected_max}"
            
            print(f"✅ {hours}h adjustment range: [{adj_range['min']}, {adj_range['max']}]")


class TestClientQuoteEndpoint:
    """Tests for client-only quote endpoint"""
    
    def test_client_quote_returns_only_final_price(self):
        """Test that client quote returns simplified response"""
        response = requests.post(f"{BASE_URL}/api/pricing/quote/client", json={
            "base_price": 45000,
            "hours": 4,
            "transport_cost": 25000
        })
        
        assert response.status_code == 200
        data = response.json()
        
        assert "final_price" in data
        assert data["final_price"] > 0
        
        print(f"✅ Client quote: final_price={data['final_price']}")


class TestScheduledPricing:
    """Tests for scheduled (non-immediate) pricing"""
    
    def test_scheduled_pricing_basic(self):
        """Test scheduled pricing (8-hour fixed workday, no multiplier)"""
        response = requests.post(f"{BASE_URL}/api/pricing/scheduled", json={
            "machinery_type": "retroexcavadora",
            "base_price": 45000,
            "days": 1,
            "transport_cost": 25000
        })
        
        assert response.status_code == 200
        data = response.json()
        
        assert "final_price" in data
        assert data["reservation_type"] == "scheduled"
        
        # For scheduled, service cost = base_price * 8 hours * days
        expected_service = 45000 * 8 * 1
        assert data["breakdown"]["service_cost"] == expected_service
        
        print(f"✅ Scheduled pricing: final_price={data['final_price']}")


class TestAPIHealth:
    """Basic API health tests"""
    
    def test_api_root(self):
        """Test API root endpoint"""
        response = requests.get(f"{BASE_URL}/api/")
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["status"] == "operational"
        print(f"✅ API is operational: {data['message']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
