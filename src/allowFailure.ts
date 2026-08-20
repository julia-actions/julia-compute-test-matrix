// Decides which matrix legs are allowed to fail without failing the workflow.
//
// The caller passes a list of glob patterns; each is matched against the leg's
// "<juliaup-channel>:<os>" identity, e.g. "rc~x64:ubuntu-latest". Whether a leg
// is *blocking* is CI policy, not a property of the leg, so it is expressed as
// patterns rather than as a fixed rule over pre-release channels.

// Nothing is allowed to fail. Needed as an explicit word because the reusable
// workflows that wrap this action treat an empty input as "inherit the default".
const NONE = 'none';

export function parseAllowFailurePatterns(raw: string): string[] {
    const parts = raw
        .split(/[,\n]/)
        .map(p => p.trim())
        .filter(p => p !== '');
    if (parts.length === 1 && parts[0].toLowerCase() === NONE) {
        return [];
    }
    return parts;
}

function escapeRegex(s: string): string {
    return s.replace(/[^A-Za-z0-9_-]/g, c => '\\' + c);
}

// Patterns are written at whatever precision the author cares about: "rc" names a
// channel, "*~x86" an arch, "rc~x64:ubuntu-latest" one exact leg. The parts the
// pattern leaves out are filled in with wildcards before matching.
function expandPattern(pattern: string): string {
    let expanded = pattern;
    // No arch, no runner, no wildcard — a bare channel name such as "rc".
    if (!/[~:*]/.test(expanded)) {
        expanded = expanded + '~*';
    }
    if (!expanded.includes(':')) {
        expanded = expanded + ':*';
    }
    return expanded;
}

function globToRegex(pattern: string): RegExp {
    const body = expandPattern(pattern)
        .split('*')
        .map(escapeRegex)
        .join('.*');
    return new RegExp(`^${body}$`);
}

// `channel` is a juliaup channel such as "1.10.5~x64" or "rc~x64".
export function isAllowFailure(channel: string, os: string, patterns: string[]): boolean {
    const identity = `${channel}:${os}`;
    return patterns.some(p => globToRegex(p).test(identity));
}
