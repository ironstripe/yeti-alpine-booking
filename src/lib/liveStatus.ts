/**
 * Decides whether a live-status UPDATE event came from somewhere else (another device/user).
 * Never relies on the realtime `old` payload: depending on the table's replica identity it may
 * contain only the primary key. Compares against what this screen already shows (cached status)
 * and the status this device itself just requested.
 */
export function isExternalStatusChange(
  incomingStatus: string | null | undefined,
  cachedStatus: string | null | undefined,
  ownPendingStatus: string | null | undefined,
): boolean {
  if (incomingStatus == null) return false;
  if (cachedStatus === undefined) return false; // nothing shown yet → nothing to flag
  if (incomingStatus === cachedStatus) return false;
  if (ownPendingStatus != null && incomingStatus === ownPendingStatus) return false;
  return true;
}
