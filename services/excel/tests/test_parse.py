import io
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient
from openpyxl import Workbook

from app.main import app

client = TestClient(app)

# A tiny BOM-shaped sheet: a title row above the real header, then three data rows.
ROWS = [
    ["Acme Manufacturing Pvt Ltd - Plant 2"],
    ["Sr No", "Material Description", "Required Qty", "UOM"],
    [1, "MS Plate 10mm", 25, "NOS"],
    [2, "Hex Bolt M12 x 50", 400, "NOS"],
    [3, "Welding Rod E6013 3.15mm", 20, "KG"],
]


def _xlsx(rows: list[list]) -> bytes:
    wb = Workbook()
    ws = wb.active
    for r in rows:
        ws.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


class _FakeResponse:
    def __init__(self, content: bytes):
        self.content = content

    def raise_for_status(self):
        pass


def test_parse_returns_every_row_not_just_the_sample():
    body = _xlsx(ROWS)
    with patch("httpx.AsyncClient.get", new=AsyncMock(return_value=_FakeResponse(body))):
        res = client.post("/parse", json={"url": "http://example/whatever.xlsx", "file_name": "indent.xlsx"})
    assert res.status_code == 200
    sheet = res.json()
    assert sheet["data_rows"] == 3
    assert len(sheet["rows"]) == 3
    assert sheet["rows"][0][1] == "MS Plate 10mm"


def test_parse_rejects_bad_extension():
    res = client.post("/parse", json={"url": "http://example/x.pdf", "file_name": "x.pdf"})
    assert res.status_code == 415


def test_parse_surfaces_fetch_failure():
    import httpx

    with patch("httpx.AsyncClient.get", new=AsyncMock(side_effect=httpx.ConnectError("boom"))):
        res = client.post("/parse", json={"url": "http://example/x.xlsx", "file_name": "x.xlsx"})
    assert res.status_code == 502
