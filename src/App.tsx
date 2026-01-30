import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ActiveRoleProvider } from "@/contexts/ActiveRoleContext";
import { AppLayout } from "@/components/layout";
import { InstallBanner } from "@/components/pwa/InstallBanner";
import { OfflineIndicator } from "@/components/pwa/OfflineIndicator";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { OnboardingDialog } from "@/components/onboarding/OnboardingDialog";
import { SessionTimeoutWarning } from "@/components/auth/SessionTimeoutWarning";
import { RoleSwitcherModal } from "@/components/auth/RoleSwitcherModal";
import { Loader2 } from "lucide-react";

// Pages
import Dashboard from "./pages/Index";
import Inbox from "./pages/Inbox";
import InboxDetail from "./pages/InboxDetail";
import Bookings from "./pages/Bookings";
import Customers from "./pages/Customers";
import Instructors from "./pages/Instructors";
import InstructorDetail from "./pages/InstructorDetail";
import Trainings from "./pages/Trainings";
import TrainingDetail from "./pages/TrainingDetail";
import GroupCoursePlanning from "./pages/GroupCoursePlanning";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import CustomerDetail from "./pages/CustomerDetail";
import BookingWizard from "./pages/BookingWizard";
import BookingDetail from "./pages/BookingDetail";
import SchoolCampBooking from "./pages/SchoolCampBooking";
import Scheduler from "./pages/Scheduler";
import Reconciliation from "./pages/Reconciliation";
import Lists from "./pages/Lists";
import Shop from "./pages/Shop";
import ShopProducts from "./pages/ShopProducts";
import ShopProductDetail from "./pages/ShopProductDetail";
import ShopInventory from "./pages/ShopInventory";
import ShopTransactions from "./pages/ShopTransactions";
import Vouchers from "./pages/Vouchers";
import VoucherNew from "./pages/VoucherNew";
import VoucherDetail from "./pages/VoucherDetail";
import Reports from "./pages/Reports";
import ReportsRevenue from "./pages/ReportsRevenue";
import ReportsInstructors from "./pages/ReportsInstructors";
import ReportsBookings from "./pages/ReportsBookings";
import ReportsCustomers from "./pages/ReportsCustomers";
import InstructorDashboard from "./pages/InstructorDashboard";
import InstructorSchedule from "./pages/InstructorSchedule";
import InstructorAvailability from "./pages/InstructorAvailability";
import InstructorProfile from "./pages/InstructorProfile";
import InstructorConfirmations from "./pages/InstructorConfirmations";
import InstructorGroupManagement from "./pages/InstructorGroupManagement";
import BookingLanding from "./pages/booking-portal/BookingLanding";
import PrivateBookingForm from "./pages/booking-portal/PrivateBookingForm";
import GroupBookingForm from "./pages/booking-portal/GroupBookingForm";
import RequestConfirmation from "./pages/booking-portal/RequestConfirmation";
import Settings from "./pages/Settings";
import SettingsSchool from "./pages/SettingsSchool";
import SettingsProducts from "./pages/SettingsProducts";
import SettingsPricing from "./pages/SettingsPricing";
import SettingsSeasons from "./pages/SettingsSeasons";
import SettingsDailyTasks from "./pages/SettingsDailyTasks";
import SettingsUsers from "./pages/SettingsUsers";
import SettingsEmailTemplates from "./pages/SettingsEmailTemplates";
import SettingsEmailTemplateEdit from "./pages/SettingsEmailTemplateEdit";
import SettingsNotifications from "./pages/SettingsNotifications";
import SettingsAI from "./pages/SettingsAI";
import SettingsDataImport from "./pages/SettingsDataImport";
import SettingsSystem from "./pages/SettingsSystem";
import SetPassword from "./pages/SetPassword";
import TestInstructorLogin from "./pages/TestInstructorLogin";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000, // Data fresh for 30 seconds
      refetchOnWindowFocus: false, // Don't refetch on tab switch
      refetchOnReconnect: false, // Don't refetch on network reconnect
      retry: 1, // Only retry failed requests once
    },
  },
});

function LoginRoute() {
  const { user, loading } = useAuth();
  
  // Show loading spinner instead of null to prevent flickering
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Laden...</p>
        </div>
      </div>
    );
  }
  
  if (user) {
    return <Navigate to="/" replace />;
  }
  
  return <Login />;
}

// Only render these components when user is authenticated
function AuthenticatedComponents() {
  const { user, loading } = useAuth();
  
  // Don't render on login page or during loading
  if (loading || !user) return null;
  
  return (
    <>
      <OnboardingDialog />
      <SessionTimeoutWarning />
      <RoleSwitcherModal />
    </>
  );
}

