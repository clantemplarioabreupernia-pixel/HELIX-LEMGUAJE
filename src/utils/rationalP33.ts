const PRIMES_33 = [
  2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n, 43n, 47n, 53n,
  59n, 61n, 67n, 71n, 73n, 79n, 83n, 89n, 97n, 101n, 103n, 107n, 109n, 113n,
  127n, 131n, 137n,
];

export interface RationalP33 {
  num: bigint;
  den: bigint;
  inSubringP33: boolean;
  remainderFactor: bigint;
}

function absBigInt(n: bigint): bigint {
  return n < 0n ? -n : n;
}

function gcdBigInt(a: bigint, b: bigint): bigint {
  let x = absBigInt(a);
  let y = absBigInt(b);
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x === 0n ? 1n : x;
}

export function checkDenominatorInP33(den: bigint): {
  inSubringP33: boolean;
  remainderFactor: bigint;
} {
  let n = absBigInt(den);
  if (n === 0n) {
    return { inSubringP33: false, remainderFactor: 0n };
  }
  for (const p of PRIMES_33) {
    while (n % p === 0n) {
      n = n / p;
    }
  }
  return { inSubringP33: n === 1n, remainderFactor: n };
}

export function makeRationalP33(num: bigint, den: bigint): RationalP33 {
  if (den === 0n) {
    throw new Error('División por cero prohibida en aritmética racional P33.');
  }
  const sign = den < 0n ? -1n : 1n;
  const signedNum = num * sign;
  const posDen = absBigInt(den);
  const g = gcdBigInt(signedNum, posDen);
  const rNum = signedNum / g;
  const rDen = posDen / g;
  const check = checkDenominatorInP33(rDen);
  return {
    num: rNum,
    den: rDen,
    inSubringP33: check.inSubringP33,
    remainderFactor: check.remainderFactor,
  };
}

export function addRationalP33(a: RationalP33, b: RationalP33): RationalP33 {
  return makeRationalP33(a.num * b.den + b.num * a.den, a.den * b.den);
}

export function subRationalP33(a: RationalP33, b: RationalP33): RationalP33 {
  return makeRationalP33(a.num * b.den - b.num * a.den, a.den * b.den);
}

export function mulRationalP33(a: RationalP33, b: RationalP33): RationalP33 {
  return makeRationalP33(a.num * b.num, a.den * b.den);
}

export function divRationalP33(a: RationalP33, b: RationalP33): RationalP33 {
  if (b.num === 0n) {
    throw new Error('División por cero en divisor racional P33.');
  }
  return makeRationalP33(a.num * b.den, a.den * b.num);
}

export function formatRationalP33(r: RationalP33): string {
  return r.den === 1n ? r.num.toString() : `${r.num.toString()}/${r.den.toString()}`;
}
