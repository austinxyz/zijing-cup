/**
 * How a player's name is written on screen: 姓, a space, 名 — the committee
 * sheet's Last Name column, then its First Name column, in that order.
 *
 * One helper rather than the same template literal in four components, because
 * some rosters put whole latin names in those two columns. Joined without the
 * space they read as one word — "GuanpengChen" — which is nobody's name, and
 * the app had shipped that on every screen a player appears on.
 *
 * The join order follows the columns as the sheet labels them and is not a
 * guess about name order: on the 2025 rosters the Last Name column holds the
 * family name on the great majority of rows (Li | Shen, Lin | Jay, Zhou |
 * Mike). A few rows are entered the other way round (Guanpeng | Chen), and
 * those will read backwards — that is a data-entry problem in the sheet, and
 * fixing it here would mean guessing which half is the surname, which no
 * amount of string handling can do reliably for mixed Chinese and English
 * names.
 *
 * Either half may be empty on a sheet, so the join drops the separator rather
 * than leaving a leading or trailing space.
 */
export function playerName(player: {
  last_name: string;
  first_name: string;
}): string {
  return [player.last_name, player.first_name].filter(Boolean).join(" ");
}
