import TOML, Pkg, JSON, GitHubActions

project_content = TOML.parsefile("Project.toml")

julia_compat_bound = project_content["compat"]["julia"]

version_spec = Pkg.Types.semver_spec(julia_compat_bound)

versions = Set{VersionNumber}()

all_existing_versions = [
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
    v"1.10.9",
    v"1.11.5"
]

all_compatible_versions = filter(i -> i in version_spec, all_existing_versions)

if ENV["INCLUDE_RELEASE_VERSIONS"] == "true"
    push!(versions, v"1.11.5")
end

if ENV["INCLUDE_LTS_VERSIONS"] == "true"
    push!(versions, v"1.10.9")
end

if ENV["INCLUDE_ALL_COMPATIBLE_MINOR_VERSIONS"] == "true"
    for i in all_compatible_versions
        push!(versions, i)
    end
end

if ENV["INCLUDE_SMALLEST_COMPATIBLE_MINOR_VERSIONS"] == "true"
    smallest_compatible_version = first(sort(all_compatible_versions))
    push!(versions, smallest_compatible_version)
end

filter!(i -> i in version_spec, versions)

function add_matrix_entries!(results, v)
    if ENV["INCLUDE_WINDOWS_X64"] == "true"
        push!(results, Dict("os" => "windows-latest", "juliaup-channel" => "$v~x64"))
    end

    if ENV["INCLUDE_WINDOWS_X86"] == "true"
        push!(results, Dict("os" => "windows-latest", "juliaup-channel" => "$v~x86"))
    end

    if ENV["INCLUDE_LINUX_X64"] == "true"
        push!(results, Dict("os" => "ubuntu-latest", "juliaup-channel" => "$v~x64"))
    end

    if ENV["INCLUDE_LINUX_X86"] == "true"
        push!(results, Dict("os" => "ubuntu-latest", "juliaup-channel" => "$v~x86"))
    end

    if ENV["INCLUDE_MACOS_X64"] == "true"
        # There is currently no known way to run Julia 1.4 on a Mac GitHub runner, so we skip
        if v != v"1.4.2"
            push!(results, Dict("os" => "macos-13", "juliaup-channel" => "$v~x64"))
        end
    end
    
    if ENV["INCLUDE_MACOS_AARCH64"] == "true" && v>=v"1.8.0"
        push!(results, Dict("os" => "macos-latest", "juliaup-channel" => "$v~aarch64"))
    end
end

results = []

for v in versions
    add_matrix_entries!(results, v)
end

if ENV["INCLUDE_RC_VERSIONS"] == "true"
    # if ENV["INCLUDE_WINDOWS_X64"] == "true"
    #     push!(results, Dict("os" => "windows-latest", "juliaup-channel" => "rc~x64"))
    # end

    # if ENV["INCLUDE_WINDOWS_X86"] == "true"
    #     push!(results, Dict("os" => "windows-latest", "juliaup-channel" => "rc~x86"))
    # end

    # if ENV["INCLUDE_LINUX_X64"] == "true"
    #     push!(results, Dict("os" => "ubuntu-latest", "juliaup-channel" => "rc~x64"))
    # end

    # if ENV["INCLUDE_LINUX_X86"] == "true"
    #     push!(results, Dict("os" => "ubuntu-latest", "juliaup-channel" => "rc~x86"))
    # end

    # if ENV["INCLUDE_MACOS_X64"] == "true"
    #     push!(results, Dict("os" => "macos-13", "juliaup-channel" => "rc~x64"))
    # end

    # if ENV["INCLUDE_MACOS_AARCH64"] == "true"
    #     push!(results, Dict("os" => "macos-latest", "juliaup-channel" => "rc~aarch64"))
    # end

end

if ENV["INCLUDE_BETA_VERSIONS"] == "true"
    if ENV["INCLUDE_WINDOWS_X64"] == "true"
        push!(results, Dict("os" => "windows-latest", "juliaup-channel" => "beta~x64"))
    end

    if ENV["INCLUDE_WINDOWS_X86"] == "true"
        push!(results, Dict("os" => "windows-latest", "juliaup-channel" => "beta~x86"))
    end

    if ENV["INCLUDE_LINUX_X64"] == "true"
        push!(results, Dict("os" => "ubuntu-latest", "juliaup-channel" => "beta~x64"))
    end

    if ENV["INCLUDE_LINUX_X86"] == "true"
        push!(results, Dict("os" => "ubuntu-latest", "juliaup-channel" => "beta~x86"))
    end

    if ENV["INCLUDE_MACOS_X64"] == "true"
        push!(results, Dict("os" => "macos-13", "juliaup-channel" => "beta~x64"))
    end

    if ENV["INCLUDE_MACOS_AARCH64"] == "true"
        push!(results, Dict("os" => "macos-latest", "juliaup-channel" => "beta~aarch64"))
    end    
end

if ENV["INCLUDE_ALPHA_VERSIONS"] == "true"
end

if ENV["INCLUDE_NIGHTLY_VERSIONS"] == "true"
    if ENV["INCLUDE_WINDOWS_X64"] == "true"
        push!(results, Dict("os" => "windows-latest", "juliaup-channel" => "nightly~x64"))
    end

    if ENV["INCLUDE_WINDOWS_X86"] == "true"
        push!(results, Dict("os" => "windows-latest", "juliaup-channel" => "nightly~x86"))
    end

    if ENV["INCLUDE_LINUX_X64"] == "true"
        push!(results, Dict("os" => "ubuntu-latest", "juliaup-channel" => "nightly~x64"))
    end

    if ENV["INCLUDE_LINUX_X86"] == "true"
        push!(results, Dict("os" => "ubuntu-latest", "juliaup-channel" => "nightly~x86"))
    end

    if ENV["INCLUDE_MACOS_X64"] == "true"
        push!(results, Dict("os" => "macos-13", "juliaup-channel" => "nightly~x64"))
    end

    if ENV["INCLUDE_MACOS_AARCH64"] == "true"
        push!(results, Dict("os" => "macos-latest", "juliaup-channel" => "nightly~aarch64"))
    end
end

# flat_versions = [
#     Dict("os" => "ubuntu-latest", "juliaup-channel" => "release"),
#     Dict("os" => "macos-latest", "juliaup-channel" => "release"),
# ]

JSON.print(results)

GitHubActions.set_output("test-matrix", results)
