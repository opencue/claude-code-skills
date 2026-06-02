/**
 * Single source of truth for cue's on-disk locations.
 *
 * `configDir()` and `cacheDir()` were previously re-implemented ~14 times
 * across lib/ and commands/, in two subtly different variants:
 *   - correct:  `xdg && xdg.length > 0 ? xdg : ~/.config`  (empty XDG = unset)
 *   - buggy:    `xdg ? join(xdg, "cue") : ~/.config/cue`    (empty XDG = set →
 *               resolves to a *relative* "cue" path)
 * Centralizing here removes the drift and the empty-string footgun. The repo
 * root (`CUE_REPO_ROOT`/`SOUL_REPO_ROOT` + ~10 local resolutions) is a related
 * but distinct concern, intentionally left for a follow-up.
 */
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * cue's base config dir: `$XDG_CONFIG_HOME/cue`, else `~/.config/cue`.
 * A missing OR empty `XDG_CONFIG_HOME` falls back to `~/.config` (an
 * empty-but-set value must NOT resolve to a relative "cue" path).
 */
export function configDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  return join(xdg && xdg.length > 0 ? xdg : join(homedir(), ".config"), "cue");
}

/**
 * cue's cache dir: `$XDG_CACHE_HOME/cue`, else `~/.cache/cue`. Same
 * empty-string discipline as {@link configDir}.
 */
export function cacheDir(): string {
  const xdg = process.env.XDG_CACHE_HOME;
  return join(xdg && xdg.length > 0 ? xdg : join(homedir(), ".cache"), "cue");
}
