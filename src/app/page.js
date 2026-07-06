"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import SignUpContainer from "@/components/SignUpContainer";
import HeroPane from "@/components/HeroPane";
import SignUpForm from "@/components/SignUpForm";
import Dashboard from "@/components/Dashboard";
import { createClient } from "@/lib/supabase/client";

export default function Home() {
  const [view, setView] = useState("auth");
  const [userEmail, setUserEmail] = useState("");
  const supabase = createClient();
  const router = useRouter();

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
      router.push("/diagnostic");
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
      {view === "dashboard" && <Dashboard email={userEmail} />}
    </>
  );
}
