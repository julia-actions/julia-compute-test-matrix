import TOML, Pkg, JSON, GitHubActions

project_content = TOML.parsefile("Project.toml")

julia_compat_bound = project_content["compat"]["julia"]

version_spec = Pkg.Types.semver_spec(julia_compat_bound)

julia_arch = ENV["JULIA_ARCH"]

function construct_channel_list(version)
    if Sys.iswindows()
        return version => ["$version~$julia_arch"]
    elseif Sys.isapple()
        return version => ["$version~$julia_arch"]
    elseif Sys.islinux()
        return version => ["$version~$julia_arch"]
    else
        error("Unknown platform")
    end
end

versions = [
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
]

filter!(i -> i in version_spec, versions)

function add_matrix_entries!(results, v)
    push!(results, Dict("os" => "windows-latest", "juliaup_channel" => "$v~x64"))
    push!(results, Dict("os" => "windows-latest", "juliaup_channel" => "$v~x86"))
    push!(results, Dict("os" => "ubuntu-latest", "juliaup_channel" => "$v~x64"))
    push!(results, Dict("os" => "ubuntu-latest", "juliaup_channel" => "$v~x86"))
    if v==v"1.4.2"
        # For some reason Julia 1.4 doesn't work on macos-13, so we downgrade to macos-12
        push!(results, Dict("os" => "macos-12", "juliaup_channel" => "$v~x64"))
    else
        push!(results, Dict("os" => "macos-13", "juliaup_channel" => "$v~x64"))
    end
    if v>=v"1.8.0"
        push!(results, Dict("os" => "macos-latest", "juliaup_channel" => "$v~aarch64"))
    end
end

results = []

for v in versions
    add_matrix_entries!(results, v)
end


# flat_versions = [
#     Dict("os" => "ubuntu-latest", "juliaup_channel" => "release"),
#     Dict("os" => "macos-latest", "juliaup_channel" => "release"),
# ]

GitHubActions.set_output("test-matrix", results)
