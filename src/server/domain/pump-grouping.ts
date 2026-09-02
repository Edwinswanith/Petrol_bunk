/**
 * A pump is the unit of cash accountability: one attendant works the whole
 * dispenser, enters one set of collections, and is credited with one handover.
 * Nozzles and sides stay meaningful for metering, but never split the money.
 *
 * The fallbacks keep older records working: a station configured before
 * dispensers existed groups by its side, and a standalone station by itself.
 */
export function pumpGroupId(station: { dispenserId?: string; sideId?: string }, stationId: string) {
  return station.dispenserId ?? station.sideId ?? stationId;
}

export function pumpGroupLabel(station: { dispenserCode?: string; sideLabel?: string; name?: string }, fallback: string) {
  if (station.dispenserCode) return `Pump ${station.dispenserCode}`;
  return station.sideLabel ?? station.name ?? fallback;
}
