'use client';

import { useState } from 'react';
import styles from './SignUpForm.module.css';

export default function SignUpForm() {
  const [mode, setMode] = useState('signup'); // 'login' or 'signup'
  const [email, setEmail] = useState('name@gmail.com');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [status, setStatus] = useState(null); // { type: 'success'|'error', message: string }
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e) => {
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

    // Simulate API initialization call
    setTimeout(() => {
      setIsLoading(false);
      if (mode === 'signup') {
        setStatus({
          type: 'success',
          message: 'Core identity initialized. Welcome to the node architecture!',
        });
      } else {
        setStatus({
          type: 'success',
          message: 'Access granted. Welcome back, Node operator!',
        });
      }
    }, 1200);
  };

  const handleTabChange = (newMode) => {
    setMode(newMode);
    setStatus(null);
    setPassword('');
    setConfirmPassword('');
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
              type="password"
              className={styles.input}
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
                type="password"
                className={styles.input}
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
