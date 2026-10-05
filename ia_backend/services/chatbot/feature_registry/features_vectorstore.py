from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from typing import Optional

from dotenv import load_dotenv
from services.chatbot.vectorstore import get_vectorstore

load_dotenv()

COLLECTION_NAME: str = os.getenv("FEATURES_COLLECTION_NAME", "features_collection")
SIMILARITY_THRESHOLD: float = float(os.getenv("SIMILARITY_THRESHOLD", "0.55"))

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class FeatureMatch:
    feature_id: str
    route: str
    label: str
    similarity: float
    action_id: Optional[str] = None
    action_label: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "featureId":   self.feature_id,
            "route":       self.route,
            "label":       self.label,
            "actionId":    self.action_id,
            "actionLabel": self.action_label,
            "score":       self.similarity,
        }


def _cosine_distance_to_similarity(distance: float) -> float:
    return max(0.0, min(1.0, 1.0 - (distance / 2.0)))


def _find_matching_action(actions: list[dict], hint: str) -> Optional[dict]:
    hint_lower = hint.strip().lower()
    for action in actions:
        if hint_lower in action.get("label", "").lower() or \
           hint_lower in action.get("description", "").lower():
            return action
    return None


def _user_has_access(feature_roles: list[str], user_roles: list[str]) -> bool:
    if "*" in feature_roles:
        return True
    return bool(set(feature_roles) & set(user_roles))


def search_features(
    question: str,
    user_roles: Optional[list[str]] = None, 
    action_hint: Optional[str] = None,
) -> Optional[dict]:
    if not question or not question.strip():
        logger.warning("[FeaturesVectorstore] Empty question, search skipped.")
        return None

    user_roles = user_roles or []

    try:
        db = get_vectorstore(COLLECTION_NAME)
        results = db.similarity_search_with_score(
            f"search_query: {question.strip()}",
            k=5,
        )

        if not results:
            return None

        for doc, raw_distance in results:
            similarity = _cosine_distance_to_similarity(raw_distance)

            logger.debug(
                "[FeaturesVectorstore] distance=%.4f → similarity=%.4f", raw_distance, similarity
            )

            if similarity < SIMILARITY_THRESHOLD:
                logger.debug(
                    "[FeaturesVectorstore] Score %.3f below threshold %.3f, stopping.", similarity, SIMILARITY_THRESHOLD
                )
                break

            metadata = doc.metadata
            for field in ("feature_id", "route", "label"):
                if field not in metadata:
                    logger.error("[FeaturesVectorstore] Missing field '%s', skipping.", field)
                    break
            else:
                try:
                    feature_roles: list[str] = json.loads(metadata.get("roles", '["*"]'))
                except json.JSONDecodeError:
                    feature_roles = ["*"]

                if not _user_has_access(feature_roles, user_roles):
                    logger.info(
                        "[FeaturesVectorstore] Feature '%s' rejected — user roles %s not in %s.",
                        metadata["feature_id"], user_roles, feature_roles,
                    )
                    continue   

                try:
                    actions: list[dict] = json.loads(metadata.get("actions", "[]"))
                except json.JSONDecodeError as e:
                    logger.warning("[FeaturesVectorstore] Failed to parse actions: %s", e)
                    actions = []

                matched_action: Optional[dict] = None
                if action_hint and actions:
                    matched_action = _find_matching_action(actions, action_hint)

                match = FeatureMatch(
                    feature_id=metadata["feature_id"],
                    route=metadata["route"],
                    label=metadata["label"],
                    similarity=round(similarity, 3),
                    action_id=matched_action.get("id") if matched_action else None,
                    action_label=matched_action.get("label") if matched_action else None,
                )

                logger.info(
                    "[FeaturesVectorstore] Match: feature='%s' score=%.3f", match.feature_id, match.similarity
                )
                return match.to_dict()

        logger.info("[FeaturesVectorstore] No accessible feature found for question: '%s'", question)
        return None

    except Exception:
        logger.exception("[FeaturesVectorstore] Unexpected error.")
        return None