"""vProcly Excel service.

Sprint 0 exposes workbook inspection only. From Sprint 1 it writes normalized rows to the `staging` schema;
it never writes to live procurement tables (blueprint p.9) and never executes macros.
"""

import httpx
from fastapi import FastAPI, HTTPException, UploadFile
from pydantic import BaseModel

from app.inspect_workbook import inspect_workbook

MAX_BYTES = 50 * 1024 * 1024
ALLOWED_EXTENSIONS = (".xlsx", ".xls", ".csv")

app = FastAPI(title="vProcly Excel service", version="0.1.0")


@app.get("/health/live")
def live() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/inspect")
async def inspect(file: UploadFile) -> dict:
    name = file.filename or ""
    if not name.lower().endswith(ALLOWED_EXTENSIONS):
        raise HTTPException(415, f"Only {', '.join(ALLOWED_EXTENSIONS)} files are accepted (no macro-enabled files)")
    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "File too large")
    try:
        sheets = inspect_workbook(data, name)
    except Exception as exc:  # calamine raises assorted errors for corrupt files
        raise HTTPException(422, f"Could not read workbook: {exc}") from exc
    return {"fileName": name, "sheets": [s.to_dict() for s in sheets]}


class ParseRequest(BaseModel):
    url: str  # presigned GET URL; this service never has direct S3 credentials
    file_name: str
    sheet_index: int = 0


@app.post("/parse")
async def parse(req: ParseRequest) -> dict:
    """Fetches the file by URL and returns every row of one sheet (not just a preview sample), so the
    caller can commit a full import. Used for a fixed, known template -- see sourcing.service.ts."""
    if not req.file_name.lower().endswith(ALLOWED_EXTENSIONS):
        raise HTTPException(415, f"Only {', '.join(ALLOWED_EXTENSIONS)} files are accepted")
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            resp = await client.get(req.url)
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            raise HTTPException(502, f"Could not fetch the file: {exc}") from exc
    data = resp.content
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "File too large")
    try:
        sheets = inspect_workbook(data, req.file_name, include_rows=True)
    except Exception as exc:
        raise HTTPException(422, f"Could not read workbook: {exc}") from exc
    if req.sheet_index >= len(sheets):
        raise HTTPException(422, f"Sheet index {req.sheet_index} out of range ({len(sheets)} sheet(s))")
    return sheets[req.sheet_index].to_dict()
