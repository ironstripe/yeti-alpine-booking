import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

const PHOTO_TTL_SECONDS = 300;

/**
 * Internal portraits are stored in instructor-hr-photos, never in the public
 * avatar bucket. The DB and Storage RLS restrict these reads to staff.
 * Only short-lived signed URLs reach this in-memory query cache.
 */
export function useStaffInstructorPhotos(instructorIds: string[], canViewPrivatePhotos: boolean) {
  const { user } = useAuth();
  const idsKey = [...new Set(instructorIds)].sort().join(",");

  return useQuery({
    queryKey: ["staff-instructor-photos", user?.id, idsKey],
    enabled: !!user && canViewPrivatePhotos && !!idsKey,
    queryFn: async (): Promise<Record<string, string>> => {
      const ids = idsKey.split(",");
      const { data: photos, error: photosError } = await supabase
        .from("instructor_photos")
        .select("instructor_id, storage_path")
        .eq("is_current", true)
        .in("instructor_id", ids);
      if (photosError) throw photosError;
      if (!photos?.length) return {};

      // A single staff-authorized Storage request for the visible portraits;
      // never persist paths or signed URLs in instructors/public Team records.
      const { data: signed, error: signingError } = await supabase.storage
        .from("instructor-hr-photos")
        .createSignedUrls(photos.map((photo) => photo.storage_path), PHOTO_TTL_SECONDS);
      if (signingError) throw signingError;

      const urls: Record<string, string> = {};
      photos.forEach((photo, index) => {
        const url = signed?.[index]?.signedUrl;
        if (url) urls[photo.instructor_id] = url;
      });
      return urls;
    },
    staleTime: 3 * 60 * 1000,
    refetchInterval: 4 * 60 * 1000,
    refetchOnWindowFocus: true,
    // A signed URL should not remain in React Query after leaving this view.
    gcTime: 0,
    retry: 1,
  });
}
