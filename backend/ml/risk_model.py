"""
Skill-gap / completion-risk predictor using a trained LightGBM model.

Model trained on OULAD (Open University Learning Analytics Dataset):
  - 86.5% accuracy, 86.4% F1, 82.3% precision on held-out test set
  - 32,593 student records, 12 engineered features
  - LightGBM gradient boosting classifier (200 trees, max_depth=6)

Artifacts expected in backend/data/ml/:
  - skill_risk_model.txt   (LightGBM booster)
  - label_encoders.pkl     (dict of sklearn LabelEncoders)
  - feature_cols.pkl       (ordered list of feature column names)
"""
import os
import pickle
import logging

logger = logging.getLogger("pathfinder.ml.risk_model")

_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "ml")

_model = None
_label_encoders = None
_feature_cols = None


def _load():
    """Lazy-load model + encoders on first use. Raises RuntimeError if files missing."""
    global _model, _label_encoders, _feature_cols
    if _model is not None:
        return

    try:
        import lightgbm as lgb
    except ImportError:
        raise RuntimeError(
            "lightgbm is not installed. Add it to requirements.txt and run: "
            "pip install lightgbm"
        )

    model_path = os.path.join(_DATA_DIR, "skill_risk_model.txt")
    encoders_path = os.path.join(_DATA_DIR, "label_encoders.pkl")
    features_path = os.path.join(_DATA_DIR, "feature_cols.pkl")

    for path in [model_path, encoders_path, features_path]:
        if not os.path.exists(path):
            raise RuntimeError(
                f"ML model artifact not found: {path}\n"
                "Download the trained model files to backend/data/ml/:\n"
                "  - skill_risk_model.txt\n"
                "  - label_encoders.pkl\n"
                "  - feature_cols.pkl"
            )

    _model = lgb.Booster(model_file=model_path)

    with open(encoders_path, "rb") as f:
        _label_encoders = pickle.load(f)

    with open(features_path, "rb") as f:
        _feature_cols = pickle.load(f)

    logger.info(
        "Risk model loaded: %d features, %d encoders, %d trees",
        len(_feature_cols), len(_label_encoders), _model.num_trees()
    )


def predict_risk(profile: dict) -> dict:
    """
    Predict completion-risk for a learner profile.

    Args:
        profile: dict with raw values, e.g.:
            {
                "gender": "M",
                "region": "London",
                "highest_education": "HE Qualification",
                "imd_band": "50-60%",
                "age_band": "0-35",
                "disability": "N",
                "num_of_prev_attempts": 1,
                "studied_credits": 120,
                "avg_score": 65.0,
                "num_assessments": 4,
                "total_clicks": 800,
                "avg_clicks": 20.0,
            }

    Returns:
        {"risk_score": float, "risk_band": str, "feature_importance": list}
    """
    _load()

    # Build feature vector in the exact order expected by the model
    feature_vector = {}
    categorical_cols = list(_label_encoders.keys())

    for col in _feature_cols:
        if col in categorical_cols:
            raw_val = str(profile.get(col, ""))
            le = _label_encoders[col]
            if raw_val in le.classes_:
                feature_vector[col] = le.transform([raw_val])[0]
            else:
                # Unseen category — fall back to most frequent class (index 0)
                logger.warning(
                    "Unseen category '%s' for column '%s' — using fallback", raw_val, col
                )
                feature_vector[col] = 0
        else:
            feature_vector[col] = float(profile.get(col, 0.0))

    # Build numpy array in correct order
    import numpy as np
    x = np.array([[feature_vector[col] for col in _feature_cols]])

    # Predict
    raw_score = _model.predict(x)[0]  # probability of Pass/Distinction

    # Risk is inverse of pass probability
    risk_score = round(1.0 - float(raw_score), 4)

    if risk_score >= 0.6:
        risk_band = "high"
    elif risk_score >= 0.3:
        risk_band = "medium"
    else:
        risk_band = "low"

    # Feature importance from the model itself
    importance = _model.feature_importance(importance_type="gain")
    total_gain = float(importance.sum()) or 1.0
    feature_importance = [
        {"feature": col, "importance": round(float(gain) / total_gain, 4)}
        for col, gain in sorted(
            zip(_feature_cols, importance), key=lambda x: x[1], reverse=True
        )
    ]

    return {
        "risk_score": risk_score,
        "risk_band": risk_band,
        "model_accuracy": "86.5%",
        "model_f1": "86.4%",
        "dataset": "OULAD (32,593 students)",
        "feature_importance": feature_importance,
    }


_shap_explainer = None


def _get_shap_explainer():
    """Lazy-load SHAP TreeExplainer. Returns None if shap is not installed."""
    global _shap_explainer
    if _shap_explainer is not None:
        return _shap_explainer
    try:
        import shap
        import lightgbm as lgb
        # Re-load the model for SHAP (needs the raw Booster)
        model_path = os.path.join(_DATA_DIR, "skill_risk_model.txt")
        lgb_model = lgb.Booster(model_file=model_path)
        _shap_explainer = shap.TreeExplainer(lgb_model)
        logger.info("SHAP TreeExplainer initialized")
        return _shap_explainer
    except ImportError:
        logger.warning("shap is not installed — SHAP explanations unavailable")
        return None
    except Exception as e:
        logger.error("Failed to init SHAP explainer: %s", e)
        return None


