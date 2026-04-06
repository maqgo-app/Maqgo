"""
MAQGO - Backend API Tests for Operators/Team Management
Tests for:
- Team management API (/api/operators/team/{owner_id})
- Operator invitation (/api/operators/invite)
- Master invitation (/api/operators/masters/invite)
- Operator join (/api/operators/join)
- Master join (/api/operators/masters/join)
- RBAC permissions (Titular vs Gerente)

Este módulo NO corre en producción: solo pytest en tu máquina o CI.
El default 127.0.0.1:8000 es el API local levantado con uvicorn; no es www.maqgo.cl.
Override: MAQGO_LIVE_API_TEST_URL=https://api.ejemplo.com
"""
import pytest
import requests
import os
import uuid

BASE_URL = (
    os.environ.get('MAQGO_LIVE_API_TEST_URL', '').strip()
    or os.environ.get('REACT_APP_BACKEND_URL', '').strip()
    or 'http://127.0.0.1:8000'
).rstrip('/')

# Test owner ID provided in requirements
TEST_OWNER_ID = "ed69f543-6c21-4b62-9bb6-537b1c24ac23"


def _live_api_available() -> bool:
    """Estos tests pegan a un servidor real; sin él, skip (local/CI sin backend)."""
    if os.environ.get('MAQGO_SKIP_LIVE_API_TESTS', '').strip().lower() in ('1', 'true', 'yes'):
        return False
    try:
        r = requests.get(f'{BASE_URL}/api/health', timeout=1.5)
        return r.status_code == 200
    except Exception:
        return False


pytestmark = pytest.mark.skipif(
    not _live_api_available(),
    reason=f'Live API not reachable at {BASE_URL} (start backend; set MAQGO_SKIP_LIVE_API_TESTS=1 to skip)',
)




