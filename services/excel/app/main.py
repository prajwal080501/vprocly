"""vProcly Excel service.

Sprint 0 exposes workbook inspection only. From Sprint 1 it writes normalized rows to the `staging` schema;
it never writes to live procurement tables (blueprint p.9) and never executes macros.
"""

from fastapi import FastAPI, HTTPException, UploadFile

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
