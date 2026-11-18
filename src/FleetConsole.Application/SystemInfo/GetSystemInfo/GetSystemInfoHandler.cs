using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Domain.Common;

namespace FleetConsole.Application.SystemInfo.GetSystemInfo;

/// <summary>Answers <see cref="GetSystemInfoQuery"/> from the <see cref="IAppEnvironment"/> port; never fails.</summary>
internal sealed class GetSystemInfoHandler(IAppEnvironment environment) : IRequestHandler<GetSystemInfoQuery, Result<SystemInfoDto>>
{
    /// <inheritdoc />
    public Task<Result<SystemInfoDto>> Handle(GetSystemInfoQuery request, CancellationToken cancellationToken) =>
        Task.FromResult<Result<SystemInfoDto>>(new SystemInfoDto(environment.Version, environment.EnvironmentName));
}
