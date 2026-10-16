/** Local pure talents: datetime + safe calculate (no new deps).
 *
 * calculate uses a whitelist AST walk instead of eval/Function (Hermes
 * has no JIT to hide behind; member access is refused outright). Both
 * talents never throw — the agent feeds their strings back to the model.
 */

const MAX_EXPR_LEN = 200;

/** Tokenizer + recursive-descent parser for safe arithmetic only. */
function parseExpression(src: string): number {
  const tokens: Array<{ kind: string; value: string }> = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t") {
      i += 1;
      continue;
    }
    if ((c >= "0" && c <= "9") || c === ".") {
      let j = i;
      while (
        j < src.length &&
        ((src[j] >= "0" && src[j] <= "9") || src[j] === ".")
      ) {
        j += 1;
      }
      tokens.push({ kind: "num", value: src.slice(i, j) });
      i = j;
      continue;
    }
    if (c === "*" && src[i + 1] === "*") {
      tokens.push({ kind: "op", value: "**" });
      i += 2;
      continue;
    }
    if ("+-*/%()".includes(c)) {
      tokens.push({ kind: c === "(" || c === ")" ? "paren" : "op", value: c });
      i += 1;
      continue;
    }
    throw new TypeError(`bad character ${JSON.stringify(c)}`);
  }
  let pos = 0;
  function peek(): { kind: string; value: string } | null {
    return pos < tokens.length ? tokens[pos] : null;
  }
  // Least precedence: + and -.
  function parseAdd(): number {
    let v = parseMul();
    for (;;) {
      const t = peek();
      if (t?.kind === "op" && (t.value === "+" || t.value === "-")) {
        pos += 1;
        const r = parseMul();
        v = t.value === "+" ? v + r : v - r;
      } else return v;
    }
  }
  // Middle: * / and %.
  function parseMul(): number {
    let v = parsePow();
    for (;;) {
      const t = peek();
      if (t?.kind === "op" && (t.value === "*" || t.value === "/" || t.value === "%")) {
        pos += 1;
        const r = parsePow();
        v = t.value === "*" ? v * r : t.value === "/" ? v / r : v % r;
      } else return v;
    }
  }
  // Tightest: ** (right-associative) then unary then atoms.
  function parsePow(): number {
    const base = parseUnary();
    const t = peek();
    if (t?.kind === "op" && t.value === "**") {
      pos += 1;
      return base ** parsePow();
    }
    return base;
  }
  function parseUnary(): number {
    const t = peek();
    if (t?.kind === "op" && (t.value === "+" || t.value === "-")) {
      pos += 1;
      const v = parseUnary();
      return t.value === "+" ? v : -v;
    }
    return parseAtom();
  }
  function parseAtom(): number {
    const t = peek();
    if (t === null) throw new TypeError("empty expression");
    if (t.kind === "num") {
      pos += 1;
      const v = Number(t.value);
      if (!Number.isFinite(v)) throw new TypeError("bad number");
      return v;
    }
    if (t.kind === "paren" && t.value === "(") {
      pos += 1;
      const v = parseAdd();
      const close = peek();
      if (close?.kind !== "paren" || close.value !== ")") {
        throw new TypeError("unbalanced paren");
      }
      pos += 1;
      return v;
    }
    throw new TypeError("unexpected token");
  }
  // The parser above only admits numbers, parens, and operators —
  // nothing else reaches evaluation, so no eval/Function is needed.
  const out = parseAdd();
  if (peek() !== null) throw new TypeError("trailing input");
  return out;
}

/** Current local time as ISO-8601; never throws. */
export function localTime(args: { timezone?: string }): string {
  try {
    const tz =
      typeof args.timezone === "string" && args.timezone !== ""
        ? args.timezone
        : Intl.DateTimeFormat().resolvedOptions().timeZone;
    // RangeError on unknown zones doubles as validation.
    return new Date().toLocaleString("sv-SE", { timeZone: tz }).replace(" ", "T");
  } catch {
    return `datetime: unknown or invalid timezone ${JSON.stringify(args.timezone ?? "")}`;
  }
}

/** Safe arithmetic; friendly message strings, never throws. */
export function calculate(args: { expression?: string }): string {
  const expression = typeof args.expression === "string" ? args.expression : "";
  if (expression.trim() === "") return "calculate: missing or empty expression";
  if (expression.length > MAX_EXPR_LEN) {
    return `calculate: expression too long (max ${MAX_EXPR_LEN} chars)`;
  }
  try {
    const value = parseExpression(expression);
    if (!Number.isFinite(value)) return "calculate: cannot evaluate that";
    return `${expression} = ${String(value)}`;
  } catch {
    return `calculate: cannot evaluate ${JSON.stringify(expression)}`;
  }
}
