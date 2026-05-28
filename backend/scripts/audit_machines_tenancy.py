import argparse
from pymongo import MongoClient

from backend.db_config import get_db_name, get_mongo_url


def company_owner_id(user: dict) -> str | None:
    if not user:
        return None
    provider_role = user.get("provider_role")
    if provider_role in {None, "owner", "super_master"}:
        return user.get("id")
    return user.get("owner_id")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--limit", type=int, default=20)
    args = parser.parse_args()

    client = MongoClient(get_mongo_url(), serverSelectionTimeoutMS=5000)
    client.admin.command("ping")
    db = client[get_db_name()]

    users = db["users"]
    machines = db["machines"]

    user_docs = list(
        users.find(
            {},
            {"_id": 0, "id": 1, "provider_role": 1, "owner_id": 1, "role": 1, "roles": 1},
        )
    )
    user_by_id = {u.get("id"): u for u in user_docs if u.get("id")}

    machine_docs = list(
        machines.find(
            {"status": {"$ne": "deleted"}},
            {"_id": 0, "id": 1, "provider_id": 1, "machineryType": 1, "licensePlate": 1, "createdAt": 1},
        )
    )

    orphan_provider = []
    provider_is_operator = []
    provider_is_master = []
    provider_master_should_be_owner = []

    for m in machine_docs:
        pid = (m.get("provider_id") or "").strip()
        if not pid:
            orphan_provider.append(m)
            continue
        pu = user_by_id.get(pid)
        if not pu:
            orphan_provider.append(m)
            continue
        pr = pu.get("provider_role")
        if pr == "operator":
            provider_is_operator.append(m)
            continue
        if pr == "master":
            provider_is_master.append(m)
            owner = pu.get("owner_id")
            if owner and owner != pid:
                provider_master_should_be_owner.append((m, owner))
            continue

    def sample(items):
        out = []
        for it in items[: max(0, int(args.limit))]:
            out.append({"machine_id": it.get("id"), "provider_id": it.get("provider_id")})
        return out

    print("TENANCY_AUDIT db=", get_db_name())
    print("TENANCY_AUDIT machines_total=", len(machine_docs))
    print("TENANCY_AUDIT orphan_provider_id=", len(orphan_provider))
    print("TENANCY_AUDIT provider_id_is_operator=", len(provider_is_operator))
    print("TENANCY_AUDIT provider_id_is_master=", len(provider_is_master))
    print("TENANCY_AUDIT master_mismatch_should_move_to_owner_id=", len(provider_master_should_be_owner))
    print("TENANCY_AUDIT sample_orphan=", sample(orphan_provider))
    print("TENANCY_AUDIT sample_provider_operator=", sample(provider_is_operator))
    print("TENANCY_AUDIT sample_provider_master=", sample(provider_is_master))

    dup_keys = {}
    for m in machine_docs:
        pid = (m.get("provider_id") or "").strip()
        plate = (m.get("licensePlate") or "").strip().upper()
        mtype = (m.get("machineryType") or "").strip()
        if not pid or not plate or not mtype:
            continue
        k = (pid, plate, mtype)
        dup_keys[k] = dup_keys.get(k, 0) + 1
    dups = [{"provider_id": k[0], "licensePlate": k[1], "machineryType": k[2], "count": c} for k, c in dup_keys.items() if c > 1]
    dups.sort(key=lambda r: r["count"], reverse=True)
    print("TENANCY_AUDIT dup_machine_keys=", len(dups))
    if dups:
        print("TENANCY_AUDIT dup_machine_key_sample=", dups[: max(0, int(args.limit))])

    if not args.apply:
        return 0

    moved = 0
    for m, owner in provider_master_should_be_owner:
        mid = m.get("id")
        if not mid or not owner:
            continue
        res = machines.update_one({"id": mid}, {"$set": {"provider_id": owner}})
        moved += int(res.modified_count or 0)

    print("TENANCY_AUDIT applied_moves=", moved)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

