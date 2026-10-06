# CORE_CLOSURE_04 Hash Contract Note

The canonical accounting payload hash is built from a normalized, JSON-safe payload.

Normalization rules:
- object keys are sorted recursively
- transient fields like timestamps and request metadata are removed
- numeric strings are converted only for monetary or amount-like fields
- ordered accounting arrays keep their original order
- semantically unordered arrays can be marked with `__unordered = true` before hashing

Validation script:
- `node scripts/dev/test-canonical-payload-hash.mjs`

The hash contract is intended for future idempotency and replay checks only. It does not change the live accounting modules.
