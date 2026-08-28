import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Landing from "./pages/Landing";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";

export default function App() {
  // Initialize state from localStorage
  const [profile, setProfile] = useState(() => {
    try {
      const stored = localStorage.getItem("pathfinder_profile");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  
  const [intake, setIntake] = useState(() => {
    try {
      const stored = localStorage.getItem("pathfinder_intake");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  function handleProfileSet(profileData, intakeData) {
    setProfile(profileData);
    setIntake(intakeData);
    // Persist to localStorage
    localStorage.setItem("pathfinder_profile", JSON.stringify(profileData));
    localStorage.setItem("pathfinder_intake", JSON.stringify(intakeData));
  }

  function handleClearProfile() {
    setProfile(null);
    setIntake(null);
    localStorage.removeItem("pathfinder_profile");
    localStorage.removeItem("pathfinder_intake");
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
              <Dashboard profile={profile} intake={intake} onClearProfile={handleClearProfile} />
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
