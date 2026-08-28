"""
Embedding-based course recommender using sentence-transformers.

Uses all-MiniLM-L6-v2 (384-dim) to encode learner goals and compute
cosine similarity against pre-computed course description embeddings.

No training required — leverages a pretrained model fine-tuned on
billions of sentence pairs. Fast, explainable, zero GPU cost.

Artifacts expected in backend/data/ml/:
  - course_embeddings.npy        (shape: [N, 384], float32 array)
  - courses_with_text_profile.csv (N courses with metadata)
"""
import os
import logging

import numpy as np
import pandas as pd

logger = logging.getLogger("pathfinder.ml.course_embeddings")

_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "ml")

_embedder = None
_embeddings = None
_courses_df = None


def _load():
    """Lazy-load sentence-transformer model + pre-computed embeddings."""
    global _embedder, _embeddings, _courses_df
    if _embedder is not None:
        return

    try:
        from sentence_transformers import SentenceTransformer
    except ImportError:
        raise RuntimeError(
            "sentence-transformers is not installed. Add it to requirements.txt and run: "
            "pip install sentence-transformers"
        )

    embeddings_path = os.path.join(_DATA_DIR, "course_embeddings.npy")
    courses_path = os.path.join(_DATA_DIR, "courses_with_text_profile.csv")

    for path in [embeddings_path, courses_path]:
        if not os.path.exists(path):
            raise RuntimeError(
                f"ML embedding artifact not found: {path}\n"
                "Download the trained embedding files to backend/data/ml/:\n"
                "  - course_embeddings.npy\n"
                "  - courses_with_text_profile.csv"
            )

    logger.info("Loading sentence-transformer model (all-MiniLM-L6-v2)...")
    _embedder = SentenceTransformer("all-MiniLM-L6-v2")

    _embeddings = np.load(embeddings_path)
    _courses_df = pd.read_csv(courses_path)

    # Ensure consistent row count
    assert len(_embeddings) == len(_courses_df), (
        f"Embedding count ({len(_embeddings)}) doesn't match "
        f"course count ({len(_courses_df)})"
    )

    # Pre-normalize course embeddings to unit L2 norm for correct cosine similarity.
    # MiniLM vectors aren't guaranteed to be pre-normalized.
    norms = np.linalg.norm(_embeddings, axis=1, keepdims=True)
    norms = np.where(norms == 0, 1, norms)  # avoid division by zero
    _embeddings_normalized = _embeddings / norms

    logger.info(
        "Course embeddings loaded: %d courses, %d dims (L2-normalized)",
        len(_courses_df), _embeddings.shape[1]
    )


def recommend(goal_text: str, top_k: int = 5) -> list:
    """
    Recommend courses based on true cosine similarity between learner goal
    and pre-computed course description embeddings.

    Both embeddings are L2-normalized before dot product, giving exact
    cosine similarity in [-1, 1] range.

    Args:
        goal_text: Natural language goal description from the learner
        top_k: Number of courses to return (clamped to 1-20)

    Returns:
        List of course dicts with similarity scores, sorted descending.
    """
    _load()

    top_k = max(1, min(top_k, 20))

    # Encode the learner's goal text
    goal_embedding = _embedder.encode([goal_text], show_progress_bar=False)

    # L2-normalize the goal embedding for true cosine similarity
    goal_norm = np.linalg.norm(goal_embedding)
    if goal_norm > 0:
        goal_embedding = goal_embedding / goal_norm

    # True cosine similarity: dot product of L2-normalized vectors
    similarities = np.dot(_embeddings_normalized, goal_embedding.T).squeeze()

    # Get top-k indices
    top_indices = np.argsort(similarities)[::-1][:top_k]

    results = []
    for idx in top_indices:
        course = _courses_df.iloc[idx]
        results.append({
            "course_title": str(course.get("course_title", "")),
            "course_organization": str(course.get("course_organization", "")),
            "course_difficulty": str(course.get("course_difficulty", "")),
            "similarity_score": round(float(similarities[idx]), 4),
            "text_profile": str(course.get("text_profile", ""))[:300],  # truncate for response size
        })

    return results


def get_model_stats() -> dict:
    """Return embedding model metadata for the stats panel."""
    _load()
    return {
        "embedding_model": {
            "type": "Sentence-Transformer (Bi-Encoder)",
            "model_name": "all-MiniLM-L6-v2",
            "dimensions": int(_embeddings.shape[1]),
            "num_courses": len(_courses_df),
            "similarity_method": "Cosine similarity (dot product on L2-normalized vectors)",
            "training_data": "Trained on 1B+ sentence pairs (paraphrase, NLI, STS benchmarks)",
            "inference_cost": "Zero — pretrained model, no fine-tuning required",
        },
    }


def is_loaded() -> bool:
    """Check if the embedding model has been loaded."""
    return _embedder is not None


def check_artifacts() -> dict:
    """Check if all required embedding artifacts exist. Returns status dict."""
    files = {
        "course_embeddings.npy": os.path.exists(os.path.join(_DATA_DIR, "course_embeddings.npy")),
        "courses_with_text_profile.csv": os.path.exists(os.path.join(_DATA_DIR, "courses_with_text_profile.csv")),
    }
    return {"all_present": all(files.values()), "files": files}
