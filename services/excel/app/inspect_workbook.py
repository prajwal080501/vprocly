"""Workbook inspection: sheets, true header row and data extent. Read-only; never evaluates formulas or macros."""

from __future__ import annotations

import csv
import io
from dataclasses import asdict, dataclass
from typing import Any

from python_calamine import CalamineWorkbook

HEADER_SCAN_ROWS = 30
SAMPLE_ROWS = 5


@dataclass
class SheetInspection:
    name: str
    header_row: int | None  # 1-based, as a user sees it in Excel
    headers: list[str]
    data_rows: int
    sample: list[list[Any]]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _is_blank(v: Any) -> bool:
    return v is None or (isinstance(v, str) and not v.strip())


def _header_score(row: list[Any], next_rows: list[list[Any]]) -> float:
    """Scores how header-like a row is: many distinct short text cells, followed by populated rows."""
    cells = [c for c in row if not _is_blank(c)]
    if len(cells) < 2:
        return 0.0
    texts = [c for c in cells if isinstance(c, str)]
    text_ratio = len(texts) / len(cells)
    distinct_ratio = len({t.strip().lower() for t in texts}) / max(len(texts), 1)
    short_ratio = sum(1 for t in texts if len(t) <= 40) / max(len(texts), 1)
    populated_below = sum(1 for r in next_rows if sum(1 for c in r if not _is_blank(c)) >= max(2, len(cells) // 2))
    return len(cells) * text_ratio * distinct_ratio * short_ratio * (1 + populated_below)


def find_header_row(rows: list[list[Any]]) -> int | None:
    """Returns the 0-based index of the most header-like row within the first HEADER_SCAN_ROWS rows.

    Handles title rows, notes and blank lines above the real header, which are common in customer files.
    """
    best, best_score = None, 0.0
    for i, row in enumerate(rows[:HEADER_SCAN_ROWS]):
        score = _header_score(row, rows[i + 1 : i + 4])
        if score > best_score:
            best, best_score = i, score
    return best


def _normalize_headers(row: list[Any]) -> list[str]:
    headers, seen = [], {}
    for idx, v in enumerate(row):
        name = " ".join(str(v).split()) if not _is_blank(v) else f"Column {idx + 1}"
        seen[name] = seen.get(name, 0) + 1
        headers.append(name if seen[name] == 1 else f"{name} ({seen[name]})")
    while headers and headers[-1].startswith("Column ") and _is_blank(row[len(headers) - 1]):
        headers.pop()
    return headers


def inspect_rows(name: str, rows: list[list[Any]]) -> SheetInspection:
    header_idx = find_header_row(rows)
    if header_idx is None:
        return SheetInspection(name, None, [], 0, [])
    headers = _normalize_headers(rows[header_idx])
    body = [r[: len(headers)] for r in rows[header_idx + 1 :] if any(not _is_blank(c) for c in r)]
    sample = [[_jsonable(c) for c in r] for r in body[:SAMPLE_ROWS]]
    return SheetInspection(name, header_idx + 1, headers, len(body), sample)


def _jsonable(v: Any) -> Any:
    if v is None or isinstance(v, (str, int, float, bool)):
        return v
    return str(v)


def inspect_workbook(data: bytes, filename: str) -> list[SheetInspection]:
    if filename.lower().endswith(".csv"):
        text = data.decode("utf-8-sig", errors="replace")
        rows = [list(r) for r in csv.reader(io.StringIO(text))]
        return [inspect_rows("CSV", rows)]
    wb = CalamineWorkbook.from_filelike(io.BytesIO(data))
    return [inspect_rows(name, wb.get_sheet_by_name(name).to_python(skip_empty_area=False)) for name in wb.sheet_names]
