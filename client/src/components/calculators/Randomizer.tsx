import { useState, useEffect, useCallback, useRef } from "react";
import { Dices } from "lucide-react";

function generateRandom(): number {
  return Math.floor(Math.random() * 100) + 1;
}

export default function Randomizer() {
  const [number, setNumber] = useState<number>(generateRandom);
  const [isAnimating, setIsAnimating] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setNumber(generateRandom());
      setIsAnimating(true);
      setTimeout(() => setIsAnimating(false), 300);
    }, 5000);
  }, []);

  useEffect(() => {
    startTimer();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [startTimer]);

  const handleClick = useCallback(() => {
    setNumber(generateRandom());
    setIsAnimating(true);
    setTimeout(() => setIsAnimating(false), 300);
    startTimer();
  }, [startTimer]);

  return (
    <div
      className="bg-gray-900 text-gray-200 rounded-xl p-4 sm:p-5 w-full max-w-xs cursor-pointer select-none active:opacity-80 transition-opacity"
      onClick={handleClick}
      title="Clique para randomizar"
    >
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-emerald-500/15 border border-emerald-500/30">
          <Dices className={`h-6 w-6 text-emerald-400 transition-transform duration-200 ${isAnimating ? "rotate-180" : ""}`} />
        </div>
        <p className="text-[11px] text-gray-500 font-medium tracking-wider uppercase">
          Randomizador
        </p>
        <p
          className={`text-5xl font-black font-mono tabular-nums text-emerald-400 transition-transform duration-200 ${isAnimating ? "scale-110" : "scale-100"}`}
        >
          {number}
        </p>
        <p className="text-[10px] text-gray-600">
          1 – 100 · auto a cada 5s
        </p>
      </div>
    </div>
  );
}
