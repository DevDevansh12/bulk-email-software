/**
 * Centralized route definitions with code splitting.
 * All feature routes are lazy-loaded for performance.
 *
 * Guards:
 *   - RequireAuth  → wraps the entire /dashboard subtree
 *   - RedirectIfAuth → wraps all /auth/* pages so logged-in users go to /dashboard
 */
import { Routes, Route } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { RequireAuth, RedirectIfAuth } from './guards.js';

// ── Layouts ───────────────────────────────────────────────────────────────────
const DashboardLayout = lazy(() =>
  import('@/components/layout/DashboardLayout.js').then((m) => ({ default: m.DashboardLayout }))
);

// ── Public pages ──────────────────────────────────────────────────────────────
const HomePage = lazy(() =>
  import('@/pages/HomePage.js').then((m) => ({ default: m.HomePage }))
);
const NotFoundPage = lazy(() =>
  import('@/pages/NotFoundPage.js').then((m) => ({ default: m.NotFoundPage }))
);

// ── Auth pages ────────────────────────────────────────────────────────────────
const LoginPage = lazy(() =>
  import('@/pages/auth/LoginPage.js').then((m) => ({ default: m.LoginPage }))
);
const RegisterPage = lazy(() =>
  import('@/pages/auth/RegisterPage.js').then((m) => ({ default: m.RegisterPage }))
);
const ForgotPasswordPage = lazy(() =>
  import('@/pages/auth/ForgotPasswordPage.js').then((m) => ({ default: m.ForgotPasswordPage }))
);
const ResetPasswordPage = lazy(() =>
  import('@/pages/auth/ResetPasswordPage.js').then((m) => ({ default: m.ResetPasswordPage }))
);

// ── Dashboard pages ───────────────────────────────────────────────────────────
const DashboardHomePage = lazy(() =>
  import('@/pages/dashboard/DashboardHomePage.js').then((m) => ({ default: m.DashboardHomePage }))
);
const CampaignsPage = lazy(() =>
  import('@/pages/dashboard/CampaignsPage.js').then((m) => ({ default: m.CampaignsPage }))
);
const SendCampaignPage = lazy(() =>
  import('@/pages/dashboard/SendCampaignPage.js').then((m) => ({ default: m.SendCampaignPage }))
);
const CampaignDetailPage = lazy(() =>
  import('@/pages/dashboard/CampaignDetailPage.js').then((m) => ({ default: m.CampaignDetailPage }))
);
const AudiencesPage = lazy(() =>
  import('@/pages/dashboard/AudiencesPage.js').then((m) => ({ default: m.AudiencesPage }))
);
const AnalyticsPage = lazy(() =>
  import('@/pages/dashboard/AnalyticsPage.js').then((m) => ({ default: m.AnalyticsPage }))
);
const SettingsPage = lazy(() =>
  import('@/pages/dashboard/SettingsPage.js').then((m) => ({ default: m.SettingsPage }))
);
const WhatsAppCampaignsPage = lazy(() =>
  import('@/pages/dashboard/whatsapp/WhatsAppCampaignsPage.js').then((m) => ({ default: m.WhatsAppCampaignsPage }))
);
const SendWhatsAppCampaignPage = lazy(() =>
  import('@/pages/dashboard/whatsapp/SendWhatsAppCampaignPage.js').then((m) => ({ default: m.SendWhatsAppCampaignPage }))
);
const WhatsAppCampaignDetailPage = lazy(() =>
  import('@/pages/dashboard/whatsapp/WhatsAppCampaignDetailPage.js').then((m) => ({ default: m.WhatsAppCampaignDetailPage }))
);
const WhatsAppTemplatesPage = lazy(() =>
  import('@/pages/dashboard/whatsapp/WhatsAppTemplatesPage.js').then((m) => ({ default: m.WhatsAppTemplatesPage }))
);
const EmailTemplatesPage = lazy(() =>
  import('@/pages/dashboard/EmailTemplatesPage.js').then((m) => ({ default: m.EmailTemplatesPage }))
);
const MergeVariablesPage = lazy(() =>
  import('@/pages/dashboard/MergeVariablesPage.js').then((m) => ({ default: m.MergeVariablesPage }))
);

function PageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
    </div>
  );
}

export function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Public */}
        <Route path="/" element={<HomePage />} />

        {/* Auth — redirect to /dashboard if already logged in */}
        <Route
          path="/auth/login"
          element={
            <RedirectIfAuth>
              <LoginPage />
            </RedirectIfAuth>
          }
        />
        <Route
          path="/auth/register"
          element={
            <RedirectIfAuth>
              <RegisterPage />
            </RedirectIfAuth>
          }
        />
        <Route
          path="/auth/forgot-password"
          element={
            <RedirectIfAuth>
              <ForgotPasswordPage />
            </RedirectIfAuth>
          }
        />
        {/* Reset doesn't need RedirectIfAuth — token links should always be accessible */}
        <Route path="/auth/reset-password" element={<ResetPasswordPage />} />

        {/* Protected dashboard — RequireAuth handles redirect + loading */}
        <Route
          path="/dashboard"
          element={
            <RequireAuth>
              <DashboardLayout />
            </RequireAuth>
          }
        >
          <Route index element={<DashboardHomePage />} />
          <Route path="campaigns" element={<CampaignsPage />} />
          <Route path="campaigns/send" element={<SendCampaignPage />} />
          <Route path="campaigns/templates" element={<EmailTemplatesPage />} />
          <Route path="campaigns/variables" element={<MergeVariablesPage />} />
          <Route path="campaigns/:id" element={<CampaignDetailPage />} />
          <Route path="whatsapp" element={<WhatsAppCampaignsPage />} />
          <Route path="whatsapp/send" element={<SendWhatsAppCampaignPage />} />
          <Route path="whatsapp/templates" element={<WhatsAppTemplatesPage />} />
          <Route path="whatsapp/campaigns/:id" element={<WhatsAppCampaignDetailPage />} />
          <Route path="audiences" element={<AudiencesPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>

        {/* 404 */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
