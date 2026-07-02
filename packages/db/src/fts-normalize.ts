/**
 * Shared search-text normalization for the Postgres full-text path (#244).
 *
 * FTS5's `unicode61` tokenizer (SQLite path) does two things Postgres's
 * `'simple'` config + default parser do NOT:
 *   1. **Diacritic folding** (`remove_diacritics=1`, the FTS5 default): it
 *      indexes "Pokémon" as `pokemon`, so the query "pokemon" matches.
 *   2. **Splitting on ALL non-alphanumerics**: it indexes "Node.js" as
 *      `node`,`js`, while pg's default parser keeps host/email/path-shaped
 *      runs ("node.js", "dev@x.io", "a/b") as a SINGLE lexeme that a
 *      `node:* & js:*` prefix query can never match.
 *
 * To keep pg search results identical to FTS5, ONE fold map (defined here) is
 * applied to BOTH sides of the pg match:
 *   - the document: the `search_tsv` generated column wraps its source text in
 *     `translate(lower(…), FROM, TO)` (see {@link pgSearchVectorExpr});
 *   - the query: `toPgTsQuery` folds via {@link foldSearchText} before tokenizing.
 * Deriving both from the same table means they can never drift apart.
 *
 * Scope — pinned to FTS5's OBSERVED behaviour (probed against libsql, see the
 * parity tests): `remove_diacritics=1` folds exactly the characters with a
 * canonical decomposition (base letter + combining mark): é, ü, ñ, İ, ž, …
 * It does NOT fold stroked/ligature letters that have no decomposition —
 * ø, ł, đ, ð, ħ, ŧ, æ, œ, ß, þ — so those are deliberately ABSENT from this
 * map too: both engines then preserve them identically (self-consistent
 * matches; ASCII cross-queries miss on both). Both cases are mapped directly,
 * making the fold independent of the database locale's `lower()`. Non-Latin
 * CASE-folding on the document side depends on the pg locale's lower(), as it
 * does for any pg text search.
 */

/** Each group: every character in `chars` folds to the single ASCII `base`.
 *  Only canonically-decomposable characters (matching FTS5 unicode61). */
const FOLD_GROUPS: ReadonlyArray<readonly [chars: string, base: string]> = [
  ["àáâãäåāăąÀÁÂÃÄÅĀĂĄ", "a"],
  ["çćĉċčÇĆĈĊČ", "c"],
  ["ďĎ", "d"],
  ["èéêëēĕėęěÈÉÊËĒĔĖĘĚ", "e"],
  ["ĝğġģĜĞĠĢ", "g"],
  ["ĥĤ", "h"],
  ["ìíîïĩīĭįÌÍÎÏĨĪĬĮİ", "i"],
  ["ĵĴ", "j"],
  ["ķĶ", "k"],
  ["ĺļľĹĻĽ", "l"],
  ["ñńņňÑŃŅŇ", "n"],
  ["òóôõöōŏőÒÓÔÕÖŌŎŐ", "o"],
  ["ŕŗřŔŖŘ", "r"],
  ["śŝşšșŚŜŞŠȘ", "s"],
  ["ţťțŢŤȚ", "t"],
  ["ùúûüũūŭůűųÙÚÛÜŨŪŬŮŰŲ", "u"],
  ["ŵŴ", "w"],
  ["ýÿŷÝŸŶ", "y"],
  ["źżžŹŻŽ", "z"],
];

/** Compound joiners pg's default parser glues into single host/email/path/float
 *  lexemes. Mapped to a space so the document tokenizes like unicode61 does.
 *  (Other punctuation — hyphens, quotes, `!?,;` — already splits identically on
 *  both parsers, and the query-side tokenizer splits on ALL non-alnum anyway.) */
const JOINERS = ".@/:_";

/** `translate()` FROM string: every foldable character. No quote characters —
 *  safe to embed in a single-quoted SQL literal. */
export const SEARCH_FOLD_FROM =
  FOLD_GROUPS.map(([chars]) => chars).join("") + JOINERS;

/** `translate()` TO string: positionally aligned with {@link SEARCH_FOLD_FROM}
 *  by construction (each group's base repeated to its length; joiners → space). */
export const SEARCH_FOLD_TO =
  FOLD_GROUPS.map(([chars, base]) => base.repeat([...chars].length)).join("") +
  " ".repeat(JOINERS.length);

const FOLD_MAP = new Map<string, string>();
for (const [chars, base] of FOLD_GROUPS) for (const ch of chars) FOLD_MAP.set(ch, base);
for (const ch of JOINERS) FOLD_MAP.set(ch, " ");

/** JS-side application of the SAME fold `translate()` applies in SQL —
 *  used on the pg query text so query and document always agree. */
export function foldSearchText(text: string): string {
  let out = "";
  for (const ch of text) out += FOLD_MAP.get(ch) ?? ch;
  return out;
}

/** The full `search_tsv` document expression for a given source-text SQL
 *  expression. Single source of truth for the generated column (schema.pg.ts →
 *  migration) and the `ensureAppsFts` catch-up DDL, so they can't diverge.
 *  `lower()` handles ASCII case in any locale; accented case is handled by the
 *  fold map itself (both cases present), locale-independently. */
export function pgSearchVectorExpr(sourceExpr: string): string {
  return `to_tsvector('simple', translate(lower(${sourceExpr}), '${SEARCH_FOLD_FROM}', '${SEARCH_FOLD_TO}'))`;
}
