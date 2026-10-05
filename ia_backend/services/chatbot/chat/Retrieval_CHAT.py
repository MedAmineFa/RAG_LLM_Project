
import logging
import os

from dotenv import load_dotenv
from services.chatbot.vectorstore import get_vectorstore

load_dotenv()

COLLECTION_NAME: str = os.getenv("DOCUMENTS_COLLECTION_NAME", "documents_collection")

logger = logging.getLogger(__name__)


def retrieve_documents(query: str, top_k: int = 6) -> list[dict]:
    try:
        db = get_vectorstore(COLLECTION_NAME)
        results = db.similarity_search(f"search_query: {query}", k=top_k)
        return [
            {"content": doc.page_content.replace("search_document: ", "").strip()}
            for doc in results
        ]
    except Exception as e:
        logger.error("Error retrieving documents for query '%s': %s", query, e)
        return []