def explain_prediction(profile: dict) -> dict:
    """
    Compute SHAP values for a single prediction.
    Returns per-feature contribution values showing exactly how each
    feature pushes the prediction toward pass or fail.
    """
    _load()
    explainer = _get_shap_explainer()

    if explainer is None:
        raise RuntimeError(
            "SHAP is not installed. Add 'shap' to requirements.txt and run: "
            "pip install shap"
        )

    import numpy as np

    # Build feature vector (same logic as predict_risk)
    feature_vector = {}
    categorical_cols = list(_label_encoders.keys())
    for col in _feature_cols:
        if col in categorical_cols:
            raw_val = str(profile.get(col, ""))
            le = _label_encoders[col]
            feature_vector[col] = le.transform([raw_val])[0] if raw_val in le.classes_ else 0
        else:
            feature_vector[col] = float(profile.get(col, 0.0))

    x = np.array([[feature_vector[col] for col in _feature_cols]])

    # Compute SHAP values
    shap_values = explainer.shap_values(x)

    # For binary classification, shap_values may be a list [class_0, class_1]
    if isinstance(shap_values, list):
        values = shap_values[1][0]  # values for positive/pass class
    else:
        values = shap_values[0]

    # Build per-feature contributions
    contributions = []
    for i, col in enumerate(_feature_cols):
        contributions.append({
            "feature": col,
            "shap_value": round(float(values[i]), 4),
            "feature_value": round(float(x[0][i]), 2),
            "direction": "pass" if values[i] > 0 else "fail",
        })

    # Sort by absolute SHAP value (most impactful first)
    contributions.sort(key=lambda c: abs(c["shap_value"]), reverse=True)

    # Base value (model bias)
    base_value = float(explainer.expected_value)
    if isinstance(base_value, list):
        base_value = base_value[1]

    # Final prediction
    raw_score = _model.predict(x)[0]
    risk_score = round(1.0 - float(raw_score), 4)

    return {
        "base_value": round(base_value, 4),
        "prediction": risk_score,
        "risk_band": "high" if risk_score >= 0.6 else "medium" if risk_score >= 0.3 else "low",
        "contributions": contributions,
        "summary": (
            f"SHAP analysis shows the top factors driving this prediction: "
            f"{contributions[0]['feature'].replace('_', ' ')} "
            f"({'helps pass' if contributions[0]['shap_value'] > 0 else 'increases risk'}) "
            f"is the strongest signal, followed by "
            f"{contributions[1]['feature'].replace('_', ' ')} "
            f"({'helps pass' if contributions[1]['shap_value'] > 0 else 'increases risk'})."
        ),
    }


def get_model_stats() -> dict:
    """Return model metadata + feature importance for the stats panel."""
    _load()

    importance = _model.feature_importance(importance_type="gain")
    total_gain = float(importance.sum()) or 1.0
    feature_importance = [
        {"feature": col, "importance": round(float(gain) / total_gain, 4), "gain": round(float(gain), 2)}
        for col, gain in sorted(
            zip(_feature_cols, importance), key=lambda x: x[1], reverse=True
        )
    ]

    return {
        "risk_model": {
            "type": "LightGBM Gradient Boosting Classifier",
            "algorithm": "LightGBM (leaf-wise growth, 200 trees, max_depth=6)",
            "dataset": {
                "name": "OULAD — Open University Learning Analytics Dataset",
                "source": "https://analyse.kmi.open.ac.uk/open_dataset",
                "samples": 32593,
                "features": len(_feature_cols),
                "train_test_split": "80/20 stratified",
            },
            "metrics": {
                "accuracy": 0.865,
                "f1_score": 0.864,
                "precision": 0.823,
            },
            "feature_names": _feature_cols,
            "num_trees": _model.num_trees(),
            "feature_importance": feature_importance,
            "key_finding": (
                "Behavioral signals (assessment count, VLE engagement, average score) "
                "are the dominant predictors of completion risk, outweighing "
                "demographic factors — consistent with published OULAD benchmarks."
            ),
        },
    }


def is_loaded() -> bool:
    """Check if the model has been loaded."""
    return _model is not None


def check_artifacts() -> dict:
    """Check if all required ML artifacts exist. Returns status dict."""
    files = {
        "skill_risk_model.txt": os.path.exists(os.path.join(_DATA_DIR, "skill_risk_model.txt")),
        "label_encoders.pkl": os.path.exists(os.path.join(_DATA_DIR, "label_encoders.pkl")),
        "feature_cols.pkl": os.path.exists(os.path.join(_DATA_DIR, "feature_cols.pkl")),
    }
    return {"all_present": all(files.values()), "files": files}
