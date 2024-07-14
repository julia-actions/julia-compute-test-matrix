import TOML, Pkg, JSON, GitHubActions

project_content = TOML.parsefile("Project.toml")

julia_compat_bound = project_content["compat"]["julia"]

version_spec = Pkg.Types.semver_spec(julia_compat_bound)

println("THE PASSED ARCH IS $(ENV["JULIA_ARCH"])")

function construct_channel_list(version)
    if Sys.iswindows()
        return version => ["$version~x64", "$version~x86"]
    elseif Sys.isapple()
        return version => ["$version"]
    elseif Sys.islinux()
        return version => ["$version"]
    else
        error("Unknown platform")
    end
end

versions = construct_channel_list.([
    v"1.0.5",
    v"1.1.1",
    v"1.2.0",
    v"1.3.1",
    v"1.4.2",
    v"1.5.4",
    v"1.6.7",
    v"1.7.3",
    v"1.8.5",
    v"1.9.4",
    v"1.10.4"
])

filter!(i -> i[1] in version_spec, versions)

flat_versions = collect(Iterators.flatten(map(i->i.second, versions)))

GitHubActions.set_output("juliaup-channels", flat_versions)
