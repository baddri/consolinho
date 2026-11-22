# 0034 — Group grants and grant precedence
**Status:** Accepted (2026-11-23, decided by the human; ROADMAP §CP4.5) · decision only, implemented in CP4.5 ·
builds on ADR-0009 (session revalidation), the grant model of CP2

## Context
Granting ~40 clusters to each user one by one does not scale. The host OpenShift already organises people in groups,
and FleetConsole records a user's groups at login (`User.Groups`, `src/FleetConsole.Domain/Users/User.cs:80`). We need
group grants and a deterministic rule for which grant applies when several match.

## Decision
1. **Subject.** A grant's subject is a **user** or a **group name** (string, the host OpenShift `Group` name). No foreign
   key to a group table: groups live on the host cluster. FleetConsole-local groups may come later as another subject kind.
2. **Membership** = `User.Groups` as recorded at login, refreshed with session revalidation (ADR-0009): CP4.5 makes the
   revalidation pass re-read the user's groups so a removal takes effect within `Auth:RevalidationInterval` rather than
   at the next login. Access decisions never call the host per request.
3. **`system:*` groups are refused** as grant subjects (validator field error) and ignored in membership
   (`system:authenticated` etc. would grant everyone).
4. **Precedence** for (user, cluster):
   - a **direct user grant beats** any group grant;
   - among group grants the **highest admin-set priority** wins; two group grants on the same cluster with the same
     priority are **refused at save** (409/field error); if a tie slips through (concurrent saves, renamed groups), the
     **read-only** one wins;
   - the user's **read-only flag always applies** on top (it can only narrow, never widen).
5. **Group picker**: the admin UI lists host `Group` objects through FleetConsole's own ServiceAccount on the host
   cluster (read-only role: `get/list groups.user.openshift.io`). Free-text entry stays possible (groups that don't
   exist yet).
6. **"Effective access" view**: an admin query (user × cluster) that returns the winning grant and why (direct / group
   X priority N / read-only flag), using the same resolver as authorization — one implementation, no second copy.

## Consequences
- The grant resolver becomes a pure domain service (inputs: user, groups, candidate grants) shared by the proxy
  authorization query, the accessible-clusters query and the effective-access view; unit-tested exhaustively.
- Every grant/group change must invalidate cached access (ADR-0035 tags per group).
- Audit entries name the group and priority of a group grant.

## Alternatives rejected
- **Most-permissive wins** (Kubernetes RBAC style): surprising for an admin who added a read-only group on purpose.
- **Syncing groups into a local table**: duplicates the host's source of truth and needs its own sync job.
