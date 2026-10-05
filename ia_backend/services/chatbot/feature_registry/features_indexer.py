import json
import logging
from pathlib import Path
from unittest import result
from langchain_ollama import OllamaEmbeddings
from langchain_postgres import PGVector
from langchain_core.documents import Document

import os
from dotenv import load_dotenv, find_dotenv

ENV_PATH = Path(__file__).resolve().parents[3] / ".env"
load_dotenv(dotenv_path=ENV_PATH, override=True)

CONNECTION_STRING = os.getenv("CONNECTION")
if not CONNECTION_STRING:
    raise ValueError(
        f"[FeaturesIndexer] CONNECTION_STRING introuvable. "
        f"Chemin .env attendu : {ENV_PATH} (existe: {ENV_PATH.exists()})"
    )

COLLECTION_NAME   = "features_collection"
EMBEDDING_MODEL   = "nomic-embed-text-v2-moe"

FEATURES_DIR = Path(__file__).parent / "features"


def _load_features() -> list[dict]:
    features = []
    for f in sorted(FEATURES_DIR.glob("*.json")):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            keywords_text = ", ".join(data.get("keywords", []))
            actions_text  = " | ".join(
                f"{a['label']}: {a['description']}"
                for a in data.get("actions", [])
            )
            text_to_embed = (
                f"Feature: {data['label']}\n"
                f"Description: {data['description']}\n"
                f"Keywords: {keywords_text}\n"
                f"Actions: {actions_text}"
            )
            features.append({
                "id":            data["id"],
                "route":         data["route"],
                "label":         data["label"],
                "roles":         data.get("roles", ["*"]), 
                "text_to_embed": text_to_embed,
                "actions":       data.get("actions", []),
            })
        except Exception as e:
            logging.warning(f"[FeaturesIndexer] Erreur lecture {f.name}: {e}")
    return features


def run_indexing():

    embedding_model = OllamaEmbeddings(model=EMBEDDING_MODEL)
    features        = _load_features()

    if not features:
        raise ValueError("[FeaturesIndexer] Aucune feature trouvée dans features/")

    documents = [
        Document(
            page_content=f["text_to_embed"],
            metadata={
                "feature_id": f["id"],
                "route":      f["route"],
                "label":      f["label"],
                "roles":      json.dumps(f["roles"], ensure_ascii=False), 
                "actions":    json.dumps(f["actions"], ensure_ascii=False),
            }
        )
        for f in features
    ]

    PGVector.from_documents(
        documents=documents,
        embedding=embedding_model,
        collection_name=COLLECTION_NAME,
        connection=CONNECTION_STRING,
        pre_delete_collection=True,
    )

    logging.info(f"[FeaturesIndexer] {len(features)} features indexées.")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run_indexing()