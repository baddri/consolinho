using FleetConsole.Application.Credentials.ConnectionTesting;
using FleetConsole.Domain.Credentials;

namespace FleetConsole.Application.Tests.Credentials.ConnectionTesting;

/// <summary>
/// <see cref="CapabilityCheckSet.ApplicableTo"/> (CT-1): which checks apply to a cluster by the API groups it serves, and
/// the guard that omitting checks can never lower the headline (ADR-0011).
/// </summary>
public sealed class CapabilityCheckSetTests
{
    private static readonly string[] KubernetesGroups = ["apps", "batch", "networking.k8s.io"];

    [Fact]
    public void Unreadable_discovery_keeps_every_check()
    {
        CapabilityCheckSet.ApplicableTo(null).ShouldBe(CapabilityCheckSet.Checks);
    }

    [Fact]
    public void OpenShift_groups_keep_every_check_in_order()
    {
        CapabilityCheckSet.ApplicableTo([.. KubernetesGroups, "config.openshift.io"]).ShouldBe(CapabilityCheckSet.Checks);
    }

    [Fact]
    public void Kubernetes_groups_omit_only_the_OpenShift_check_and_keep_the_order()
    {
        CapabilityCheckSet.ApplicableTo(KubernetesGroups).Select(c => c.Id).ShouldBe(
            CapabilityCheckSet.Checks.Select(c => c.Id).Where(id => id != "list-clusteroperators"));
    }

    [Fact]
    public void Core_group_checks_apply_even_when_no_group_is_served()
    {
        CapabilityCheckSet.ApplicableTo([]).ShouldAllBe(c => c.Attributes.Group == "");
        CapabilityCheckSet.ApplicableTo([]).Select(c => c.Id).ShouldContain("list-pods");
    }

    // Guard: every headline id lives in core or apps, so a check added in an optional group can't silently lower the
    // headline on clusters that don't serve that group. Allowing everything that applies to a core+apps cluster must
    // reach the top non-admin level; allowing only its reads must reach view.
    [Fact]
    public void Headline_checks_are_all_applicable_to_a_core_and_apps_cluster()
    {
        var applicable = CapabilityCheckSet.ApplicableTo(["apps"]);

        CapabilityCheckSet.Evaluate(applicable.ToDictionary(c => c.Id, _ => true), clusterAdmin: false)
            .ShouldBe(CapabilityLevel.ClusterWideEdit);
        CapabilityCheckSet.Evaluate(applicable.ToDictionary(c => c.Id, c => c.Category == CapabilityCategory.Read), clusterAdmin: false)
            .ShouldBe(CapabilityLevel.ClusterWideView);
    }
}
