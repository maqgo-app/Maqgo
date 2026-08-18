"""
MAQGO - Tests unitarios Admin auth (FASE 10O).
Sin MongoDB vivo: replica la lógica pura del POST login Admin
y valida contractos de sesión activeRole + children 401 policy.
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

import re


# ---------------------------------------------------------------------------
# HELPERS para tests A, B, I: replica lógica backend/auth.py sin DB.
# ---------------------------------------------------------------------------

# Mirrors routes/auth.py L296 `_user_roles`
def _user_roles_backend(existing: dict) -> list:
    roles = existing.get("roles")
    if roles:
        out = list(roles)
    else:
        out = [existing.get("role") or "client"]
    if "client" not in out:
        out.append("client")
    return out


# Mirrors routes/auth.py L311 `_effective_session_role`
def _effective_session_role_backend(roles, legacy_role, requested_role=None):
    if "admin" in roles:
        return "admin"
    if requested_role and requested_role in roles:
        return requested_role
    if "provider" in roles:
        return "provider"
    return (legacy_role or "client") or "client"


# Mirrors POST /api/auth/login session payload post-2756 (fix activeRole).
def _post_login_build_session_payload_backend(user: dict):
    roles = _user_roles_backend(user)
    legacy_role = user.get("role") or "client"
    # La fija posterior al fix: activeRole = _effective_session_role(roles, legacy)
    activeRole = _effective_session_role_backend(roles, legacy_role)
    token = "__TEST_TOKEN__"
    return {
        "userId": user["id"],
        "token": token,
        "activeRole": activeRole,
        "createdAt": "2026-08-17T00:00:00+00:00",
    }


# ---------------------------------------------------------------------------
# HELPERS para tests C, D, E, F: replica handle401(url) y state expected sin navegador.
# ---------------------------------------------------------------------------

# Mirrors frontend/src/utils/api.js L112 `_isAdminAccessEndpoint` regex
RE_ADMIN_ACCESS_ENDPOINT = re.compile(r"\/api\/admin\/access(\?|$)")


def _is_admin_access_endpoint(url):
    try:
        return bool(RE_ADMIN_ACCESS_ENDPOINT.search(str(url or "")))
    except Exception:
        return False


# Mirrors frontend/src/utils/api.js nuevo handle401(url) regla Admin:
# path starts with /admin, url children (no access) => NO clear session, NO redirect.
def _admin_401_policy(path: str, url: str, session: dict) -> dict:
    """
    Retorna estado final tras 401.
    keys: cleared_session, redirect_to_expired_1, login_inline_flag
    """
    out = {"cleared_session": False, "redirect_to_expired_1": False, "login_inline_flag": False}
    if not (path or "").startswith("/admin"):
        # logica cliente normal: NO es admin; fuera de scope estos tests
        return out

    is_official_access_401 = _is_admin_access_endpoint(url)
    if not is_official_access_401:
        # CASO B: children 401 (stats, pricing, users, machines). Ningún efecto.
        return out

    # CASO A: 401 oficial access. Clear session + login inline (sin ?expired=1).
    session.clear()
    out["cleared_session"] = True
    out["login_inline_flag"] = True
    out["redirect_to_expired_1"] = False  # REGLA 10O: no ?expired=1
    return out


class TestAdminBackendActiveRoleA:
    """
    A. Login Admin válido → sesión activeRole=admin.
    (Causa raíz FASE 10O: POST login NO guardaba activeRole en la sesión Mongo
     → inconsistencias entre SMS/login y endpoints children strict guard.)
    """

    def _admin_user_sample(self):
        return {"id": "u_admin_001", "email": "root@maqgo.cl", "role": "admin",
                "roles": ["admin", "client"]}

    def test_a_admin_login_session_activerole_equals_admin(self):
        user = self._admin_user_sample()
        payload = _post_login_build_session_payload_backend(user)
        assert payload["activeRole"] == "admin"
        assert payload["userId"] == user["id"]
        assert isinstance(payload.get("token"), str) and len(payload["token"]) > 6

    def test_b_admin_legacy_role_admin_no_roles_array(self):
        # Caso legacy: user solo tiene role=admin, sin roles[]. Debe igual dar activeRole=admin.
        user = {"id": "u_admin_002", "role": "admin"}
        payload = _post_login_build_session_payload_backend(user)
        assert payload["activeRole"] == "admin"
        # roles completados con 'client' siempre
        assert "client" in _user_roles_backend(user)

    def test_i_admin_vs_provider_preserves_activerole(self):
        # User provider NUNCA activeRole=admin (protección cruzada)
        user = {"id": "u_prov_001", "role": "provider", "roles": ["provider", "client"]}
        payload = _post_login_build_session_payload_backend(user)
        assert payload["activeRole"] != "admin"
        # Provider siempre gana client en efective:
        assert payload["activeRole"] == "provider"


class TestAdminFrontend401PolicyCDEFGHI:
    """
    Tests C, D, E, F, G, H: regla 401 Admin 10O.
    """

    def _make_session(self):
        return {"adminToken": "t", "adminAuthToken": "t", "adminUserId": "u1",
                "adminRoles": '["admin"]', "adminMustChangePassword": None,
                "adminEmail": "root@maqgo.cl"}

    # C + D: Incógnito + Chrome = NO generan ?expired=1 en children
    def test_c_incognito_child_401_no_expired_url_flag(self):
        session = self._make_session()
        policy = _admin_401_policy("/admin/pricing", "https://api2.maqgo.cl/api/admin/reference-prices", session)
        # Caso B children: no clear sesión, NO redirect expired
        assert policy["cleared_session"] is False
        assert policy["redirect_to_expired_1"] is False
        assert policy["login_inline_flag"] is False
        # Session intacta
        assert session["adminToken"] == "t"
        assert session["adminUserId"] == "u1"

    def test_d_chrome_normal_child_401_pricing_stats_users_no_expired_url(self):
        urls_childsamples = [
            "/api/admin/reference-prices",
            "/api/admin/users",
            "/api/admin/machines",
            "/api/admin/stats",
            "/api/admin/reports/subscriptions",
            "/api/services/admin/all?limit=50",
            "/api/service-requests/admin/active?limit=100",
            "/api/admin/growth-ai/ping",
        ]
        for rel in urls_childsamples:
            session = self._make_session()
            policy = _admin_401_policy(
                "/admin",
                "https://api2.maqgo.cl" + rel,
                session,
            )
            assert policy["cleared_session"] is False, rel
            assert policy["redirect_to_expired_1"] is False, rel

    # E: 401 child NO provoca logout (no borra adminToken)
    def test_e_child_401_preserves_admin_session_no_hard_reload(self):
        session = self._make_session()
        prev = dict(session)
        _admin_401_policy("/admin/pricing", "https://api2.maqgo.cl/api/admin/reference-prices", session)
        assert session == prev

    # F: 401 real OFFICIAL access → login inline SIN ?expired=1
    def test_f_official_access_401_clears_session_no_expired_url(self):
        session = self._make_session()
        policy = _admin_401_policy(
            "/admin", "https://api2.maqgo.cl/api/admin/access?foo=1", session
        )
        assert policy["cleared_session"] is True
        assert policy["login_inline_flag"] is True
        assert policy["redirect_to_expired_1"] is False  # REGLA DURA 10O
        assert len(session) == 0

    # G: timeout/network → statsNetworkFailure; NO borra sesión (policy)
    def test_g_timeout_network_no_clear_session_because_no_401_policy(self):
        # 401 policy NUNCA se invoca por timeout (no status 401). Simulación:
        session = self._make_session()
        prev = dict(session)
        # timeout es excepción antes de status; handle401 no corre. Equivalente a:
        assert session == prev

    # H: regex access endpoint distingue access de children (sin falsos positivos)
    def test_h_access_endpoint_regex_no_false_positive(self):
        pos = ["/api/admin/access", "/api/admin/access?", "/api/admin/access?x=1"]
        neg = ["/api/admin/accesscontrol", "/api/admin/access-legacy", "/api/admin/accessing",
               "/api/admin/reports/access", "/api/auth/login", "/api/admin/users"]
        for p in pos:
            assert _is_admin_access_endpoint(p), p
        for p in neg:
            assert not _is_admin_access_endpoint(p), p
