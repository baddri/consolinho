---
id: T-0109
title: Proxy forwards the browser's Host header → wrong SNI, TLS name mismatch on every real cluster
status: done
owner: backend-engineer
checkpoint: 3
depends_on: []
paths: [src/FleetConsole.Api/Proxy, tests/FleetConsole.Api.Tests]
review_rounds: 0
labels: [bug]
---

## Goal
Found by the human on the live CP3 deploy (2026-11-21): browsing a registered cluster fails with "The TLS certificate of
<cluster> could not be verified" (`Proxy.UpstreamTls`), although the CA bundle is correct.

Root cause (reproduced by the orchestrator inside the pod): `KubernetesRequestTransformer.TransformRequestAsync` calls
`HttpTransformer.Default`'s `TransformRequestAsync`, which copies the incoming `Host` header
(`consolinho.apps.<domain>`). SocketsHttpHandler then uses that Host for TLS SNI **and** certificate name validation.
kube-apiserver, seeing an unknown SNI, serves its default cert (`CN=172.30.0.1`, service-network signer) →
`RemoteCertificateNameMismatch` → our callback rejects. Without the Host header the same request validates
(lb-signer chain, HTTP 200). YARP's direct-forwarding sample clears it: `proxyRequest.Headers.Host = null;`.
CP2 tests missed it because the fake apiserver's cert/SNI handling doesn't depend on Host.

## Context pack
- `src/FleetConsole.Api/Proxy/KubernetesRequestTransformer.cs:65-75` (`TransformRequestAsync`, after `base.` call).
- Existing upstream-header tests: `tests/FleetConsole.Api.Tests/**` (grep `Connection` nominated-header test from T-0093)
  — add the assertion next to them.

## Acceptance criteria
- [x] Upstream request carries no client-supplied Host: the upstream sees `Host` = API URL authority (assert in a
      fake-apiserver test, with the incoming request using a different Host).
- [x] Ideally a TLS test where the fake apiserver selects its cert by SNI (or asserts SNI == API host) so a regression
      fails; if too costly, note why in the Work log.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-21 backend-engineer: in_progress. New test (browser Host `console.apps.example.test`) reproduced it: 502 UpstreamTls.
  Fix: `proxyRequest.Headers.Host = null` after the base transform + comment and class remarks corrected (they claimed
  YARP drops Host). Fake apiserver now records each handshake's SNI (`ServerNames`, cert selector). check-be green. in_review.

## Review
- 2026-11-21 orchestrator: APPROVE — one-line fix at the right place, regression test fails without it (502 UpstreamTls). Root cause reproduced in-pod before the fix.

## Handover notes
- Fix: `src/FleetConsole.Api/Proxy/KubernetesRequestTransformer.cs` `TransformRequestAsync` clears `Headers.Host`.
- Regression: `KubernetesProxyForwardingTests.Browser_Host_Is_Not_Forwarded_Tls_Name_And_Host_Come_From_The_Api_Url`
  asserts 200, upstream `Host` == API URL authority, SNI never the browser host; fails as 502 UpstreamTls without the fix
  (fake cert covers only localhost/127.0.0.1, so the name check catches it).
- `FakeKubeApiServer.ServerNames`: SNI per handshake ("" when none; the fake's URL is an IP literal, so SNI is empty).
  A test with a DNS-named API URL asserting SNI == host was not added (fake binds 127.0.0.1; would need a resolver hook).
- Not verified on a live cluster (no cluster access); human re-test on the CP3 deploy recommended.
