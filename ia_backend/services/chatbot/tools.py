import logging
from typing import Optional

from langchain_core.tools import tool

from services.chatbot.feature_registry.features_vectorstore import search_features
from services.chatbot.chat.Retrieval_CHAT import retrieve_documents
from services.chatbot.chat.Generation_CHAT import generate_answer

logger = logging.getLogger(__name__)

_ERROR_RESPONSE = {"answer": "An error occurred, please try again.", "model_used": None}


def make_navigate_tool(user_roles: Optional[list[str]] = None):
    roles = user_roles or []

    @tool
    def navigate_tool(question: str) -> dict | None:
        """
        Use this tool when the user wants to NAVIGATE to a feature or page.
        Examples: 'go to KPIs', 'open the dashboard', 'show me the consolidation',
        'lance l analyse', 'emmène moi vers...', 'ouvre les indicateurs'.
        Returns a route and label if a match is found, None otherwise.
        Do NOT use for informational questions or definitions.
        """
        try:
            result = search_features(question, user_roles=roles)
            if result:
                logger.info(
                    "[navigate_tool] Feature found: %s (score=%s)", result["featureId"], result["score"]
                )
            else:
                logger.info("[navigate_tool] No feature found for: '%s'", question)
            return result
        except Exception as e:
            logger.error("[navigate_tool] Error: %s", e)
            return None

    return navigate_tool


@tool
def rag_tool(question: str) -> dict:
    """
    Use this tool when the user asks for INFORMATION, an EXPLANATION, a DEFINITION,
    or any factual question — including greetings and thanks.
    Examples: 'what is EBITDA?', 'explain KPIs', 'comment fonctionne la consolidation?',
    'cest quoi la trésorerie?', 'hello', 'thanks'.
    Always use this tool if navigate_tool returned None or is not appropriate.

    Chat history is NOT a parameter here — it lives in the agent message thread
    and is automatically included by LangGraph in every model call.
    """
    try:
        docs = retrieve_documents(question, top_k=6)
        answer, model_used = generate_answer(
            question=question,
            retrieved_docs=docs,
        )
        return {"answer": answer, "model_used": model_used}
    except Exception as e:
        logger.error("[rag_tool] Error: %s", e)
        return _ERROR_RESPONSE