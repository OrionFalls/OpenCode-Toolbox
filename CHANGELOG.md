# Changelog

## 0.2.6 — Bulk model toggle syntax correction

- Remove an invalid placeholder statement from the bulk model transform.
- Synchronize GUI version metadata.
- Keep README and package metadata aligned.

## 0.2.5 — Persistent bulk model registration

- Register Bulk Model Toggle as a long-lived model transform when enabled.
- Persist per-provider/per-model enabled overrides in plugin storage.
- Apply saved overrides after model catalog rebuilds.
- Correct the model inventory call to use ctx.model.list() and filter by provider ID.
- Update README and package/server version metadata.
