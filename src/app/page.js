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
  const [view, setView] = useState("loading"); // "loading" | "auth" | "dashboard"
  const [userEmail, setUserEmail] = useState("");
  const supabase = createClient();
  const router = useRouter();

  // Restore session on load. Stay in "loading" until we know the answer so we
  // never flash the login page before redirecting an authenticated user.
  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (cancelled) return;

      if (session) {
        setUserEmail(session.user.email);
        const { data: profile } = await supabase
          .from("profiles")
          .select("onboarding_status")
          .eq("id", session.user.id)
          .single();
        if (cancelled) return;

        if (!profile || profile.onboarding_status === "new") {
          router.push("/diagnostic");
        } else {
          setView("dashboard");
        }
      } else {
        setView("auth");
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setView("auth");
        setUserEmail("");
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const handleAuthSuccess = async (email, action) => {
    setUserEmail(email);
    if (action === "signup") {
      router.push("/diagnostic");
      return;
    }
    // For login: check if they've completed the diagnostic before
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarding_status")
        .eq("id", user.id)
        .single();
      if (!profile || profile.onboarding_status === "new") {
        router.push("/diagnostic");
      } else {
        setView("dashboard");
      }
    } else {
      setView("dashboard");
    }
  };

  const handleLogOut = async () => {
    await supabase.auth.signOut();
    setView("auth");
    setUserEmail("");
  };

  if (view === "loading") {
    return null;
  }

  return (
    <>
      <Navbar
        isAuthenticated={view !== "auth"}
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
