import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/layout";
import { InstallBanner } from "@/components/pwa/InstallBanner";
import { OfflineIndicator } from "@/components/pwa/OfflineIndicator";

// Pages
import Dashboard from "./pages/Index";
import Inbox from "./pages/Inbox";
import InboxDetail from "./pages/InboxDetail";
import Bookings from "./pages/Bookings";
import Customers from "./pages/Customers";
import Instructors from "./pages/Instructors";
import InstructorDetail from "./pages/InstructorDetail";
import Trainings from "./pages/Trainings";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import CustomerDetail from "./pages/CustomerDetail";
import BookingWizard from "./pages/BookingWizard";
import BookingDetail from "./pages/BookingDetail";
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
import BookingLanding from "./pages/booking-portal/BookingLanding";
import PrivateBookingForm from "./pages/booking-portal/PrivateBookingForm";
import GroupBookingForm from "./pages/booking-portal/GroupBookingForm";
import RequestConfirmation from "./pages/booking-portal/RequestConfirmation";
import Settings from "./pages/Settings";
import SettingsSchool from "./pages/SettingsSchool";
import SettingsProducts from "./pages/SettingsProducts";
import SettingsPricing from "./pages/SettingsPricing";
import SettingsSeasons from "./pages/SettingsSeasons";
import SettingsUsers from "./pages/SettingsUsers";
import SettingsEmailTemplates from "./pages/SettingsEmailTemplates";
import SettingsEmailTemplateEdit from "./pages/SettingsEmailTemplateEdit";
import SettingsNotifications from "./pages/SettingsNotifications";
import SettingsSystem from "./pages/SettingsSystem";

const queryClient = new QueryClient();

function LoginRoute() {
  const { user, loading } = useAuth();
  
  if (loading) {
    return null;
  }
  
  if (user) {
    return <Navigate to="/" replace />;
  }
  
  return <Login />;
}

const AppRoutes = () => (
  <Routes>
    {/* Public route */}
    <Route path="/login" element={<LoginRoute />} />
    
    {/* Protected routes */}
    <Route
      path="/"
      element={
        <AppLayout>
          <Dashboard />
        </AppLayout>
      }
    />
    <Route
      path="/inbox"
      element={
        <AppLayout>
          <Inbox />
        </AppLayout>
      }
    />
    <Route
      path="/inbox/:id"
      element={
        <AppLayout>
          <InboxDetail />
        </AppLayout>
      }
    />
    <Route
      path="/bookings"
      element={
        <AppLayout>
          <Bookings />
        </AppLayout>
      }
    />
    <Route path="/bookings/new" element={<BookingWizard />} />
    <Route
      path="/bookings/:id"
      element={
        <AppLayout>
          <BookingDetail />
        </AppLayout>
      }
    />
    <Route
      path="/customers"
      element={
        <AppLayout>
          <Customers />
        </AppLayout>
      }
    />
    <Route
      path="/customers/:id"
      element={
        <AppLayout>
          <CustomerDetail />
        </AppLayout>
      }
    />
    <Route
      path="/instructors"
      element={
        <AppLayout>
          <Instructors />
        </AppLayout>
      }
    />
    <Route
      path="/instructors/:id"
      element={
        <AppLayout>
          <InstructorDetail />
        </AppLayout>
      }
    />
    <Route
      path="/trainings"
      element={
        <AppLayout>
          <Trainings />
        </AppLayout>
      }
    />
    <Route
      path="/scheduler"
      element={
        <AppLayout>
          <Scheduler />
        </AppLayout>
      }
    />
    <Route
      path="/reconciliation"
      element={
        <AppLayout>
          <Reconciliation />
        </AppLayout>
      }
    />
    <Route
      path="/lists"
      element={
        <AppLayout>
          <Lists />
        </AppLayout>
      }
    />
    <Route
      path="/shop"
      element={
        <AppLayout>
          <Shop />
        </AppLayout>
      }
    />
    <Route
      path="/shop/products"
      element={
        <AppLayout>
          <ShopProducts />
        </AppLayout>
      }
    />
    <Route
      path="/shop/products/:id"
      element={
        <AppLayout>
          <ShopProductDetail />
        </AppLayout>
      }
    />
    <Route
      path="/shop/inventory"
      element={
        <AppLayout>
          <ShopInventory />
        </AppLayout>
      }
    />
    <Route
      path="/shop/transactions"
      element={
        <AppLayout>
          <ShopTransactions />
        </AppLayout>
      }
    />
    <Route
      path="/vouchers"
      element={
        <AppLayout>
          <Vouchers />
        </AppLayout>
      }
    />
    <Route
      path="/vouchers/new"
      element={
        <AppLayout>
          <VoucherNew />
        </AppLayout>
      }
    />
    <Route
      path="/vouchers/:id"
      element={
        <AppLayout>
          <VoucherDetail />
        </AppLayout>
      }
    />
    <Route
      path="/reports"
      element={
        <AppLayout>
          <Reports />
        </AppLayout>
      }
    />
    <Route
      path="/reports/revenue"
      element={
        <AppLayout>
          <ReportsRevenue />
        </AppLayout>
      }
    />
    <Route
      path="/reports/instructors"
      element={
        <AppLayout>
          <ReportsInstructors />
        </AppLayout>
      }
    />
    <Route
      path="/reports/bookings"
      element={
        <AppLayout>
          <ReportsBookings />
        </AppLayout>
      }
    />
    <Route
      path="/reports/customers"
      element={
        <AppLayout>
          <ReportsCustomers />
        </AppLayout>
      }
    />
    {/* Instructor Portal Routes */}
    <Route path="/instructor" element={<InstructorDashboard />} />
    <Route path="/instructor/schedule" element={<InstructorSchedule />} />
    <Route path="/instructor/availability" element={<InstructorAvailability />} />
    <Route path="/instructor/profile" element={<InstructorProfile />} />
    {/* Public Booking Portal Routes */}
    <Route path="/book" element={<BookingLanding />} />
    <Route path="/book/private" element={<PrivateBookingForm />} />
    <Route path="/book/group" element={<GroupBookingForm />} />
    <Route path="/book/request/:token" element={<RequestConfirmation />} />
    {/* Settings Routes */}
    <Route path="/settings" element={<Settings />} />
    <Route path="/settings/emails" element={<SettingsEmailTemplates />} />
    <Route path="/settings/emails/:id" element={<SettingsEmailTemplateEdit />} />
    {/* Catch-all route */}
    <Route path="*" element={<NotFound />} />
  </Routes>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <OfflineIndicator />
          <AppRoutes />
          <InstallBanner />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;