import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Toaster } from "@/components/ui/toaster";
import { Login } from "@/pages/Login";
import { Dashboard } from "@/pages/Dashboard";
import { Medications } from "@/pages/Medications";
import { MedicationDetail } from "@/pages/MedicationDetail";
import { Backup } from "@/pages/Backup";
import { SettingsPage } from "@/pages/Settings";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/medications" element={<Medications />} />
            <Route path="/medications/:id" element={<MedicationDetail />} />
            <Route path="/backup" element={<Backup />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Route>
      </Routes>
      <Toaster />
    </BrowserRouter>
  );
}
