"""EVolve AI machine learning.

Targets three questions that matter for waste management:
  1. State of Health        -> how much usable capacity is left
  2. EOL horizon (months)   -> when does it cross the intervention threshold
  3. Anomaly score          -> is anything physically unusual

All metrics are COMPUTED by cross-validation at train time and always ship with
a naive baseline. No metric is a literal in this package.
"""

from .trainer import (  # noqa: F401
    ModelBundle,
    load_metrics,
    robustness_ablation,
    train_all,
    verify_not_hardcoded,
)