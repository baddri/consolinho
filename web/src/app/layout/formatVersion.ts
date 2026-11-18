/** A deployment version prepared for display: a compact form for tight spaces plus the untouched full value. */
export interface FormattedVersion {
  /** Compact form, e.g. `1.0.0+dc5aff8`. */
  short: string;
  /** The version exactly as the Api reported it, e.g. `1.0.0+dc5aff8da720c3d4249989d27d74a6aa9435ea6b`. */
  full: string;
  /** True when `short` drops information from `full`, so the UI should offer the full value (e.g. in a tooltip). */
  isAbbreviated: boolean;
}

/** Length git uses for abbreviated commit hashes; enough to identify a commit in practice. */
const SHORT_SHA_LENGTH = 7;

/** Build metadata that looks like a commit hash (hex only, longer than the short form). */
const COMMIT_HASH = new RegExp(`^[0-9a-f]{${SHORT_SHA_LENGTH + 1},}$`, 'i');

/**
 * Formats an informational version (`<semver>[+<build metadata>]`) for the sidebar footer.
 *
 * .NET builds from git append the full 40-character commit SHA as SemVer build metadata, which has no break
 * opportunities and overflows narrow containers. The SHA is cut to 7 characters (like `git log --oneline`); any other
 * build metadata (e.g. `+build.5`) and the version core are kept as-is. Pure, so it is unit-tested directly.
 */
export function formatVersion(version: string): FormattedVersion {
  const full = version.trim();
  if (full === '') {
    return { short: full, full, isAbbreviated: false };
  }

  const plus = full.indexOf('+');
  const core = plus === -1 ? full : full.slice(0, plus);
  const metadata = plus === -1 ? undefined : full.slice(plus + 1);

  const isAbbreviated = metadata !== undefined && COMMIT_HASH.test(metadata);
  const shortMetadata = isAbbreviated ? metadata.slice(0, SHORT_SHA_LENGTH) : metadata;
  const short = shortMetadata === undefined ? core : `${core}+${shortMetadata}`;

  return { short, full, isAbbreviated };
}
