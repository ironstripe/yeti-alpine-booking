import {
  BarChart3,
  Calculator,
  Calendar,
  FileText,
  Gift,
  GraduationCap,
  Home,
  Inbox,
  LayoutGrid,
  Settings,
  ShoppingCart,
  Trophy,
  UserCheck,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface AppNavigationItem {
  title: string;
  url: string;
  icon: LucideIcon;
  primaryBottomTab?: boolean;
  hasDynamicBadge?: boolean;
}

export const appNavigationItems: AppNavigationItem[] = [
  { title: "Dashboard", url: "/", icon: Home, primaryBottomTab: true },
  { title: "Posteingang", url: "/inbox", icon: Inbox, hasDynamicBadge: true },
  { title: "Buchungen", url: "/bookings", icon: Calendar, primaryBottomTab: true },
  { title: "Stundenplan", url: "/scheduler", icon: LayoutGrid, primaryBottomTab: true },
  { title: "Kunden", url: "/customers", icon: Users, primaryBottomTab: true },
  { title: "Skilehrer", url: "/instructors", icon: UserCheck },
  { title: "Listen", url: "/lists", icon: FileText },
  { title: "Shop", url: "/shop", icon: ShoppingCart },
  { title: "Gutscheine", url: "/vouchers", icon: Gift },
  { title: "Berichte", url: "/reports", icon: BarChart3 },
  { title: "Tagesabschluss", url: "/reconciliation", icon: Calculator },
  { title: "Kurse", url: "/trainings", icon: GraduationCap },
  { title: "Events", url: "/events", icon: Trophy },
  { title: "Einstellungen", url: "/settings", icon: Settings },
];

export const primaryBottomNavigationItems = appNavigationItems.filter(
  (item) => item.primaryBottomTab,
);

export const secondaryNavigationItems = appNavigationItems.filter(
  (item) => !item.primaryBottomTab,
);

export function isNavigationItemActive(pathname: string, url: string) {
  return url === "/" ? pathname === url : pathname === url || pathname.startsWith(`${url}/`);
}

export function getNavigationTitle(pathname: string) {
  return appNavigationItems.find((item) => isNavigationItemActive(pathname, item.url))?.title ?? "YETY";
}