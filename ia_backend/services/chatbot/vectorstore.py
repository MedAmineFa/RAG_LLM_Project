
from __future__ import annotations

import logging
import os
from typing import Optional

from dotenv import load_dotenv
from langchain_ollama import OllamaEmbeddings
from langchain_postgres import PGVector

load_dotenv()

logger = logging.getLogger(__name__)

CONNECTION_STRING: str = os.getenv(
    "PGVECTOR_CONNECTION_STRING",
    "postgresql+psycopg2://postgres:admin@localhost:5432/DOCUMENT",
)
EMBEDDING_MODEL: str = os.getenv("EMBEDDING_MODEL", "nomic-embed-text-v2-moe")


class _VectorStoreRegistry:

    def __init__(self) -> None:
        self._stores: dict[str, PGVector] = {}
        self._embeddings: Optional[OllamaEmbeddings] = None

    def _get_embeddings(self) -> OllamaEmbeddings:
        if self._embeddings is None:
            self._embeddings = OllamaEmbeddings(model=EMBEDDING_MODEL)
        return self._embeddings

    def get(self, collection_name: str) -> PGVector:
        if collection_name not in self._stores:
            self._stores[collection_name] = PGVector(
                embeddings=self._get_embeddings(),
                collection_name=collection_name,
                connection=CONNECTION_STRING,
            )
            logger.info("[VectorStore] Connected to collection '%s'.", collection_name)
        return self._stores[collection_name]


_registry = _VectorStoreRegistry()


def get_vectorstore(collection_name: str) -> PGVector:
    """Return (or lazily create) the PGVector instance for *collection_name*."""
    return _registry.get(collection_name)
