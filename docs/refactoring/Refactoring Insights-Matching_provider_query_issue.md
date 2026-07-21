# Provider matching performs N+1 availability checks

# 1. Problems

The provider-matching flow in `backend/services/matching_service.py` previously screened candidates with sequential MongoDB lookups. Because `start_matching` runs on request creation and on admin retry, this inefficiency sits on a business-critical path.

## 1.1. N+1 candidate screening

The original `get_available_providers(...)` flow fetched a batch of candidate providers and then checked “does this provider have an active service?” one-by-one. That makes one matching attempt cost roughly **1 + N** queries before scoring.

## 1.2. Wave validation repeats the busy-provider check

Rotation waves (wave 2/3) also need to re-check provider validity right before sending new offers. If this revalidation runs provider-by-provider, later waves pay another query per provider and duplicate availability logic.

# 2. Benefits

## 2.1. Lower matching latency

Batching the “busy provider” lookup reduces screening from **1 + N** queries to roughly **2** per pass: one provider fetch and one indexed lookup on `service_requests(providerId, status)`.

## 2.2. Lower database and payload cost

Using an explicit provider projection avoids loading full user documents when only scoring and response fields are needed.

## 2.3. Safer future changes

Centralizing “busy provider” detection reduces drift between the initial matching pass and wave revalidation.

# 3. Solution implemented

The refactor introduces a single batched lookup for busy providers and reuses it across both initial matching and wave validation.

- `PROVIDER_MATCH_PROJECTION` limits fetched provider fields.
- `_busy_provider_ids(...)` queries busy providers in one call using `distinct('providerId', ...)` over `ACTIVE_SERVICE_STATES`.
- `get_available_providers(...)` excludes busy providers by set membership.
- `filter_valid_providers_for_wave(...)` validates provider ids in batch (one `find` + one `distinct`).

# 4. Regression testing scope

## 4.1. Main scenarios

- Client creates a request with several eligible providers: matching still selects the same best-ranked available provider.
- Client creates a request that needs radius expansion: expanded search still finds additional providers, but busy providers remain excluded.
- Admin retries matching for an unresolved request: retry still respects prior attempt exclusions and doesn’t offer busy providers.

## 4.2. Edge cases

- All candidate providers already have active services: matching ends in `no_providers_available` without offering a busy provider.
- A provider becomes busy between wave 1 and wave 2: revalidation filters that provider out before the later offer is sent.
- A request has selected providers mixed with unavailable providers: the selected-provider path keeps valid providers and falls back cleanly when none remain matchable.
