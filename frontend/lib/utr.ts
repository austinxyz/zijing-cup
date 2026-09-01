/**
 * The one place the UTR site's address is written down.
 *
 * Three screens link to a player's profile — the roster, the player detail
 * page, and the player list. A second literal is how one of them keeps
 * pointing at an old address after the other two are updated, and a link to
 * the wrong place looks exactly like a link to the right place.
 */
const UTR_PROFILE_BASE = "https://app.utrsports.net/profiles/";

/**
 * The UTR profile page for a player's profile id.
 *
 * Deliberately has no "empty" behaviour: it does not return `""` or `"#"` for
 * a missing id. A caller holding one of those would render a link that cannot
 * be clicked, which is the shape the spec rules out — nobody has filled the id
 * in yet, and that is not an error state. Callers check for the id first and
 * render plain text when it is absent.
 */
export function profileUrl(profileId: string): string {
  return UTR_PROFILE_BASE + encodeURIComponent(profileId);
}