const AppRoutes = () => (
  <Routes>
    {/* Public route */}
    <Route path="/login" element={<LoginRoute />} />

    {/* Public scheduler route for testing */}
    <Route path="/scheduler" element={<Scheduler />} />

    {/* Public Booking Portal Routes */}
    <Route path="/book" element={<BookingLanding />} />
    
    {/* Password setup for invited instructors */}
    <Route path="/set-password" element={<SetPassword />} />
    
    {/* Test login for instructor portal (magic links) */}
    <Route path="/test-instructor/:token" element={<TestInstructorLogin />} />
    
    <Route path="/book/private" element={<PrivateBookingForm />} />
    <Route path="/book/group" element={<GroupBookingForm />} />
    <Route path="/book/request/:token" element={<RequestConfirmation />} />

    {/* Booking creation routes (kept outside the main layout) */}
    <Route path="/bookings/new" element={<BookingWizard />} />
    <Route path="/bookings/new/school-camp" element={<SchoolCampBooking />} />

    {/* Instructor Portal Routes */}
    <Route path="/instructor" element={<InstructorDashboard />} />
    <Route path="/instructor/schedule" element={<InstructorSchedule />} />
    <Route path="/instructor/confirmations" element={<InstructorConfirmations />} />
    <Route path="/instructor/availability" element={<InstructorAvailability />} />
    <Route path="/instructor/group/:instanceId" element={<InstructorGroupManagement />} />
    <Route path="/instructor/profile" element={<InstructorProfile />} />

    {/* Protected app routes (single persistent layout to avoid remount flicker) */}
    <Route element={<AppLayout />}>
      <Route index element={<Dashboard />} />
      <Route path="inbox" element={<Inbox />} />
      <Route path="inbox/:id" element={<InboxDetail />} />
      <Route path="bookings" element={<Bookings />} />
      <Route path="bookings/:id" element={<BookingDetail />} />
      <Route path="customers" element={<Customers />} />
      <Route path="customers/:id" element={<CustomerDetail />} />
      <Route path="instructors" element={<Instructors />} />
      <Route path="instructors/:id" element={<InstructorDetail />} />
      <Route path="trainings" element={<Trainings />} />
      <Route path="trainings/planning" element={<GroupCoursePlanning />} />
      <Route path="trainings/:id" element={<TrainingDetail />} />
      <Route path="trainings/:id/instances" element={<TrainingDetail />} />
      <Route path="reconciliation" element={<Reconciliation />} />
      <Route path="lists" element={<Lists />} />
      <Route path="shop" element={<Shop />} />
      <Route path="shop/products" element={<ShopProducts />} />
      <Route path="shop/products/:id" element={<ShopProductDetail />} />
      <Route path="shop/inventory" element={<ShopInventory />} />
      <Route path="shop/transactions" element={<ShopTransactions />} />
      <Route path="vouchers" element={<Vouchers />} />
      <Route path="vouchers/new" element={<VoucherNew />} />
      <Route path="vouchers/:id" element={<VoucherDetail />} />
      <Route path="reports" element={<Reports />} />
      <Route path="reports/revenue" element={<ReportsRevenue />} />
      <Route path="reports/instructors" element={<ReportsInstructors />} />
      <Route path="reports/bookings" element={<ReportsBookings />} />
      <Route path="reports/customers" element={<ReportsCustomers />} />
      <Route path="settings" element={<Settings />} />
      <Route path="settings/school" element={<SettingsSchool />} />
      <Route path="settings/products" element={<SettingsProducts />} />
      <Route path="settings/pricing" element={<SettingsPricing />} />
      <Route path="settings/seasons" element={<SettingsSeasons />} />
      <Route path="settings/daily-tasks" element={<SettingsDailyTasks />} />
      <Route path="settings/users" element={<SettingsUsers />} />
      <Route path="settings/emails" element={<SettingsEmailTemplates />} />
      <Route path="settings/emails/:id" element={<SettingsEmailTemplateEdit />} />
      <Route path="settings/notifications" element={<SettingsNotifications />} />
      <Route path="settings/ai" element={<SettingsAI />} />
      <Route path="settings/import" element={<SettingsDataImport />} />
      <Route path="settings/system" element={<SettingsSystem />} />
    </Route>

    {/* Catch-all route */}
    <Route path="*" element={<NotFound />} />
  </Routes>
);

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <ActiveRoleProvider>
              <OfflineIndicator />
              <AppRoutes />
              <InstallBanner />
              <AuthenticatedComponents />
            </ActiveRoleProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;