class TestTeamManagementAPI:
    """Tests for /api/operators/team/{owner_id} endpoint"""
    
    def test_get_team_returns_masters_and_operators(self):
        """GET /api/operators/team/{owner_id} should return masters and operators"""
        response = requests.get(f"{BASE_URL}/api/operators/team/{TEST_OWNER_ID}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify response structure
        assert "owner_id" in data, "Response should contain owner_id"
        assert "masters" in data, "Response should contain masters list"
        assert "operators" in data, "Response should contain operators list"
        assert "masters_count" in data, "Response should contain masters_count"
        assert "operators_count" in data, "Response should contain operators_count"
        assert "pending_invitations" in data, "Response should contain pending_invitations"
        
        # Verify data types
        assert isinstance(data["masters"], list), "masters should be a list"
        assert isinstance(data["operators"], list), "operators should be a list"
        assert isinstance(data["masters_count"], int), "masters_count should be int"
        assert isinstance(data["operators_count"], int), "operators_count should be int"
        
        print(f"✓ Team API returns {data['masters_count']} masters and {data['operators_count']} operators")
    
    def test_get_team_invalid_owner_returns_empty(self):
        """GET /api/operators/team/{invalid_id} should return empty lists"""
        fake_owner_id = str(uuid.uuid4())
        response = requests.get(f"{BASE_URL}/api/operators/team/{fake_owner_id}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert data["masters_count"] == 0, "Should have 0 masters for invalid owner"
        assert data["operators_count"] == 0, "Should have 0 operators for invalid owner"
        
        print("✓ Team API returns empty for invalid owner")


class TestOperatorInvitationAPI:
    """Tests for operator invitation endpoints"""
    
    def test_create_operator_invitation(self):
        """POST /api/operators/invite should generate invitation code"""
        response = requests.post(
            f"{BASE_URL}/api/operators/invite",
            json={"owner_id": TEST_OWNER_ID}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") == True, "Response should indicate success"
        assert "code" in data, "Response should contain invitation code"
        assert len(data["code"]) == 6, "Invitation code should be 6 characters"
        assert data["code"].isalnum(), "Code should be alphanumeric"
        
        print(f"✓ Operator invitation code generated: {data['code']}")
        return data["code"]
    
    def test_create_operator_invitation_invalid_owner(self):
        """POST /api/operators/invite with invalid owner should fail"""
        fake_owner_id = str(uuid.uuid4())
        response = requests.post(
            f"{BASE_URL}/api/operators/invite",
            json={"owner_id": fake_owner_id}
        )
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Operator invitation fails for invalid owner")
    
    def test_join_as_operator_with_valid_code(self):
        """POST /api/operators/join should allow joining with valid code"""
        # First create an invitation
        invite_response = requests.post(
            f"{BASE_URL}/api/operators/invite",
            json={"owner_id": TEST_OWNER_ID}
        )
        assert invite_response.status_code == 200
        code = invite_response.json()["code"]
        
        # Now join with the code
        join_response = requests.post(
            f"{BASE_URL}/api/operators/join",
            json={
                "code": code,
                "operator_name": "TEST_Operador Prueba",
                "operator_phone": "+56912345678",
                "operator_rut": "12.345.678-9"
            }
        )
        
        assert join_response.status_code == 200, f"Expected 200, got {join_response.status_code}: {join_response.text}"
        
        data = join_response.json()
        assert data.get("success") == True, "Join should succeed"
        assert "operator_id" in data, "Response should contain operator_id"
        assert "owner_id" in data, "Response should contain owner_id"
        assert data["owner_id"] == TEST_OWNER_ID, "Owner ID should match"
        
        print(f"✓ Operator joined successfully with ID: {data['operator_id']}")
        return data["operator_id"]
    
    def test_join_as_operator_with_invalid_code(self):
        """POST /api/operators/join with invalid code should fail"""
        response = requests.post(
            f"{BASE_URL}/api/operators/join",
            json={
                "code": "INVALID",
                "operator_name": "Test",
                "operator_phone": "+56912345678",
                "operator_rut": "12.345.678-9"
            }
        )
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Join fails with invalid code")
    
    def test_join_as_operator_code_cannot_be_reused(self):
        """POST /api/operators/join - code should not be reusable"""
        # Create invitation
        invite_response = requests.post(
            f"{BASE_URL}/api/operators/invite",
            json={"owner_id": TEST_OWNER_ID}
        )
        code = invite_response.json()["code"]
        
        # First join - should succeed
        first_join = requests.post(
            f"{BASE_URL}/api/operators/join",
            json={
                "code": code,
                "operator_name": "TEST_First Operator",
                "operator_phone": "+56911111111",
                "operator_rut": "11.111.111-1"
            }
        )
        assert first_join.status_code == 200
        
        # Second join with same code - should fail
        second_join = requests.post(
            f"{BASE_URL}/api/operators/join",
            json={
                "code": code,
                "operator_name": "TEST_Second Operator",
                "operator_phone": "+56922222222",
                "operator_rut": "22.222.222-2"
            }
        )
        assert second_join.status_code == 404, f"Expected 404 for reused code, got {second_join.status_code}"
        
        print("✓ Invitation code cannot be reused")


class TestMasterInvitationAPI:
    """Tests for master/gerente invitation endpoints"""
    
    def test_create_master_invitation_by_titular(self):
        """POST /api/operators/masters/invite should work for Titular (super_master)"""
        response = requests.post(
            f"{BASE_URL}/api/operators/masters/invite",
            json={"owner_id": TEST_OWNER_ID}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") == True, "Response should indicate success"
        assert "code" in data, "Response should contain invitation code"
        assert data.get("invite_type") == "master", "Invite type should be 'master'"
        assert len(data["code"]) == 6, "Invitation code should be 6 characters"
        
        print(f"✓ Master invitation code generated: {data['code']}")
        return data["code"]
    
    def test_join_as_master_with_valid_code(self):
        """POST /api/operators/masters/join should allow joining as Gerente"""
        # First create a master invitation
        invite_response = requests.post(
            f"{BASE_URL}/api/operators/masters/invite",
            json={"owner_id": TEST_OWNER_ID}
        )
        assert invite_response.status_code == 200
        code = invite_response.json()["code"]
        
        # Now join as master
        join_response = requests.post(
            f"{BASE_URL}/api/operators/masters/join",
            json={
                "code": code,
                "master_name": "TEST_Gerente Prueba",
                "master_phone": "+56987654321",
                "master_email": "gerente.test@example.com"
            }
        )
        
        assert join_response.status_code == 200, f"Expected 200, got {join_response.status_code}: {join_response.text}"
        
        data = join_response.json()
        assert data.get("success") == True, "Join should succeed"
        assert "master_id" in data, "Response should contain master_id"
        assert "owner_id" in data, "Response should contain owner_id"
        assert data["owner_id"] == TEST_OWNER_ID, "Owner ID should match"
        
        print(f"✓ Master joined successfully with ID: {data['master_id']}")
        return data["master_id"]
    
    def test_join_as_master_with_operator_code_fails(self):
        """POST /api/operators/masters/join with operator code should fail"""
        # Create operator invitation (not master)
        invite_response = requests.post(
            f"{BASE_URL}/api/operators/invite",
            json={"owner_id": TEST_OWNER_ID}
        )
        operator_code = invite_response.json()["code"]
        
        # Try to join as master with operator code
        join_response = requests.post(
            f"{BASE_URL}/api/operators/masters/join",
            json={
                "code": operator_code,
                "master_name": "TEST_Fake Master",
                "master_phone": "+56999999999"
            }
        )
        
        assert join_response.status_code == 404, f"Expected 404, got {join_response.status_code}"
        print("✓ Cannot join as master with operator invitation code")
    
    def test_join_as_operator_with_master_code_fails(self):
        """POST /api/operators/join with master code should fail"""
        # Create master invitation
        invite_response = requests.post(
            f"{BASE_URL}/api/operators/masters/invite",
            json={"owner_id": TEST_OWNER_ID}
        )
        master_code = invite_response.json()["code"]
        
        # Try to join as operator with master code
        join_response = requests.post(
            f"{BASE_URL}/api/operators/join",
            json={
                "code": master_code,
                "operator_name": "TEST_Fake Operator",
                "operator_phone": "+56988888888",
                "operator_rut": "88.888.888-8"
            }
        )
        
        # Should fail because the code is for master, not operator
        assert join_response.status_code == 404, f"Expected 404, got {join_response.status_code}"
        print("✓ Cannot join as operator with master invitation code")


class TestRBACPermissions:
    """Tests for Role-Based Access Control"""
    
    def test_master_cannot_invite_other_masters(self):
        """A Master (Gerente) should NOT be able to invite other Masters"""
        # First, create a master
        invite_response = requests.post(
            f"{BASE_URL}/api/operators/masters/invite",
            json={"owner_id": TEST_OWNER_ID}
        )
        code = invite_response.json()["code"]
        
        join_response = requests.post(
            f"{BASE_URL}/api/operators/masters/join",
            json={
                "code": code,
                "master_name": "TEST_Master Who Tries To Invite",
                "master_phone": "+56977777777"
            }
        )
        master_id = join_response.json()["master_id"]
        
        # Now try to create a master invitation using the master's ID (not owner)
        # This should fail because only super_master can invite masters
        invite_by_master = requests.post(
            f"{BASE_URL}/api/operators/masters/invite",
            json={"owner_id": master_id}  # Using master's ID, not owner's
        )
        
        # Should fail - master cannot invite other masters
        assert invite_by_master.status_code in [403, 404], f"Expected 403 or 404, got {invite_by_master.status_code}"
        print("✓ Master cannot invite other masters (RBAC enforced)")
    
    def test_verify_team_shows_correct_roles(self):
        """Verify team endpoint shows masters and operators with correct roles"""
        response = requests.get(f"{BASE_URL}/api/operators/team/{TEST_OWNER_ID}")
        data = response.json()
        
        # Check masters have correct role
        for master in data.get("masters", []):
            assert master.get("provider_role") == "master", f"Master should have role 'master', got {master.get('provider_role')}"
        
        # Check operators have correct role
        for operator in data.get("operators", []):
            assert operator.get("provider_role") == "operator", f"Operator should have role 'operator', got {operator.get('provider_role')}"
        
        print(f"✓ Team roles verified: {len(data.get('masters', []))} masters, {len(data.get('operators', []))} operators")


class TestInvitationManagement:
    """Tests for invitation management (cancel, list)"""
    
    def test_get_owner_invitations(self):
        """GET /api/operators/invitations/{owner_id} should list all invitations"""
        response = requests.get(f"{BASE_URL}/api/operators/invitations/{TEST_OWNER_ID}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "invitations" in data, "Response should contain invitations list"
        assert "count" in data, "Response should contain count"
        
        print(f"✓ Found {data['count']} invitations for owner")
    
    def test_cancel_pending_invitation(self):
        """DELETE /api/operators/invitation/{code} should cancel pending invitation"""
        # Create an invitation
        invite_response = requests.post(
            f"{BASE_URL}/api/operators/invite",
            json={"owner_id": TEST_OWNER_ID}
        )
        code = invite_response.json()["code"]
        
        # Cancel it
        cancel_response = requests.delete(
            f"{BASE_URL}/api/operators/invitation/{code}?owner_id={TEST_OWNER_ID}"
        )
        
        assert cancel_response.status_code == 200, f"Expected 200, got {cancel_response.status_code}"
        
        data = cancel_response.json()
        assert data.get("success") == True, "Cancel should succeed"
        
        # Verify it's cancelled by trying to use it
        join_response = requests.post(
            f"{BASE_URL}/api/operators/join",
            json={
                "code": code,
                "operator_name": "TEST_Should Fail",
                "operator_phone": "+56966666666",
                "operator_rut": "66.666.666-6"
            }
        )
        assert join_response.status_code == 404, "Cancelled invitation should not work"
        
        print("✓ Invitation cancelled successfully")


class TestOperatorStats:
    """Tests for operator statistics endpoint"""
    
    def test_get_operator_stats(self):
        """GET /api/operators/stats/{operator_id} should return stats"""
        # First create an operator
        invite_response = requests.post(
            f"{BASE_URL}/api/operators/invite",
            json={"owner_id": TEST_OWNER_ID}
        )
        code = invite_response.json()["code"]
        
        join_response = requests.post(
            f"{BASE_URL}/api/operators/join",
            json={
                "code": code,
                "operator_name": "TEST_Stats Operator",
                "operator_phone": "+56955555555",
                "operator_rut": "55.555.555-5"
            }
        )
        operator_id = join_response.json()["operator_id"]
        
        # Get stats
        stats_response = requests.get(f"{BASE_URL}/api/operators/stats/{operator_id}")
        
        assert stats_response.status_code == 200, f"Expected 200, got {stats_response.status_code}"
        
        data = stats_response.json()
        assert "operator_id" in data, "Response should contain operator_id"
        assert "rating" in data, "Response should contain rating"
        assert "total_services" in data, "Response should contain total_services"
        assert "total_hours" in data, "Response should contain total_hours"
        
        print(f"✓ Operator stats retrieved: rating={data['rating']}, services={data['total_services']}")
    
    def test_get_stats_invalid_operator(self):
        """GET /api/operators/stats/{invalid_id} should return 404"""
        fake_id = str(uuid.uuid4())
        response = requests.get(f"{BASE_URL}/api/operators/stats/{fake_id}")
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Stats returns 404 for invalid operator")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
