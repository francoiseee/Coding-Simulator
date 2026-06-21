'use client';

import { useState } from 'react';
import Navbar from "@/components/Navbar";
import SignUpContainer from "@/components/SignUpContainer";
import HeroPane from "@/components/HeroPane";
import SignUpForm from "@/components/SignUpForm";
import Assessment from "@/components/Assessment";
import Dashboard from "@/components/Dashboard";

export default function Home() {
  const [view, setView] = useState('auth'); // 'auth', 'assessment', or 'dashboard'
  const [userEmail, setUserEmail] = useState('');

  const handleAuthSuccess = (email, action) => {
    setUserEmail(email);
    if (action === 'login') {
      setView('dashboard');
    } else {
      setView('assessment');
    }
  };

  const handleLogOut = () => {
    setView('auth');
    setUserEmail('');
  };

  return (
    <>
      <Navbar
        isAuthenticated={view !== 'auth'}
        showSearch={view === 'dashboard'}
        onLogOut={handleLogOut}
      />
      {view === 'auth' && (
        <SignUpContainer>
          <HeroPane />
          <SignUpForm onAuthSuccess={handleAuthSuccess} />
        </SignUpContainer>
      )}
      {view === 'assessment' && (
        <Assessment
          email={userEmail}
          onEnterDashboard={() => setView('dashboard')}
        />
      )}
      {view === 'dashboard' && (
        <Dashboard email={userEmail} />
      )}
    </>
  );
}
