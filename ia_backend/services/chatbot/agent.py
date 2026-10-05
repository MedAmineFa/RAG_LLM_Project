import json
import logging
import os
from functools import lru_cache
from typing import Optional

from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage, AIMessage
from langgraph.prebuilt import create_react_agent

from services.chatbot.tools import make_navigate_tool, rag_tool

load_dotenv()
logger = logging.getLogger(__name__)

# ── Language detection ─────────────────────────────────────────────────────────

_NAV_MESSAGES = {
    "fr": "Voici la fonctionnalité demandée :",
    "en": "Here's the feature you requested:",
    "ar": "إليك الميزة المطلوبة:",
    "es": "Aquí está la función solicitada:",
    "de": "Hier ist die gewünschte Funktion:",
    "it": "Ecco la funzionalità richiesta:",
}

_SUPPORTED_LANGS = set(_NAV_MESSAGES.keys())

_FALLBACK_ANSWER = {
    "answer": "An error occurred, please try again.",
    "model_used": None,
    "navigation": None,
}

_lang_llm = ChatGroq(
    model="meta-llama/llama-4-scout-17b-16e-instruct",
    api_key=os.getenv("API_KEY"),
    temperature=0,
    max_tokens=5,
)

_LANG_DETECTION_PROMPT = (
    "Detect the language of the following text and reply with ONLY the ISO 639-1 "
    "two-letter code (e.g. en, fr, ar, es, de, it). No explanation, no punctuation.\n\n"
    "Text: {text}"
)


@lru_cache(maxsize=256)
def _detect_language(text: str) -> str:
    try:
        response = _lang_llm.invoke(_LANG_DETECTION_PROMPT.format(text=text[:200]))
        code = response.content.strip().lower()[:2]
        return code if code in _SUPPORTED_LANGS else "en"
    except Exception:
        logger.warning("[Agent] Language detection failed, defaulting to 'en'.")
        return "en"


def _nav_message(question: str) -> str:
    return _NAV_MESSAGES.get(_detect_language(question), _NAV_MESSAGES["en"])


# ── LLM (shared, stateless) ────────────────────────────────────────────────────

_llm = ChatGroq(
    model="meta-llama/llama-4-scout-17b-16e-instruct",
    api_key=os.getenv("API_KEY"),
    temperature=0,
)

_SYSTEM_PROMPT = """You are a helpful assistant for a financial web application.

You have access to two tools:
- navigate_tool: use it when the user wants to GO TO or OPEN a feature/page.
- rag_tool: use it when the user asks for information, explanation, or definition.

RULES:
1. Always call navigate_tool FIRST if there is any navigation intent.
2. If navigate_tool returns null or None, call rag_tool instead.
3. For pure informational questions (definitions, explanations), call rag_tool directly.
4. Never answer from your own knowledge — always use a tool.
5. Always respond in the same language as the user's question.
"""


# ── Agent factory (one per request, roles are baked in) ───────────────────────

def _build_agent(user_roles: list[str]):
    navigate_tool = make_navigate_tool(user_roles)
    return create_react_agent(
        model=_llm,
        tools=[navigate_tool, rag_tool],
        prompt=_SYSTEM_PROMPT,  
    )


# ── Message formatting ─────────────────────────────────────────────────────────

def _format_history(history: list) -> list:
    messages = []
    for turn in history[-5:]:
        messages.append(HumanMessage(content=turn["user"]))
        messages.append(AIMessage(content=turn["bot"]))
    return messages


# ── Output parsing ─────────────────────────────────────────────────────────────

def _parse_tool_messages(messages: list) -> tuple[Optional[dict], Optional[dict]]:
    navigate_result = None
    rag_result = None
    for msg in messages:
        if not (hasattr(msg, "name") and hasattr(msg, "content")):
            continue
        try:
            content = json.loads(msg.content) if isinstance(msg.content, str) else msg.content
        except (json.JSONDecodeError, TypeError):
            content = msg.content
        if msg.name == "navigate_tool" and content:
            navigate_result = content
        elif msg.name == "rag_tool" and content:
            rag_result = content
    return navigate_result, rag_result


def _parse_agent_output(output: dict, question: str) -> dict:
    messages = output.get("messages", [])
    navigate_result, rag_result = _parse_tool_messages(messages)

    if navigate_result and navigate_result.get("featureId"):
        return {
            "answer": _nav_message(question),
            "model_used": None,
            "navigation": navigate_result,
        }

    if rag_result:
        return {
            "answer": rag_result.get("answer", ""),
            "model_used": rag_result.get("model_used"),
            "navigation": None,
        }

    # Fallback: last non-empty AI message (agent responded without tool use)
    for msg in reversed(messages):
        if (
            hasattr(msg, "content")
            and isinstance(msg.content, str)
            and msg.content.strip()
            and not getattr(msg, "tool_calls", None)
        ):
            return {"answer": msg.content, "model_used": None, "navigation": None}

    lang = _detect_language(question)
    _unable_msgs = {
        "fr": "Je n'ai pas pu traiter votre demande.",
        "en": "I was unable to process your request.",
        "ar": "لم أتمكن من معالجة طلبك.",
        "es": "No pude procesar tu solicitud.",
        "de": "Ich konnte Ihre Anfrage nicht bearbeiten.",
        "it": "Non sono riuscito a elaborare la tua richiesta.",
    }
    return {"answer": _unable_msgs.get(lang, _unable_msgs["en"]), "model_used": None, "navigation": None}


# ── Public entry point ─────────────────────────────────────────────────────────

def run_agent(question: str, history: list, user_roles: Optional[list[str]] = None) -> dict:
    try:
        agent = _build_agent(user_roles or [])
        input_messages = _format_history(history) + [HumanMessage(content=question)]
        output = agent.invoke({"messages": input_messages})
        result = _parse_agent_output(output, question)
        logger.info(
            "[Agent] question='%s' roles=%s navigation=%s",
            question[:60], user_roles, "yes" if result["navigation"] else "no",
        )
        return result
    except Exception as e:
        logger.error("[Agent] Error: %s", e)
        return _FALLBACK_ANSWER