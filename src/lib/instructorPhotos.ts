import { supabase } from "@/integrations/supabase/client";

export const PRIVATE_PHOTO_BUCKET = "instructor-hr-photos";

/** Short-lived signed URL for a private instructor portrait (staff only via storage RLS). */
export async function getPrivatePhotoUrl(path: string, expiresIn = 300): Promise<string | null> {
  if (!path || path.includes("..") || path.startsWith("/")) return null;
  const { data, error } = await supabase.storage.from(PRIVATE_PHOTO_BUCKET).createSignedUrl(path, expiresIn);
  if (error) return null;
  return data.signedUrl;
}
