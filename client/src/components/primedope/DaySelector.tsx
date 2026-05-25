import * as React from "react";

const DIAS_PT_BR = ["Domingo", "Segunda", "Terca", "Quarta", "Quinta", "Sexta", "Sabado"];

interface DaySelectorProps {
  selectedDay: number;
  onDayChange: (day: number) => void;
}

export function DaySelector({ selectedDay, onDayChange }: DaySelectorProps): React.ReactElement {
  return (
    <div className="flex flex-wrap gap-1">
      {DIAS_PT_BR.map((dia, i) => (
        <button
          key={i}
          type="button"
          aria-pressed={i === selectedDay ? "true" : "false"}
          className={`rounded px-2 py-1 text-sm ${
            i === selectedDay
              ? "bg-primary text-primary-foreground font-bold active selected"
              : "bg-muted text-muted-foreground"
          }`}
          onClick={() => onDayChange(i)}
        >
          {dia}
        </button>
      ))}
    </div>
  );
}

export default DaySelector;
