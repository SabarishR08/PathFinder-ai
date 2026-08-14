import { useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Landing from "./pages/Landing";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";

export default function App() {
  const [profile, setProfile] = useState(null);   // { user_id, profile: {...} }
  const [intake, setIntake] = useState(null);     // LLM/manual extracted fields

  function handleProfileSet(profileData, intakeData) {
    setProfile(profileData);
    setIntake(intakeData);
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route
          path="/onboarding"
          element={<Onboarding onProfileSet={handleProfileSet} />}
        />
        <Route
          path="/dashboard"
          element={
            profile ? (
              <Dashboard profile={profile} intake={intake} />
            ) : (
              <Navigate to="/onboarding" replace />
            )
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
