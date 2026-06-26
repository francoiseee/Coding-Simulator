"use client";

import { useState, useEffect } from "react";
import Navbar from "@/components/Navbar";
import SignUpContainer from "@/components/SignUpContainer";
import HeroPane from "@/components/HeroPane";
import SignUpForm from "@/components/SignUpForm";
import Assessment from "@/components/Assessment";
import Dashboard from "@/components/Dashboard";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const [view, setView] = useState("auth");
  const [userEmail, setUserEmail] = useState("");

  // Restore session on load
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUserEmail(session.user.email);
        setView("dashboard");
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setView("auth");
        setUserEmail("");
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleAuthSuccess = (email, action) => {
    setUserEmail(email);
    if (action === "login") {
      setView("dashboard");
    } else {
      setView("assessment");
    }
  };

  const handleLogOut = async () => {
    await supabase.auth.signOut();
    setView("auth");
    setUserEmail("");
  };

  return (
    <>
      <Navbar
        isAuthenticated={view !== "auth"}
        showSearch={view === "dashboard"}
        onLogOut={handleLogOut}
      />
      {view === "auth" && (
        <SignUpContainer>
          <HeroPane />
          <SignUpForm onAuthSuccess={handleAuthSuccess} />
        </SignUpContainer>
      )}
      {view === "assessment" && (
        <Assessment
          email={userEmail}
          onEnterDashboard={() => setView("dashboard")}
        />
      )}
      {view === "dashboard" && <Dashboard email={userEmail} />}
    </>
  );
}
