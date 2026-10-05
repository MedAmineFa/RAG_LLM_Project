from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, validator
from services.chatbot.agent import run_agent
import traceback

router  = APIRouter()

MAX_QUESTION_LENGTH = 2000


class ChatRequest(BaseModel):
    question: str
    history:  list = []

    @validator("question")
    def question_must_not_be_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("La question ne peut pas être vide.")
        if len(v) > MAX_QUESTION_LENGTH:
            raise ValueError(
                f"La question dépasse la limite de {MAX_QUESTION_LENGTH} caractères."
            )
        return v

_NAV_BOT_ANSWERS = {
    "Voici la fonctionnalité demandée :",
    "Here's the feature you requested:",
    "إليك الميزة المطلوبة:",
    "Aquí está la función solicitada:",
    "Hier ist die gewünschte Funktion:",
    "Ecco la funzionalità richiesta:",
    "__navigation__",
}


def rebuild_history(raw: list) -> list:
    pairs        = []
    pending_user = None

    for item in raw:
        if not isinstance(item, dict):
            continue

        if "user" in item and "bot" in item:
            if item["user"] and item["bot"]:
                if item["bot"] not in _NAV_BOT_ANSWERS:
                    pairs.append({"user": item["user"], "bot": item["bot"]})
            continue

        if "user" in item and item["user"]:
            pending_user = item["user"]
        elif "bot" in item and item["bot"] and pending_user is not None:
            if item["bot"] not in _NAV_BOT_ANSWERS:
                pairs.append({"user": pending_user, "bot": item["bot"]})
            pending_user = None

    return pairs


@router.post("/api/ai-assistant")
def chat(request: Request, body: ChatRequest):
    try:
        history = rebuild_history(body.history)

        result = run_agent(question=body.question, history=history)

        return {
            "answer":     result["answer"],
            "model_used": result.get("model_used"),
            "navigation": result.get("navigation"),
            "success":    True,
        }

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))