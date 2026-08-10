'use client';

import { useState } from 'react';
import styles from './SignUpForm.module.css';
import { createClient } from '@/lib/supabase/client';

export default function SignUpForm({ onAuthSuccess }) {
  const supabase = createClient();
  const [mode, setMode] = useState('signup'); // 'login' or 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [status, setStatus] = useState(null); // { type: 'success'|'error', message: string }
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus(null);

    // Basic Validation
    if (!email) {
      setStatus({ type: 'error', message: 'Email field is required.' });
      return;
    }
    if (!password) {
      setStatus({ type: 'error', message: 'Password field is required.' });
      return;
    }
    if (mode === 'signup' && password !== confirmPassword) {
      setStatus({ type: 'error', message: 'Passwords do not match.' });
      return;
    }

    setIsLoading(true);

    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: 'http://localhost:3000',
        },
      });
      setIsLoading(false);
      if (error) {
        setStatus({ type: 'error', message: error.message });
        return;
      }
      setStatus({ type: 'success', message: 'Confirmation sent. Check your email, then log in below.' });
      setTimeout(() => handleTabChange('login'), 1500);
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setIsLoading(false);
      if (error) {
        setStatus({ type: 'error', message: error.message });
        return;
      }
      setStatus({ type: 'success', message: 'Access granted. Welcome back, Node operator!' });
      setTimeout(() => onAuthSuccess?.(email, 'login'), 1000);
    }
  };

  const handleTabChange = (newMode) => {
    setMode(newMode);
    setStatus(null);
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  return (
    <section className={styles.formPane}>
      {/* Log In / Sign Up Toggles */}
      <div className={styles.tabToggleWrapper}>
        <button
          id="btn-login-tab"
          type="button"
          className={`${styles.tabBtn} ${mode === 'login' ? styles.tabBtnActive : ''}`}
          onClick={() => handleTabChange('login')}
        >
          LOG IN
        </button>
        <button
          id="btn-signup-tab"
          type="button"
          className={`${styles.tabBtn} ${mode === 'signup' ? styles.tabBtnActive : ''}`}
          onClick={() => handleTabChange('signup')}
        >
          SIGN UP
        </button>
      </div>

      {/* Headings */}
      <div className={styles.headingWrapper}>
        <h2 className={styles.title}>
          {mode === 'signup' ? 'Create Your Account' : 'Welcome Back'}
        </h2>
        <p className={styles.subtitle}>
          {mode === 'signup'
            ? 'Join the next generation of academic simulation.'
            : 'Access your decentralized node architecture.'}
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} noValidate>
        {/* Email Field */}
        <div className={styles.formGroup}>
          <label htmlFor="input-email" className={styles.label}>
            Email
          </label>
          <div className={styles.inputWrapper}>
            <input
              id="input-email"
              type="email"
              className={styles.input}
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              required
            />
            <div className={styles.icon}>
              {/* @ Icon */}
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="4" />
                <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" />
              </svg>
            </div>
          </div>
        </div>

        {/* Password Field */}
        <div className={styles.formGroup}>
          <label htmlFor="input-password" className={styles.label}>
            Password
          </label>
          <div className={styles.inputWrapper}>
            <input
              id="input-password"
              type={showPassword ? 'text' : 'password'}
              className={`${styles.input} ${styles.inputWithToggle}`}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              required
            />
            <div className={styles.icon}>
              {/* Lock Icon */}
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <button
              type="button"
              className={styles.toggleVisibility}
              onClick={() => setShowPassword((v) => !v)}
              disabled={isLoading}
              tabIndex={-1}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Confirm Password Field (Only Sign Up) */}
        {mode === 'signup' && (
          <div className={styles.formGroup}>
            <label htmlFor="input-confirm-password" className={styles.label}>
              Confirm Password
            </label>
            <div className={styles.inputWrapper}>
              <input
                id="input-confirm-password"
                type={showConfirmPassword ? 'text' : 'password'}
                className={`${styles.input} ${styles.inputWithToggle}`}
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isLoading}
                required
              />
              <div className={styles.icon}>
                {/* Lock Icon */}
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <button
                type="button"
                className={styles.toggleVisibility}
                onClick={() => setShowConfirmPassword((v) => !v)}
                disabled={isLoading}
                tabIndex={-1}
                aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
              >
                {showConfirmPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Action Button */}
        <button
          id="btn-submit-form"
          type="submit"
          className={styles.submitBtn}
          disabled={isLoading}
        >
          <span>
            {isLoading
              ? 'Initializing...'
              : mode === 'signup'
                ? 'Create Account'
                : 'Log In'}
          </span>
          {!isLoading && (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={styles.arrowIcon}
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          )}
        </button>
      </form>

      {/* Error/Success Feedbacks */}
      {status && (
        <div
          id="form-status"
          className={`${styles.statusMessage} ${status.type === 'success' ? styles.success : styles.error
            }`}
        >
          {status.message}
        </div>
      )}
    </section>
  );
}
