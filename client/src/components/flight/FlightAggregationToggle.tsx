/**
 * Sprint Flight-1 RF-16: FlightAggregationToggle — agregar vs expandir.
 *
 * Spec: docs/specs/sprint-flight-1.md (RF-16, D13)
 *
 * Persiste user_settings.reportsExpandFlightSeries via PATCH e invalida
 * queries de reports apos mudanca.
 */

import React, { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface FlightAggregationToggleProps {
  initial?: boolean;
}

export const FlightAggregationToggle: React.FC<FlightAggregationToggleProps> = ({
  initial = false,
}) => {
  const [expand, setExpand] = useState<boolean>(initial);

  async function setMode(value: boolean): Promise<void> {
    setExpand(value);
    try {
      await apiRequest("PATCH", "/api/user/settings", {
        reportsExpandFlightSeries: value,
      });
      // Invalida queries de reports apos mudanca para refetch.
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
      queryClient.invalidateQueries({ queryKey: ["bankroll-reports"] });
    } catch (err) {
      // Reverte estado em caso de falha.
      setExpand(!value);
    }
  }

  return (
    <div data-testid="flight-aggregation-toggle" className="inline-flex gap-1 rounded-md border border-gray-700 p-1">
      <button
        data-testid="flight-aggregation-aggregate"
        type="button"
        onClick={() => setMode(false)}
        className={`px-3 py-1 text-xs rounded ${
          !expand ? "bg-green-500/20 text-green-300" : "text-gray-400 hover:text-white"
        }`}
      >
        Agregar series
      </button>
      <button
        data-testid="flight-aggregation-expand"
        type="button"
        onClick={() => setMode(true)}
        className={`px-3 py-1 text-xs rounded ${
          expand ? "bg-green-500/20 text-green-300" : "text-gray-400 hover:text-white"
        }`}
      >
        Expandir entries
      </button>
    </div>
  );
};

export default FlightAggregationToggle;
