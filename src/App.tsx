import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/layout";

// Pages
import Dashboard from "./pages/Index";
import Inbox from "./pages/Inbox";
import Bookings from "./pages/Bookings";
import Customers from "./pages/Customers";
import Instructors from "./pages/Instructors";
import InstructorDetail from "./pages/InstructorDetail";
import Trainings from "./pages/Trainings";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import CustomerDetail from "./pages/CustomerDetail";
import BookingWizard from "./pages/BookingWizard";
import Scheduler from "./pages/Scheduler";

const queryClient = new QueryClient();

// Component to handle login route redirect for authenticated users
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
      path="/bookings"
      element={
        <AppLayout>
          <Bookings />
        </AppLayout>
      }
    />
    <Route path="/bookings/new" element={<BookingWizard />} />
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
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;