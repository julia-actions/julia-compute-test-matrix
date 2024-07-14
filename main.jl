import TOML, Pkg, JSON, GitHubActions

project_content = TOML.parsefile("Project.toml")

julia_compat_bound = project_content["compat"]["julia"]

version_spec = Pkg.Types.semver_spec(julia_compat_bound)

versions = Set{VersionNumber}()

if ENV["INCLUDE_RELEASE_VERSIONS"] == "true"
    push!(versions, v"1.10.4")
end

if ENV["INCLUDE_LTS_VERSIONS"] == "true"
    push!(versions, v"1.6.7")
end

if ENV["INCLUDE_ALL_COMPATIBLE_MINOR_VERSIONS"] == "true"
    push!(versions, v"1.0.5")
    push!(versions, v"1.1.1")
    push!(versions, v"1.2.0")
    push!(versions, v"1.3.1")
    push!(versions, v"1.4.2")
    push!(versions, v"1.5.4")
    push!(versions, v"1.6.7")
    push!(versions, v"1.7.3")
    push!(versions, v"1.8.5")
    push!(versions, v"1.9.4")
    push!(versions, v"1.10.4")
end

if ENV["INCLUDE_RC_VERSIONS"] == "true"
    push!(versions, v"1.110-rc1")
end

if ENV["INCLUDE_BETA_VERSIONS"] == "true"
    # push!(versions, v"1.110-rc1")
end

if ENV["INCLUDE_ALPHA_VERSIONS"] == "true"
    # push!(versions, v"1.110-rc1")
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
    push!(results, Dict("os" => "windows-latest", "juliaup-channel" => "$v~x64"))
    push!(results, Dict("os" => "windows-latest", "juliaup-channel" => "$v~x86"))
    push!(results, Dict("os" => "ubuntu-latest", "juliaup-channel" => "$v~x64"))
    push!(results, Dict("os" => "ubuntu-latest", "juliaup-channel" => "$v~x86"))
    if v==v"1.4.2"
        # For some reason Julia 1.4 doesn't work on macos-13, so we downgrade to macos-12
        push!(results, Dict("os" => "macos-12", "juliaup-channel" => "$v~x64"))
    else
        push!(results, Dict("os" => "macos-13", "juliaup-channel" => "$v~x64"))
    end
    if v>=v"1.8.0"
        push!(results, Dict("os" => "macos-latest", "juliaup-channel" => "$v~aarch64"))
    end
end

results = []

for v in versions
    add_matrix_entries!(results, v)
end

if ENV["INCLUDE_NIGHTLY_VERSIONS"] == "true"
    push!(results, Dict("os" => "windows-latest", "juliaup-channel" => "nightly~x64"))
    push!(results, Dict("os" => "windows-latest", "juliaup-channel" => "nightly~x86"))
    push!(results, Dict("os" => "ubuntu-latest", "juliaup-channel" => "nightly~x64"))
    push!(results, Dict("os" => "ubuntu-latest", "juliaup-channel" => "nightly~x86"))
    push!(results, Dict("os" => "macos-13", "juliaup-channel" => "nightly~x64"))
    push!(results, Dict("os" => "macos-latest", "juliaup-channel" => "nightly~aarch64"))
end

# flat_versions = [
#     Dict("os" => "ubuntu-latest", "juliaup-channel" => "release"),
#     Dict("os" => "macos-latest", "juliaup-channel" => "release"),
# ]

JSON.print(results)

GitHubActions.set_output("test-matrix", results)
