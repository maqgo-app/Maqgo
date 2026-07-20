from services.growth_ai_discovery import (
    discovery_dedupe_key,
    extract_chile_mobiles,
    extract_contact_links,
    extract_emails,
    parse_rss,
)


def test_extract_emails_dedupes_and_lowercases():
    text = "Contact: Ventas@Empresa.cl, soporte@empresa.cl, ventas@empresa.cl"
    assert extract_emails(text) == ["ventas@empresa.cl", "soporte@empresa.cl"]


def test_extract_chile_mobiles_normalizes():
    text = "Llámanos al +56 9 1234 5678 o 912345678"
    assert extract_chile_mobiles(text) == ["+56912345678"]


def test_extract_contact_links_filters_useful_paths():
    html = """
    <a href='https://example.com/contacto'>Contacto</a>
    <a href='https://example.com/blog'>Blog</a>
    <a href='mailto:ventas@example.com'>Mail</a>
    <a href='/cotizacion'>Cotiza</a>
    """
    links = extract_contact_links(html)
    assert "https://example.com/contacto" in links
    assert "/cotizacion" in links
    assert "https://example.com/blog" not in links


def test_parse_rss_extracts_items():
    xml = """<?xml version='1.0' encoding='UTF-8'?>
    <rss version='2.0'>
      <channel>
        <title>Feed</title>
        <item><title>Uno</title><link>https://a.com/1</link></item>
        <item><title>Dos</title><link>https://a.com/2</link></item>
      </channel>
    </rss>"""
    items = parse_rss(xml)
    assert items == [{"title": "Uno", "link": "https://a.com/1"}, {"title": "Dos", "link": "https://a.com/2"}]


def test_discovery_dedupe_key_stable():
    a = discovery_dedupe_key(source_id="x", link="https://a.com", email="a@b.com", phone="+56912345678", title=" Hola ")
    b = discovery_dedupe_key(source_id="x", link="https://a.com", email="A@B.COM", phone="+56912345678", title="Hola")
    assert a == b

