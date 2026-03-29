import React, { useState, useEffect, Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import './utils/api'; // Configura timeout global axios (evita esperas indefinidas)
import { ROUTES } from './constants';
import { SITE_TITLE, SITE_TITLE_SHORT } from './constants/siteMeta';
import ProviderHomeScreen from './screens/provider/ProviderHomeScreen'; // Import directo: evita errores de chunks lazy al confirmar onboarding
import RegisterScreen from './screens/RegisterScreen.jsx'; // Import directo: evita fallo de chunk al tocar "Registrarme"
import WelcomeScreen from './screens/WelcomeScreen.jsx'; // Import directo: evita fallback a bundle antiguo en pantalla inicial
import LoginScreen from './screens/LoginScreen.jsx'; // Import directo: evita flash Suspense (spinner) Welcome → Iniciar sesión
import ClientHome from './screens/client/ClientHome'; // Eager: primer destino post-login/registro cliente (menos flash Suspense)
import BookingFlowEntry from './screens/client/BookingFlowEntry.jsx';
import MachinerySelection from './screens/client/MachinerySelection'; // Eager: entrada típica al embudo de reserva
import ForgotPasswordScreen from './screens/ForgotPasswordScreen.jsx'; // Import directo: evita pantalla legacy de recuperación
import { AuthProvider } from './context/AuthContext';
import ToastProvider from './components/Toast';
import BottomNavigation from './components/BottomNavigation';
import ChatBot from './components/ChatBot';
import ScrollToTop from './components/ScrollToTop';
import OfflineBanner from './components/OfflineBanner';
import AdminRoute from './components/AdminRoute';
import ProtectedRoute from './components/ProtectedRoute';
import BookingFlowFallback from './components/BookingFlowFallback';
import { CheckoutProvider } from './context/CheckoutContext';
import BookingPaymentRouteStateBinding from './components/BookingPaymentRouteStateBinding';
import BookingNavigationGuard from './components/BookingNavigationGuard';

// Code-splitting: pantallas se cargan bajo demanda (menor bundle inicial, carga más rápida)
// Públicas
const SelectChannelScreen = lazy(() => import('./screens/SelectChannelScreen'));
const VerifySMSScreen = lazy(() => import('./screens/VerifySMSScreen'));
const VerifiedScreen = lazy(() => import('./screens/VerifiedScreen'));
const RoleSelection = lazy(() => import('./screens/RoleSelection'));
const CodeExpiredScreen = lazy(() => import('./screens/CodeExpiredScreen'));
const CodeIncorrectScreen = lazy(() => import('./screens/CodeIncorrectScreen'));
const ServiceChatScreen = lazy(() => import('./screens/ServiceChatScreen.jsx'));

// Cliente
const UrgencySelectionScreen = lazy(() => import('./screens/client/UrgencySelectionScreen'));
const CalendarMultiDayScreen = lazy(() => import('./screens/client/CalendarMultiDayScreen'));
const ServiceLocationScreen = lazy(() => import('./screens/client/ServiceLocationScreen'));
const ProviderOptionsScreen = lazy(() => import('./screens/client/ProviderOptionsScreen'));
const ConfirmServiceScreen = lazy(() => import('./screens/client/ConfirmServiceScreen'));
const BillingDataScreen = lazy(() => import('./screens/client/BillingDataScreen'));
const CardPaymentScreen = lazy(() => import('./screens/client/CardPaymentScreen'));
const OneClickCompleteScreen = lazy(() => import('./screens/client/OneClickCompleteScreen'));
const CardInput = lazy(() => import('./screens/client/CardInput'));
const PaymentResultScreen = lazy(() => import('./screens/client/PaymentResultScreen.jsx'));
const SearchingProviderScreen = lazy(() => import('./screens/client/SearchingProviderScreen'));
const WaitingConfirmationScreen = lazy(() => import('./screens/client/WaitingConfirmationScreen'));
const MachineryAssignedScreen = lazy(() => import('./screens/client/MachineryAssignedScreen'));
const ServiceConfirmed = lazy(() => import('./screens/client/ServiceConfirmed'));
const ServiceInProgress = lazy(() => import('./screens/client/ServiceInProgress'));
const Last30Minutes = lazy(() => import('./screens/client/Last30Minutes'));
const ServiceFinishedScreen = lazy(() => import('./screens/client/ServiceFinishedScreen'));
const ServiceActiveScreen = lazy(() => import('./screens/client/ServiceActiveScreen'));
const ServiceSummary = lazy(() => import('./screens/client/ServiceSummary'));
const RateService = lazy(() => import('./screens/client/RateService'));
const ProviderArrivedScreen = lazy(() => import('./screens/client/ProviderArrivedScreen'));
const ServiceNotificationScreen = lazy(() => import('./screens/client/ServiceNotificationScreen'));
const CancelServiceScreen = lazy(() => import('./screens/client/CancelServiceScreen'));
const WorkdayConfirmation = lazy(() => import('./screens/client/WorkdayConfirmation'));
const HistoryScreen = lazy(() => import('./screens/client/HistoryScreen'));
const ServiceDetailDemoScreen = lazy(() => import('./screens/client/ServiceDetailDemoScreen'));

// Proveedor
const ProviderRegisterScreen = lazy(() => import('./screens/provider/ProviderRegisterScreen'));
const ProviderSelectChannelScreen = lazy(() => import('./screens/provider/ProviderSelectChannelScreen'));
const ProviderVerifySMSScreen = lazy(() => import('./screens/provider/ProviderVerifySMSScreen'));
const ProviderVerifiedScreen = lazy(() => import('./screens/provider/ProviderVerifiedScreen'));
const ProviderDataScreen = lazy(() => import('./screens/provider/ProviderDataScreen'));
const MachineDataScreen = lazy(() => import('./screens/provider/MachineDataScreen'));
const MachinePhotosScreen = lazy(() => import('./screens/provider/MachinePhotosScreen'));
const PricingScreen = lazy(() => import('./screens/provider/PricingScreen'));
const OperatorDataScreen = lazy(() => import('./screens/provider/OperatorDataScreen'));
const ReviewScreen = lazy(() => import('./screens/provider/ReviewScreen'));
const ProviderAvailability = lazy(() => import('./screens/provider/ProviderAvailability'));
const RequestReceivedScreen = lazy(() => import('./screens/provider/RequestReceivedScreen'));
const ServiceAccepted = lazy(() => import('./screens/provider/ServiceAccepted'));
const SelectOperatorScreen = lazy(() => import('./screens/provider/SelectOperatorScreen'));
const EnRouteScreen = lazy(() => import('./screens/provider/EnRouteScreen'));
const ArrivalScreen = lazy(() => import('./screens/provider/ArrivalScreen'));
const ProviderServiceActiveScreen = lazy(() => import('./screens/provider/ProviderServiceActiveScreen'));
const Last30MinutesProvider = lazy(() => import('./screens/provider/Last30MinutesProvider'));
const ServiceInProgressProvider = lazy(() => import('./screens/provider/ServiceInProgressProvider'));
const ProviderServiceFinishedScreen = lazy(() => import('./screens/provider/ProviderServiceFinishedScreen'));
const ServiceFinishedProvider = lazy(() => import('./screens/provider/ServiceFinishedProvider'));
const RateClient = lazy(() => import('./screens/provider/RateClient'));
const MyMachinesScreen = lazy(() => import('./screens/provider/MyMachinesScreen'));
const ProviderDashboardSimple = lazy(() => import('./screens/provider/ProviderDashboardSimple'));
const ProviderHistoryScreen = lazy(() => import('./screens/provider/ProviderHistoryScreen'));
const ProviderProfileScreen = lazy(() => import('./screens/provider/ProviderProfileScreen'));
const UploadInvoiceScreen = lazy(() => import('./screens/provider/UploadInvoiceScreen'));
const PublishMachinery = lazy(() => import('./screens/provider/PublishMachinery'));
const TariffsScreen = lazy(() => import('./screens/provider/TariffsScreen'));
const OperatorScreen = lazy(() => import('./screens/provider/OperatorScreen'));
const TeamManagementScreen = lazy(() => import('./screens/provider/TeamManagementScreen'));
const EmpresaScreen = lazy(() => import('./screens/provider/EmpresaScreen'));
const BancoScreen = lazy(() => import('./screens/provider/BancoScreen'));
const MaqgoBillingScreen = lazy(() => import('./screens/provider/MaqgoBillingScreen'));

// Operador
const OperatorJoinScreen = lazy(() => import('./screens/operator/OperatorJoinScreen'));
const OperatorHomeScreen = lazy(() => import('./screens/operator/OperatorHomeScreen'));
const OperatorHistoryScreen = lazy(() => import('./screens/operator/OperatorHistoryScreen'));
const OperatorServiceCompletedScreen = lazy(() => import('./screens/operator/OperatorServiceCompletedScreen'));

// Admin
const AdminDashboard = lazy(() => import('./screens/admin/AdminDashboard'));
const AdminPricingScreen = lazy(() => import('./screens/admin/AdminPricingScreen'));
const AdminUsersScreen = lazy(() => import('./screens/admin/AdminUsersScreen'));
const AdminMarketingScreen = lazy(() => import('./screens/admin/AdminMarketingScreen'));

// Perfil y legales
const ProfileScreen = lazy(() => import('./screens/ProfileScreen'));
const FAQScreen = lazy(() => import('./screens/FAQScreen'));
const TermsScreen = lazy(() => import('./screens/TermsScreen'));
const PrivacyScreen = lazy(() => import('./screens/PrivacyScreen'));

function PageFallback() {
  return (
    <div className="maqgo-app" style={{ minHeight: '100vh', background: 'var(--maqgo-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-hidden="true">
      <span style={{ width: 32, height: 32, border: '3px solid rgba(236,104,25,0.3)', borderTopColor: 'var(--maqgo-orange)', borderRadius: '50%', animation: 'maqgo-spin 0.8s linear infinite' }} />
    </div>
  );
}

function AppContent() {
  const location = useLocation();
  const [, setUserRole] = useState(() => localStorage.getItem('userRole') || null);
  const [, setUserId] = useState(() => localStorage.getItem('userId') || null);

  const path = location.pathname;

  useEffect(() => {
    const normalized = path.replace(/\/$/, '') || '/';
    const useHomeTitle =
      normalized === '/' ||
      normalized === '/welcome' ||
      normalized === '/client/home' ||
      normalized === '/client/booking';
    document.title = useHomeTitle ? SITE_TITLE : SITE_TITLE_SHORT;
  }, [path]);
  // NUNCA mostrar nav: formularios, onboarding, flujos de reserva/pago
  const noNavPaths = [
    '/provider/data', '/provider/machine-data', '/provider/machine-photos',
    '/provider/pricing', '/provider/operator-data', '/provider/review',
    '/provider/upload-invoice',
    '/client/confirm', '/client/billing', '/client/card-input', '/client/service-location',
    '/client/providers', '/client/hours-selection', '/client/searching', '/client/waiting-confirmation'
  ];
  const hideNav = noNavPaths.some(p => path === p || path.startsWith(p + '/'));
  // MOSTRAR footer en pantallas principales: home, máquinas, perfil, historial (incluye subrutas)
  const mainPathsWithNav = [
    '/client/home', '/client/history', '/client/machinery', '/client/detalle-servicio',
    '/provider/home', '/provider/machines', '/provider/add-machine', '/provider/edit-machine',
    '/provider/profile', '/provider/history', '/provider/cobros', '/provider/dashboard', '/provider/my-services',
    '/provider/operator', '/provider/team', '/provider/tariffs',
    '/operator/home', '/operator/history', '/operator/completed',
    '/profile', '/faq', '/terms', '/privacy'
  ];
  const showBottomNav = !hideNav && mainPathsWithNav.some(p => path === p || path.startsWith(p + '/'));

  return (
    <CheckoutProvider>
    <div className={showBottomNav ? 'maqgo-with-bottom-nav' : ''} style={{ minHeight: '100dvh' }}>
      <BookingPaymentRouteStateBinding />
      <BookingNavigationGuard>
      <OfflineBanner />
      <ScrollToTop />
      <Suspense fallback={<BookingFlowFallback />}>
      <Routes>
        <Route element={<ProtectedRoute />}>
        <Route path="/" element={<WelcomeScreen />} />
        <Route path="/welcome" element={<WelcomeScreen />} />
        <Route path="/register" element={<RegisterScreen />} />
        <Route path="/login" element={<LoginScreen setUserRole={setUserRole} setUserId={setUserId} />} />
        <Route path="/forgot-password" element={<ForgotPasswordScreen />} />
        <Route path="/select-channel" element={<SelectChannelScreen />} />
        <Route path="/verify-sms" element={<VerifySMSScreen />} />
        <Route path="/verified" element={<VerifiedScreen />} />
        <Route path="/select-role" element={<RoleSelection setUserRole={setUserRole} setUserId={setUserId} />} />
        <Route path="/code-expired" element={<CodeExpiredScreen />} />
        <Route path="/code-incorrect" element={<CodeIncorrectScreen />} />

        {/* Chat por servicio (canal obligatorio cliente ↔ proveedor) */}
        <Route path="/chat/:serviceId" element={<ServiceChatScreen />} />

        {/* Cliente */}
        <Route path="/client/booking" element={<BookingFlowEntry />} />
        <Route path="/client/home" element={<ClientHome />} />
        <Route path="/client/machinery" element={<MachinerySelection />} />
        <Route path="/client/hours" element={<Navigate to="/client/service-location" replace />} />
        <Route path="/client/hours-selection" element={<Navigate to="/client/service-location" replace />} />
        <Route path="/client/urgency" element={<UrgencySelectionScreen />} />
        <Route path="/client/calendar" element={<CalendarMultiDayScreen />} />
        <Route path="/client/calendar-multi" element={<CalendarMultiDayScreen />} />
        <Route path="/client/reservation-data" element={<Navigate to="/client/service-location" replace />} />
        <Route path="/client/service-location" element={<ServiceLocationScreen />} />
        <Route path="/client/providers" element={<ProviderOptionsScreen />} />
        <Route path="/client/confirm" element={<ConfirmServiceScreen />} />
        <Route path="/client/billing" element={<BillingDataScreen />} />
        <Route path="/client/workday-confirmation" element={<WorkdayConfirmation />} />
        <Route path="/client/card" element={<CardPaymentScreen />} />
        <Route path="/oneclick/complete" element={<OneClickCompleteScreen />} />
        {/* Demo legado: en producción el flujo real es Oneclick (/client/card). */}
        <Route
          path="/client/card-input"
          element={
            import.meta.env.DEV ? <CardInput /> : <Navigate to="/client/card" replace />
          }
        />
        <Route path="/client/payment-result" element={<PaymentResultScreen />} />
        <Route path="/client/searching" element={<SearchingProviderScreen />} />
        <Route path="/client/waiting-confirmation" element={<WaitingConfirmationScreen />} />
        <Route path="/client/assigned" element={<MachineryAssignedScreen />} />
        <Route path="/client/service-confirmed" element={<ServiceConfirmed />} />
        <Route path="/client/in-progress" element={<ServiceInProgress />} />
        <Route path="/client/last-30" element={<Last30Minutes />} />
        <Route path="/client/finished" element={<ServiceFinishedScreen />} />
        <Route path="/client/service-active" element={<ServiceActiveScreen />} />
        <Route path="/client/service-finished" element={<ServiceFinishedScreen />} />
        <Route path="/client/summary" element={<ServiceSummary />} />
        <Route path="/client/rate" element={<RateService />} />
        <Route path="/client/provider-arrived" element={<ProviderArrivedScreen />} />
        <Route path="/client/notification" element={<ServiceNotificationScreen />} />
        <Route path="/client/cancel" element={<CancelServiceScreen />} />
        <Route path="/client/history" element={<HistoryScreen />} />
        <Route path="/client/detalle-servicio" element={<ServiceDetailDemoScreen />} />

        {/* Proveedor */}
        <Route path="/provider/register" element={<ProviderRegisterScreen />} />
        <Route path="/provider/select-channel" element={<ProviderSelectChannelScreen />} />
        <Route path="/provider/verify-sms" element={<ProviderVerifySMSScreen />} />
        <Route path="/provider/verified" element={<ProviderVerifiedScreen setUserRole={setUserRole} setUserId={setUserId} />} />
        <Route path="/provider/data" element={<ProviderDataScreen />} />
        <Route path="/provider/machine-data" element={<MachineDataScreen />} />
        <Route path="/provider/machine-photos" element={<MachinePhotosScreen />} />
        <Route path="/provider/pricing" element={<PricingScreen />} />
        <Route path="/provider/operator-data" element={<OperatorDataScreen />} />
        <Route path="/provider/review" element={<ReviewScreen />} />
        <Route path={ROUTES.PROVIDER_HOME} element={<ProviderHomeScreen />} />
        <Route path="/provider/availability" element={<ProviderAvailability />} />
        <Route path="/provider/request" element={<RequestReceivedScreen />} />
        <Route path="/provider/request-received" element={<RequestReceivedScreen />} />
        <Route path="/provider/accepted" element={<ServiceAccepted />} />
        <Route path="/provider/select-operator" element={<SelectOperatorScreen />} />
        <Route path="/provider/en-route" element={<EnRouteScreen />} />
        <Route path="/provider/arrival" element={<ArrivalScreen />} />
        <Route path="/provider/service-active" element={<ProviderServiceActiveScreen />} />
        <Route path="/provider/in-progress" element={<ServiceInProgressProvider />} />
        <Route path="/provider/last-30" element={<Last30MinutesProvider />} />
        <Route path="/provider/service-finished" element={<ProviderServiceFinishedScreen />} />
        <Route path="/provider/finished" element={<ProviderServiceFinishedScreen />} />
        <Route path="/provider/rate" element={<RateClient />} />
        <Route path="/provider/rate-client" element={<Navigate to="/provider/rate" replace />} />
        <Route path="/provider/machines" element={<MyMachinesScreen />} />
        <Route path="/provider/add-machine" element={<MachineDataScreen />} />
        <Route path="/provider/edit-machine/:id" element={<MachineDataScreen />} />
        <Route path="/provider/cobros" element={<ProviderDashboardSimple />} />
        <Route path="/provider/my-services" element={<ProviderDashboardSimple />} />
        <Route path="/provider/dashboard" element={<ProviderDashboardSimple />} />
        <Route path="/provider/history" element={<ProviderHistoryScreen />} />
        <Route path="/provider/profile" element={<ProviderProfileScreen />} />
        <Route path="/provider/upload-invoice/:serviceId" element={<UploadInvoiceScreen />} />
        <Route path="/provider/upload-invoice" element={<UploadInvoiceScreen />} />
        <Route path="/provider/tariffs" element={<TariffsScreen />} />
        <Route path="/provider/operator" element={<OperatorScreen />} />
        <Route path="/provider/team" element={<TeamManagementScreen />} />
        <Route path="/provider/profile/empresa" element={<EmpresaScreen />} />
        <Route path="/provider/profile/banco" element={<BancoScreen />} />
        <Route path="/provider/profile/maqgo-billing" element={<MaqgoBillingScreen />} />

        {/* Operador */}
        <Route path="/operator/join" element={<OperatorJoinScreen />} />
        <Route path="/operator/home" element={<OperatorHomeScreen />} />
        <Route path="/operator/history" element={<OperatorHistoryScreen />} />
        <Route path="/operator/completed" element={<OperatorServiceCompletedScreen />} />

        {/* Admin: un solo AdminRoute (layout) evita re-fetch /api/admin/stats y "Verificando..." en cada sub-ruta */}
        <Route path="/admin" element={<AdminRoute />}>
          <Route index element={<AdminDashboard />} />
          <Route path="pricing" element={<AdminPricingScreen />} />
          <Route path="users" element={<AdminUsersScreen />} />
          <Route path="marketing" element={<AdminMarketingScreen />} />
        </Route>

        {/* Perfil y legales */}
        <Route path="/profile" element={<ProfileScreen />} />
        <Route path="/faq" element={<FAQScreen />} />
        <Route path="/terms" element={<TermsScreen />} />
        <Route path="/privacy" element={<PrivacyScreen />} />
        {/* Catch-all: cualquier ruta no definida redirige a Welcome */}
        <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      </Suspense>
      {showBottomNav && <BottomNavigation />}
      <ChatBot />
      </BookingNavigationGuard>
    </div>
    </CheckoutProvider>
  );
}

export default function App() {
  return (
    <div style={{ minHeight: '100vh', width: '100%', background: '#000000' }}>
      <AuthProvider>
        <ToastProvider>
          <AppContent />
        </ToastProvider>
      </AuthProvider>
    </div>
  );
}
