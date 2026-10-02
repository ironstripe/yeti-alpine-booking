/**
 * QR code rendering for e-mail delivery (B+ Phase 2).
 *
 * Returns a PNG data URL so the QR code can be embedded in an e-mail body
 * without hosting a file, plus the raw base64 for an attachment. The encoder is
 * imported lazily so unit tests can run without the dependency and callers can
 * inject a stub renderer.
 */

export type QrRenderer = (payload: string) => Promise<string>;

/** Render a QR code as `data:image/png;base64,...`. */
export const renderQrPngDataUrl: QrRenderer = async (payload: string) => {
  // Lazy import: only the real delivery path needs the encoder.
  const mod = await import("npm:qrcode@1.5.4");
  const toDataURL = (mod.default ?? mod).toDataURL as (
    text: string,
    options: Record<string, unknown>,
  ) => Promise<string>;
  return await toDataURL(payload, {
    type: "image/png",
    errorCorrectionLevel: "M",
    margin: 0,
    width: 460,
  });
};

/** Strips the data URL prefix and returns the bare base64 payload. */
export function dataUrlToBase64(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  return comma === -1 ? dataUrl : dataUrl.slice(comma + 1);
}

/** File name for the QR attachment; invoice numbers are sanitised. */
export function qrAttachmentFilename(invoiceNumber?: string | null): string {
  const safe = (invoiceNumber ?? "").replace(/[^A-Za-z0-9._-]/g, "-");
  return safe ? `QR-Rechnung-${safe}.png` : "QR-Rechnung.png";
}