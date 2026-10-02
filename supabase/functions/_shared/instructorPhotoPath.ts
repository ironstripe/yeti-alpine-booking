// Only explicitly selected, CURRENT private photos may be published by instructor-website-publish.
// A dated import path is accepted here, not made public by this check.
const HASHED_CANONICAL_JPEG = /^\/(?:import|manual)-[0-9a-f]{64}\.jpg$/;
const HASHED_HIRES_JPEG = /^--manual-[0-9a-f]{64}\.jpg$/;

export function isAllowedPrivatePublishPath(instructorId: string, storagePath: string): boolean {
  if (storagePath.startsWith(`${instructorId}/`)) {
    return HASHED_CANONICAL_JPEG.test(storagePath.slice(instructorId.length));
  }
  const prefix = `hires-20261002/${instructorId}`;
  return storagePath.startsWith(prefix) && HASHED_HIRES_JPEG.test(storagePath.slice(prefix.length));
}
