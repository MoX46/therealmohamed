// Turns a formula like "1000 * 1.07^x" into a function of x.
// Only math is understood: numbers, x, + - * / ^, brackets, pi, e and a few
// functions. Anything else is an error, so a post can never run code.

const FUNCTIONS: Record<string, (n: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sqrt: Math.sqrt,
  abs: Math.abs,
  exp: Math.exp,
  ln: Math.log,
  log: Math.log10,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
};
const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E };

type Node = (x: number) => number;

export function parseFormula(source: string): Node {
  const tokens = source.match(/\d*\.?\d+(?:e[+-]?\d+)?|[a-z]+|[-+*/^()]|\S/gi) ?? [];
  let i = 0;
  const peek = () => tokens[i];
  const fail = (why: string): never => {
    throw new Error(`can't read the formula "${source}": ${why}`);
  };
  const expect = (t: string) => (tokens[i] === t ? i++ : fail(`expected "${t}"`));

  // sum := product (("+" | "-") product)*
  const sum = (): Node => {
    let left = product();
    while (peek() === '+' || peek() === '-') {
      const op = tokens[i++];
      const a = left, b = product();
      left = op === '+' ? (x) => a(x) + b(x) : (x) => a(x) - b(x);
    }
    return left;
  };
  // product := unary (("*" | "/") unary | implicit unary)*, so "2x" and "2(x+1)" work
  const product = (): Node => {
    let left = unary();
    for (;;) {
      const t = peek();
      if (t === '*' || t === '/') {
        i++;
        const a = left, b = unary();
        left = t === '*' ? (x) => a(x) * b(x) : (x) => a(x) / b(x);
      } else if (t !== undefined && (t === '(' || /^[a-z\d.]/i.test(t))) {
        const a = left, b = unary();
        left = (x) => a(x) * b(x);
      } else return left;
    }
  };
  // unary := "-" unary | power
  const unary = (): Node => {
    if (peek() === '-') {
      i++;
      const a = unary();
      return (x) => -a(x);
    }
    if (peek() === '+') i++;
    return power();
  };
  // power := atom ("^" unary)?   (right to left, so 2^3^2 = 2^9)
  const power = (): Node => {
    const base = atom();
    if (peek() !== '^') return base;
    i++;
    const exp = unary();
    return (x) => base(x) ** exp(x);
  };
  const atom = (): Node => {
    const t = tokens[i++];
    if (t === undefined) return fail('it ends too early');
    if (t === '(') {
      const inner = sum();
      expect(')');
      return inner;
    }
    if (/^\d|^\./.test(t)) {
      const n = Number(t);
      return () => n;
    }
    const name = t.toLowerCase();
    if (name === 'x') return (x) => x;
    if (name in CONSTANTS) {
      const n = CONSTANTS[name];
      return () => n;
    }
    if (name in FUNCTIONS) {
      const f = FUNCTIONS[name];
      expect('(');
      const arg = sum();
      expect(')');
      return (x) => f(arg(x));
    }
    return fail(`"${t}" isn't something it knows (use x, numbers, pi, e, or ${Object.keys(FUNCTIONS).join(', ')})`);
  };

  const result = sum();
  if (i < tokens.length) fail(`didn't expect "${tokens[i]}"`);
  return result;
}
