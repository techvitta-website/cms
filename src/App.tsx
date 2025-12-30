import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Resumes from "./pages/Resumes";
import RecruitmentHub from "./pages/RecruitmentHub";
import HRUsers from "./pages/HRUsers";
import Logs from "./pages/Logs";
import Shortlist from "./pages/Shortlist";
import Interview from "./pages/Interview";
import Feedback from "./pages/Feedback";
import DocumentVerification from "./pages/DocumentVerification";
import UploadDocuments from "./pages/UploadDocuments";
import UploadDocumentsLanding from "./pages/UploadDocumentsLanding";
import OfferLetter from "./pages/OfferLetter";
import ExperienceLetter from "./pages/ExperienceLetter";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import { AuthProvider } from "./context/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/login" element={<Login />} />
            {/* Public upload page - no authentication required */}
            <Route path="/upload-documents" element={<UploadDocumentsLanding />} />
            <Route path="/:id/upload-documents" element={<UploadDocuments />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Layout>
                    <Dashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />
            {/*
              Resumes page is temporarily disabled. Re-enable by restoring this route
              and the sidebar entry when the feature is ready.
            */}
            <Route
              path="/recruitment-hub"
              element={
                <ProtectedRoute>
                  <Layout>
                    <RecruitmentHub />
                  </Layout>
                </ProtectedRoute>
              }
            />
            {/* Redirect old routes to new merged module */}
            <Route path="/jobs" element={<Navigate to="/recruitment-hub" replace />} />
            <Route path="/matching" element={<Navigate to="/recruitment-hub" replace />} />
            <Route
              path="/shortlist"
              element={
                <ProtectedRoute>
                  <Layout>
                    <Shortlist />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/interview"
              element={
                <ProtectedRoute>
                  <Layout>
                    <Interview />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/feedback"
              element={
                <ProtectedRoute>
                  <Layout>
                    <Feedback />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/document-verification"
              element={
                <ProtectedRoute>
                  <Layout>
                    <DocumentVerification />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/offer-letter"
              element={
                <ProtectedRoute>
                  <Layout>
                    <OfferLetter />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/experience-letter"
              element={
                <ProtectedRoute>
                  <Layout>
                    <ExperienceLetter />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/hr-users"
              element={
                <ProtectedRoute>
                  <Layout>
                    <HRUsers />
                  </Layout>
                </ProtectedRoute>
              }
            />
            {/*
              Logs page is temporarily disabled. Re-enable by restoring this route
              and the sidebar entry when the feature is ready.
            */}
            {/* <Route
              path="/logs"
              element={
                <ProtectedRoute>
                  <Layout>
                    <Logs />
                  </Layout>
                </ProtectedRoute>
              }
            /> */}

            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;




