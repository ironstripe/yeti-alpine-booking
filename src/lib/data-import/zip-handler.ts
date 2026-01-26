// ZIP file extraction for data import
import JSZip from "jszip";

export interface ZipContents {
  files: Map<string, string>; // filename -> content
  statistics?: Record<string, unknown>;
  readme?: string;
}

export interface ZipExtractionResult {
  success: boolean;
  contents?: ZipContents;
  error?: string;
}

/**
 * Extract a ZIP file and return its contents as strings
 */
export async function extractZipFile(file: File): Promise<ZipExtractionResult> {
  try {
    const zip = await JSZip.loadAsync(file);
    const files = new Map<string, string>();
    let statistics: Record<string, unknown> | undefined;
    let readme: string | undefined;

    // Process each file in the ZIP
    const filePromises: Promise<void>[] = [];

    zip.forEach((relativePath, zipEntry) => {
      if (zipEntry.dir) return; // Skip directories

      const promise = zipEntry.async("string").then((content) => {
        const fileName = relativePath.split("/").pop() || relativePath;

        // Handle special files
        if (fileName.toLowerCase() === "statistics.json") {
          try {
            statistics = JSON.parse(content);
          } catch {
            // Invalid JSON, store as regular file
            files.set(fileName, content);
          }
        } else if (fileName.toLowerCase() === "readme.md") {
          readme = content;
        } else if (fileName.endsWith(".csv")) {
          files.set(fileName, content);
        }
      });

      filePromises.push(promise);
    });

    await Promise.all(filePromises);

    return {
      success: true,
      contents: {
        files,
        statistics,
        readme,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to extract ZIP file",
    };
  }
}

/**
 * Get expected CSV files from the ZIP
 */
export function getExpectedFiles(): string[] {
  return [
    "products.csv",
    "instructors.csv",
    "customers.csv",
    "customer_participants.csv",
    "tickets.csv",
    "ticket_items.csv",
  ];
}

/**
 * Validate that all required files are present
 */
export function validateZipContents(
  contents: ZipContents
): { valid: boolean; missing: string[] } {
  const expected = getExpectedFiles();
  const missing: string[] = [];

  for (const file of expected) {
    if (!contents.files.has(file)) {
      missing.push(file);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}
