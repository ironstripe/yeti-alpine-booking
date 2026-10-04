import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";
const root = path.resolve(__dirname, "..");
const exact: Record<string,string> = {
  "@/hooks/useInstructorDetail": path.resolve(__dirname, "mockHooks.ts"),
  "@/hooks/useUserRole": path.resolve(__dirname, "mockHooks.ts"),
  "@/hooks/useIsSuperAdmin": path.resolve(__dirname, "mockHooks.ts"),
  "@/hooks/useStaffInstructorPhotos": path.resolve(__dirname, "mockHooks.ts"),
  "@/hooks/useInviteInstructor": path.resolve(__dirname, "mockHooks.ts"),
  "@/components/instructors/detail/ProfileInfoCard": path.resolve(__dirname, "stubs.tsx"),
  "@/components/instructors/detail/SeasonStatsCard": path.resolve(__dirname, "stubs.tsx"),
  "@/components/instructors/detail/AbsenceRequestCard": path.resolve(__dirname, "stubs.tsx"),
  "@/components/instructors/detail/RolesCapabilitiesCard": path.resolve(__dirname, "stubs.tsx"),
  "@/components/instructor/RecurringBlocksTab": path.resolve(__dirname, "stubs.tsx"),
  "@/components/instructors/detail/InstructorRentalsCard": path.resolve(__dirname, "stubs.tsx"),
  "@/components/instructors/EditInstructorModal": path.resolve(__dirname, "stubs.tsx"),
  "@/components/instructors/WebsiteProfileDialog": path.resolve(__dirname, "stubs.tsx"),
};
export default defineConfig({ root: path.resolve(__dirname), plugins: [react()], resolve: { alias: [{ find: /^@\/hooks\/useInstructorDetail$/, replacement: exact["@/hooks/useInstructorDetail"] }, { find: /^@\/hooks\/useUserRole$/, replacement: exact["@/hooks/useUserRole"] }, { find: /^@\/hooks\/useIsSuperAdmin$/, replacement: exact["@/hooks/useIsSuperAdmin"] }, { find: /^@\/hooks\/useStaffInstructorPhotos$/, replacement: exact["@/hooks/useStaffInstructorPhotos"] }, { find: /^@\/hooks\/useInviteInstructor$/, replacement: exact["@/hooks/useInviteInstructor"] }, ...Object.entries(exact).filter(([k])=>k.startsWith("@/components/instructors") || k.startsWith("@/components/instructor/")).map(([find,replacement])=>({find,replacement})), { find: "@", replacement: path.resolve(root, "src") }] }, server: { port: 4177, strictPort: true } });
