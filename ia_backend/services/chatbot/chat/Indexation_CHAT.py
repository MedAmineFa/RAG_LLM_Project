import logging
import re
from pathlib import Path
from langchain_ollama import OllamaEmbeddings
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_postgres import PGVector

import os
from dotenv import load_dotenv

# Config
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

ENV_PATH = Path(__file__).resolve().parents[3] / ".env"
load_dotenv(dotenv_path=ENV_PATH, override=True)

CONNECTION_STRING = os.getenv("CONNECTION")
if not CONNECTION_STRING:
    raise ValueError(
        f"[FeaturesIndexer] CONNECTION_STRING introuvable. "
        f"Chemin .env attendu : {ENV_PATH} (existe: {ENV_PATH.exists()})"
    )

COLLECTION_NAME = "documents_collection"
EMBEDDING_MODEL = "nomic-embed-text-v2-moe"

def load_documents(pdf_path: str):
    try:
        loader = PyPDFLoader(pdf_path)
        documents = loader.load()
        logger.info(f"{len(documents)} pages loaded from '{pdf_path}'.")
        return documents
    except Exception as e:
        logger.error(f"Load error: {e}")
        raise


def split_documents(documents, chunk_size: int = 800, chunk_overlap: int = 150):
    try:
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            separators=["\n\n", "\n", ".", " ", ""]
        )
        chunks = splitter.split_documents(documents)
        logger.info(f"{len(chunks)} chunks created.")
        return chunks
    except Exception as e:
        logger.error(f"Split error: {e}")
        raise


def clean_text(text: str) -> str:
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def create_embedding_model():
    try:
        model = OllamaEmbeddings(model=EMBEDDING_MODEL)
        return model
    except Exception as e:
        logger.error(f"Embedding model error: {e}")
        raise


def index_documents(chunks, embedding_model, force_reindex: bool = False):
    try:
        # Add Nomic mandatory prefix to each chunk
        for chunk in chunks:
            cleaned = clean_text(chunk.page_content)
            chunk.page_content = f"search_document: {cleaned}"

        logger.info(f"Indexing {len(chunks)} chunks into '{COLLECTION_NAME}'...")

        db = PGVector.from_documents(
            documents=chunks,
            embedding=embedding_model,
            collection_name=COLLECTION_NAME,
            connection=CONNECTION_STRING,
            pre_delete_collection=force_reindex, 
            distance_strategy="cosine"          
        )

        logger.info("Indexing complete.")
        return db
    except Exception as e:
        logger.error(f"Indexing error: {e}")
        raise


if __name__ == "__main__":
    pdf_path = "ia_backend\\finance.pdf"
    try:
        documents = load_documents(pdf_path)
        chunks = split_documents(documents)
        embedding_model = create_embedding_model()

        # force_reindex=True wipes the old collection before re-inserting
        index_documents(chunks, embedding_model, force_reindex=True)

        logger.info("Done! Use 'search_query: ' prefix when querying.")
    except Exception as e:
        logger.critical(f"Failed: {e}")