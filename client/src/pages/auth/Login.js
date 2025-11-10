import React, { useState } from 'react';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../../firebase';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';

export default function Login() {
  const [email,setEmail] = useState('');
  const [password,setPassword] = useState('');
  const [error,setError] = useState('');
  const [info,setInfo] = useState('');
  const nav = useNavigate();
  

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    try {
      // Login with Firebase
      const { user } = await signInWithEmailAndPassword(auth, email, password);

      // Fetch user profile from backend
      const me = await api('/api/auth/me');
      console.log("🔎 User after login:", me.user);

      // No email verification required for sign-in

      const role = me.user?.role;
      if (!role) {
        setError("No role assigned. Please contact admin.");
        return;
      }

      // Successful login

      // Redirect based on role
      if (role === 'student') nav('/student');
      else if (role === 'institution') nav('/institution');
      else if (role === 'company') nav('/company');
      else if (role === 'admin') nav('/admin');
      else nav('/');
    } catch(e) {
      console.error("❌ Login error:", e);
      if (e.code === "auth/wrong-password") {
        setError("Incorrect password.");
      } else if (e.code === "auth/user-not-found") {
        setError("No account found with this email.");
      } else {
        setError(e.message);
      }
    }
  };

  const onForgotPassword = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    if (!email) {
      setError('Enter your email above, then click "Forgot password?"');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email, {
        url: `${window.location.origin}/reset-password`,
        handleCodeInApp: false,
      });
      // Redirect to reset password page with success message
      nav('/reset-password?email=' + encodeURIComponent(email) + '&sent=true');
    } catch (e) {
      console.error('❌ Password reset error:', e);
      if (e.code === 'auth/user-not-found') {
        setError('No account found with this email.');
      } else if (e.code === 'auth/invalid-email') {
        setError('Invalid email address.');
      } else {
        setError(e.message || 'Failed to send reset email. Please try again.');
      }
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h1>Welcome Back</h1>
          <p>Sign in to continue to your account</p>
        </div>

        <div className="auth-form-container">
          {error && <div className="notice">{String(error)}</div>}
          {info && !error && <div className="notice success">{String(info)}</div>}
          
          <form onSubmit={onSubmit} className="auth-form">
            <div className="form-group">
              <label htmlFor="email">Email Address</label>
              <div className="input-container">
                <svg className="input-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
                <input 
                  id="email"
                  type="email" 
                  name="email"
                  autoComplete="email"
                  value={email} 
                  onChange={e=>setEmail(e.target.value)} 
                  placeholder="Enter your email"
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <div className="input-container">
                <svg className="input-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <circle cx="12" cy="16" r="1"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                <input 
                  id="password"
                  type="password" 
                  name="password"
                  autoComplete="current-password"
                  value={password} 
                  onChange={e=>setPassword(e.target.value)} 
                  placeholder="Enter your password"
                  required
                />
              </div>
            </div>

            <div className="form-actions">
              <button type="submit" className="btn-primary btn-large">
                Sign In
              </button>
              <button type="button" className="btn-text" onClick={onForgotPassword}>
                Forgot your password?
              </button>
            </div>

            {/* Attempts counter removed as requested */}
          </form>

          <div className="auth-divider">
            <span>or</span>
          </div>

          <div className="auth-footer">
            <p>Don't have an account? <a href="/register">Sign up</a></p>
          </div>
        </div>
      </div>

      <div className="auth-illustration">
        <div className="illustration-content">
          <h2>Welcome to Lesotho Career Platform</h2>
          <p>Connect with opportunities, build your future, and join thousands of students, institutions, and companies in Lesotho.</p>
          <div className="feature-points">
            <div className="feature-point">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              <span>Verified opportunities</span>
            </div>
            <div className="feature-point">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2L2 7L12 12L22 7L12 2Z"/>
                <path d="M2 17L12 22L22 17"/>
              </svg>
              <span>Trusted by institutions</span>
            </div>
            <div className="feature-point">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M16 21V19C16 17.9391 15.5786 16.9217 14.8284 16.1716C14.0783 15.4214 13.0609 15 12 15H6C4.93913 15 3.92172 14.5786 3.17157 13.8284C2.42143 13.0783 2 12.0609 2 11V5C2 3.93913 2.42143 2.92172 3.17157 2.17157C3.92172 1.42143 4.93913 1 6 1H12C13.0609 1 14.0783 1.42143 14.8284 2.17157C15.5786 2.92172 16 3.93913 16 5"/>
                <path d="M22 11L16 5L22 11Z"/>
              </svg>
              <span>Career guidance</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
