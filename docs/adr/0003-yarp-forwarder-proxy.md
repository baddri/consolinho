# 0003 — YARP IHttpForwarder for the Kubernetes proxy
**Status:** Accepted (2026-11-18)

## Context
The proxy must stream watches and logs, upgrade WebSockets for exec, and route to ~40 destinations chosen per request from the database.

## Decision
Use YARP's `IHttpForwarder` (direct forwarding) from a minimal API endpoint, not YARP's config-based routing. Destination, transforms and the `HttpMessageInvoker` are chosen per request after our policy chain approves it. Per-cluster invokers are pooled in `ClusterHttpClientPool`.

## Consequences
Full control over auth/policies in our code; YARP handles the hard HTTP parts (streaming, upgrades, hop-by-hop headers, errors).
