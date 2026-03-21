import { useState, useRef, useEffect } from "react";
import { Copy } from "lucide-react";
import { weekDays } from "./types";

interface CopyDayDropdownProps {
  fromDay: number;
  fromProfile: string;
  onCopyTo: (toDay: number) => void;
}

export function CopyDayDropdown({ fromDay, fromProfile, onCopyTo }: CopyDayDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const otherDays = weekDays.filter((d) => d.id !== fromDay);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        className="p-1 rounded hover:bg-slate-600 text-slate-400 hover:text-white transition-colors"
        title={`Copiar ${weekDays.find((d) => d.id === fromDay)?.short} ${fromProfile} para...`}
      >
        <Copy className="w-3.5 h-3.5" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-slate-700 border border-slate-600 rounded-md shadow-lg py-1 min-w-[140px]">
          <div className="px-3 py-1 text-[10px] text-slate-400 uppercase tracking-wide">
            Copiar para...
          </div>
          {otherDays.map((day) => (
            <button
              key={day.id}
              type="button"
              className="w-full text-left px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-600 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onCopyTo(day.id);
                setOpen(false);
              }}
            >
              {day.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
