from __future__ import annotations

import argparse
import json
from pathlib import Path

from services.transbank_certification_runner import (
    CertCase,
    run_case_oneclick_authorize_reject_by_amount,
    run_case_oneclick_inscription,
)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--email", required=True)
    ap.add_argument("--out", default="backend/qa-artifacts/transbank-cert")
    args = ap.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    cases = [
        CertCase(
            case_id="TBK_INSCRIPTION_REJECTED_CREDIT",
            operation="inscription",
            scenario="inscription_rejected",
            card_type="CREDIT",
            expected="REJECTED",
        ),
        CertCase(
            case_id="TBK_INSCRIPTION_APPROVED_CREDIT",
            operation="inscription",
            scenario="inscription_approved",
            card_type="CREDIT",
            expected="APPROVED",
        ),
        CertCase(
            case_id="TBK_AUTHORIZE_REJECT_BY_MAX_AMOUNT",
            operation="authorize",
            scenario="reject_by_max_amount",
            card_type="CREDIT",
            expected="REJECTED",
            amount=10_000_000,
        ),
    ]

    reports = []
    for c in cases:
        if c.operation == "inscription":
            reports.append(run_case_oneclick_inscription(c, args.email))
        elif c.operation == "authorize" and c.scenario == "reject_by_max_amount":
            reports.append(run_case_oneclick_authorize_reject_by_amount(c, args.email, amount=c.amount or 10_000_000))
        else:
            reports.append({"case_id": c.case_id, "ok": False, "error": "NOT_IMPLEMENTED"})

    (out_dir / "summary.json").write_text(json.dumps(reports, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()

