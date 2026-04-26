export interface BalanceDelta {
  direction: "in" | "out";
  nativeAmount: number;
  sign: "positive" | "negative" | "zero" | "invalid";
  absDelta: number;
}

const EPSILON = 0.01;

export function computeBalanceDelta(input: {
  knownBalance: number;
  newBalance: number;
}): BalanceDelta {
  const { knownBalance, newBalance } = input;

  if (
    typeof knownBalance !== "number" ||
    typeof newBalance !== "number" ||
    !Number.isFinite(knownBalance) ||
    !Number.isFinite(newBalance)
  ) {
    return { sign: "invalid", direction: "in", nativeAmount: 0, absDelta: 0 };
  }

  const delta = newBalance - knownBalance;
  const absDelta = Math.abs(delta);

  if (absDelta <= EPSILON) {
    return { sign: "zero", direction: "in", nativeAmount: 0, absDelta: 0 };
  }

  if (delta > 0) {
    return { sign: "positive", direction: "in", nativeAmount: absDelta, absDelta };
  }

  return { sign: "negative", direction: "out", nativeAmount: absDelta, absDelta };
}
