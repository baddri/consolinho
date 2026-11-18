using FleetConsole.Application.Abstractions.Messaging;

namespace FleetConsole.Application.SystemInfo.GetSystemInfo;

/// <summary>
/// Returns which FleetConsole build is running and in which environment. Shown in the UI footer and used to check that
/// a deployment (or the dev setup) is wired end to end. Anonymous and side-effect free.
/// </summary>
public sealed record GetSystemInfoQuery : IQuery<SystemInfoDto>;
