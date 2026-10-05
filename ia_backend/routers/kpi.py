from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional

from services.kpis.Generation_KPIs import generate_kpi_analysis_stream
from services.kpis.chiffrement import tokenize_payload
from services.kpis.dechiffrement import decrypt_sse_stream

router = APIRouter()


# ── Modèles Pydantic ──────────────────────────────────────────────────────

class KpiItem(BaseModel):
    name: str
    unit: str
    currentAmount: float
    previousAmount: float
    variation: float = 0.0


class KpiDetailItem(BaseModel):
    codeANC: str
    codeIFRS: str
    description: str
    fluxN: float
    fluxNMinus1: float
    variation: float = 0.0
    unit: str


class KpiWithDetails(BaseModel):
    name: str
    unit: str
    currentAmount: float
    previousAmount: float
    variation: float = 0.0
    details: list[KpiDetailItem] = []


class AnalyzeKpisRequest(BaseModel):
    period: str
    perimetre: str

    selectedKpi: Optional[KpiWithDetails] = None

    kpis: list[KpiItem]

    mentionedKpisDetails: Optional[list[KpiWithDetails]] = None

    refinementPrompt: Optional[str] = None
    previousAnalysis: Optional[str] = None


# ── Route ─────────────────────────────────────────────────────────────────

@router.post("/api/analyze-kpis")
def analyze_kpis(request: AnalyzeKpisRequest):

    raw_payload = {
        "period":    request.period,
        "perimetre": request.perimetre,
        "kpis":      [k.dict() for k in request.kpis],
        "selectedKpi":           request.selectedKpi.dict() if request.selectedKpi else None,
        "mentionedKpisDetails":  [k.dict() for k in request.mentionedKpisDetails] if request.mentionedKpisDetails else None,
        "refinementPrompt":      request.refinementPrompt,
        "previousAnalysis":      request.previousAnalysis,
    }

    try:
        tokenized_payload, token_map = tokenize_payload(raw_payload)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur de tokenisation : {e}")

    def stream():
        raw_stream = generate_kpi_analysis_stream(
            period=tokenized_payload["period"],
            perimetre=tokenized_payload["perimetre"],
            kpis=tokenized_payload["kpis"],
            selected_kpi=tokenized_payload.get("selectedKpi"),
            refinement_prompt=raw_payload.get("refinementPrompt"),
            previous_analysis=tokenized_payload.get("previousAnalysis"),
            mentioned_kpis_details=tokenized_payload.get("mentionedKpisDetails"),
            financial_relations=tokenized_payload.get("financial_relations"),
        )
        yield from decrypt_sse_stream(raw_stream, token_map)

    return StreamingResponse(stream(), media_type="text/event-stream")