from routes.invoices import generate_voucher_html


def test_voucher_does_not_expose_provider_identity():
    html = generate_voucher_html(
        {
            "id": "SVC-1",
            "date": "2026-05-28",
            "machineryType": "Excavadora",
            "hours": 8,
            "providerName": "Proveedor Secreto SpA",
            "serviceAmount": 100000,
            "bonusAmount": 0,
            "transportAmount": 0,
        }
    )
    assert "Proveedor Secreto SpA" not in html
    assert ">Proveedor<" not in html
    assert "Subtotal Proveedor" not in html

