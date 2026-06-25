from typing import Dict

from utils.rbac import has_permission


def build_provider_permissions(user: dict, provider_role: str) -> Dict[str, bool]:
    if provider_role not in {"super_master", "master", "operator"}:
        return {}

    is_super = provider_role == "super_master"
    is_master = provider_role == "master"
    is_operator = provider_role == "operator"

    master_permissions = user.get("master_permissions", {}) if is_master else {}
    if not isinstance(master_permissions, dict):
        master_permissions = {}

    def _mperm(key: str) -> bool:
        return bool(master_permissions.get(key) is True)

    can_manage_machines = bool(is_super or (is_master and _mperm("can_manage_machines")))
    can_delete_machines = bool(is_super or (is_master and _mperm("can_delete_machines")))
    can_assign_operator = bool(is_super or (is_master and _mperm("can_assign_operator")))
    can_edit_master_profile = bool(is_super or (is_master and _mperm("can_edit_master_profile")))
    can_view_finance = bool(is_super or (is_master and _mperm("can_view_finance")))
    can_manage_operators = bool(is_super or (is_master and _mperm("can_manage_operators")))
    can_delete_master = bool(is_super or (is_master and _mperm("can_delete_master")))
    can_view_work_details = bool(is_super or (is_master and _mperm("can_view_work_details")))
    can_create_work = bool(is_super or (is_master and _mperm("can_create_work")))

    can_accept_requests = bool(has_permission(user, "accept_requests"))
    if is_master:
        can_accept_requests = bool(can_create_work)

    return {
        "can_view_finances": can_view_finance,
        "can_view_invoices": can_view_finance,
        "can_upload_invoice": can_view_finance,
        "can_manage_operators": can_manage_operators,
        "can_manage_masters": bool(is_super),
        "can_view_bank_data": bool(is_super),
        "can_accept_requests": bool(can_accept_requests),
        "can_view_services": bool(is_super or is_master or is_operator or can_view_work_details or can_create_work),
        "can_manage_machines": can_manage_machines,
        "can_delete_machines": can_delete_machines,
        "can_assign_operator": can_assign_operator,
        "can_edit_master_profile": can_edit_master_profile,
        "can_view_finance": can_view_finance,
        "can_delete_master": can_delete_master,
        "can_view_work_details": can_view_work_details,
        "can_create_work": can_create_work,
    }

