// =============================================================================
// Sprint Stats-V2 — Client re-export do parser shared (RF-05)
//
// Toda a logica vive em `shared/snapshot-import-parser.ts` (server + client).
// Este arquivo expoe o mesmo contrato ao client com path alias amigavel.
// =============================================================================

export {
  parsePastedSnapshot,
  parseCsvSnapshot,
  type ParsedSnapshotResult,
} from "@shared/snapshot-import-parser";
