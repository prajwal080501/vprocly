import io

from fastapi.testclient import TestClient
from openpyxl import Workbook

from app.inspect_workbook import find_header_row, inspect_rows
from app.main import app

client = TestClient(app)


def _xlsx(rows: list[list]) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Indent"
    for r in rows:
        ws.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


MESSY_INDENT = [
    ["Acme Manufacturing Pvt Ltd - Plant 2"],
    ["Material Indent - September 2026", None, None, "Prepared by: Stores"],
    [],
    ["Sr No", "Material Description", "Required Qty", "UOM", "Need By", "Cost Centre"],
    [1, "MS Plate 10mm", 25, "NOS", "2026-10-05", "CC-200"],
    [2, "Hex Bolt M12 x 50", 400, "NOS", "2026-10-01", "CC-200"],
    [None, None, None, None, None, None],
    [3, "Welding Rod E6013 3.15mm", 20, "KG", "2026-10-10", "CC-210"],
]


def test_finds_header_below_title_rows():
    assert find_header_row(MESSY_INDENT) == 3


def test_inspection_reports_headers_extent_and_sample():
    s = inspect_rows("Indent", MESSY_INDENT)
    assert s.header_row == 4
    assert s.headers == ["Sr No", "Material Description", "Required Qty", "UOM", "Need By", "Cost Centre"]
    assert s.data_rows == 3
    assert s.sample[0][1] == "MS Plate 10mm"


def test_duplicate_and_blank_headers_are_made_unique():
    s = inspect_rows("S", [["Qty", "Qty", None, "Rate"], [1, 2, 3, 4], [5, 6, 7, 8]])
    assert s.headers == ["Qty", "Qty (2)", "Column 3", "Rate"]


def test_inspect_endpoint_reads_xlsx():
    res = client.post("/inspect", files={"file": ("indent.xlsx", _xlsx(MESSY_INDENT))})
    assert res.status_code == 200
    sheet = res.json()["sheets"][0]
    assert sheet["name"] == "Indent"
    assert sheet["header_row"] == 4
    assert sheet["data_rows"] == 3


def test_inspect_endpoint_reads_csv_with_bom():
    data = "﻿Item,Qty,UOM\nBolt,10,NOS\n".encode()
    res = client.post("/inspect", files={"file": ("items.csv", data)})
    assert res.status_code == 200
    assert res.json()["sheets"][0]["headers"] == ["Item", "Qty", "UOM"]


def test_rejects_macro_enabled_and_corrupt_files():
    assert client.post("/inspect", files={"file": ("m.xlsm", b"x")}).status_code == 415
    assert client.post("/inspect", files={"file": ("bad.xlsx", b"not a zip")}).status_code == 422
