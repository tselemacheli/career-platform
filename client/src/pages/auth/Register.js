import React, { useState } from 'react';
import { createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import { auth } from '../../firebase';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';

export default function Register() {
  const [name, setName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email,setEmail] = useState('');
  const [password,setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role,setRole] = useState('student');
  const [error,setError] = useState('');
  const [loading,setLoading] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const nav = useNavigate();

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    // Ensure passwords match before creating account
    if (password !== confirmPassword) {
      setLoading(false);
      setError('Passwords do not match.');
      return;
    }
    
    // Validate full name: letters only and role-based word limit
    const nameTrimmed = name.trim();
    const maxWords = role === 'student' ? 2 : 5;
    const regex = new RegExp(`^[A-Za-z]+(?: [A-Za-z]+){0,${maxWords-1}}$`);
    if (!regex.test(nameTrimmed)) {
      setLoading(false);
      setError(`Full name must contain letters only and up to ${maxWords} words.`);
      return;
    }
    
    try {
      // Create user account
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      // Send verification email
      await sendEmailVerification(user, {
        url: `${window.location.origin}/verify-email`,
        handleCodeInApp: true
      });
      
      // Save user profile with unverified status
      await api('/api/auth/register-profile','POST',{ 
        role, 
        profile: { 
          name,
          lastName,
          emailVerified: false,
          verificationSentAt: new Date().toISOString()
        } 
      });
      // Keep the user signed in so verification can auto-complete and redirect
      setVerificationSent(true);
      setLoading(false);
      // Guide the user to the verification status page
      nav('/verify-email');
      
    } catch(e) {
      console.error("❌ Registration error:", e);
      setLoading(false);
      if (e.code === "auth/email-already-in-use") {
        setError("Email already registered. Please log in.");
      } else if (e.code === "auth/weak-password") {
        setError("Password should be at least 6 characters.");
      } else if (e.code === "auth/too-many-requests") {
        setError("Too many attempts. Please try again later.");
      } else {
        setError(e.message);
      }
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        {verificationSent ? (
          <div className="auth-success">
            <div className="success-icon">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
            </div>
            <h2>Check Your Email</h2>
            <div className="notice success">
              <strong>Verification email sent!</strong>
              <p style={{margin: '8px 0 0 0'}}>
                We've sent a verification link to <strong>{email}</strong>. 
                Please check your inbox and click the link to verify your email address.
              </p>
              <p style={{margin: '8px 0 0 0', fontSize: '14px'}}>
                If you don't see the email, check your spam folder or try requesting a new verification link.
              </p>
            </div>
            <button 
              onClick={() => nav('/login')} 
              className="btn-primary btn-large"
            >
              Go to Login
            </button>
          </div>
        ) : (
          <>
            <div className="auth-header">
              <div className="auth-logo">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h1>Create Account</h1>
              <p>Join thousands of students, institutions, and companies</p>
            </div>

            <div className="auth-form-container">
              {error && <div className="notice">{String(error)}</div>}
              
              <form onSubmit={onSubmit} className="auth-form">
                <div className="form-group">
                  <label htmlFor="name">Full Name</label>
                  {role === 'student' ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div className="input-container">
                        <svg className="input-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                          <circle cx="12" cy="7" r="4"/>
                        </svg>
                        <input 
                          id="name"
                          name="name"
                          placeholder="Enter your full name"
                          value={name} 
                          onChange={e => {
                            const raw = e.target.value.replace(/[^A-Za-z\s]/g, '');
                            const maxWords = 2;
                            const endsSpace = /\s$/.test(raw);
                            const words = raw.trim().split(/\s+/).filter(Boolean).slice(0, maxWords);
                            let normalized = words.join(' ');
                            if (endsSpace && words.length < maxWords) normalized += ' ';
                            setName(normalized);
                          }} 
                          required 
                          disabled={loading}
                        />
                      </div>
                      <div className="input-container">
                        <svg className="input-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                          <circle cx="12" cy="7" r="4"/>
                        </svg>
                        <input 
                          id="lastName"
                          name="lastName"
                          placeholder="Enter your last name (optional)"
                          value={lastName} 
                          onChange={e => setLastName(e.target.value)} 
                          disabled={loading}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="input-container">
                      <svg className="input-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                        <circle cx="12" cy="7" r="4"/>
                      </svg>
                      <input 
                        id="name"
                        name="name"
                        placeholder="Enter your full name"
                        value={name} 
                        onChange={e => {
                          const raw = e.target.value.replace(/[^A-Za-z\s]/g, '');
                          const maxWords = 5;
                          const endsSpace = /\s$/.test(raw);
                          const words = raw.trim().split(/\s+/).filter(Boolean).slice(0, maxWords);
                          let normalized = words.join(' ');
                          if (endsSpace && words.length < maxWords) normalized += ' ';
                          setName(normalized);
                        }} 
                        required 
                        disabled={loading}
                      />
                    </div>
                  )}
                </div>

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
                      placeholder="Enter your email"
                      value={email} 
                      onChange={e=>setEmail(e.target.value)} 
                      required 
                      disabled={loading}
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
                      name="new-password"
                      autoComplete="new-password"
                      placeholder="Create a strong password"
                      value={password} 
                      onChange={e=>setPassword(e.target.value)} 
                      required 
                      disabled={loading}
                    />
                  </div>
                  <small className="password-hint">Must be at least 6 characters</small>
                </div>

                <div className="form-group">
                  <label htmlFor="confirmPassword">Confirm Password</label>
                  <div className="input-container">
                    <svg className="input-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                      <circle cx="12" cy="16" r="1"/>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                    <input 
                      id="confirmPassword"
                      type="password" 
                      name="confirm-password"
                      autoComplete="new-password"
                      placeholder="Re-enter your password"
                      value={confirmPassword} 
                      onChange={e=>setConfirmPassword(e.target.value)} 
                      required 
                      disabled={loading}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="role">Account Type</label>
                  <div className="role-selector">
                    <div className="role-option">
                      <input 
                        type="radio" 
                        id="student" 
                        name="role" 
                        value="student" 
                        checked={role === 'student'} 
                        onChange={e=>setRole(e.target.value)} 
                        disabled={loading}
                      />
                      <label htmlFor="student" className="role-label">
                        <div className="role-icon" aria-hidden="true">
                          {/* mortarboard icon */}
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 3L2 8l10 5 10-5-10-5Z"/>
                            <path d="M22 12v5"/>
                            <path d="M12 13v6"/>
                          </svg>
                        </div>
                        <div className="role-text">
                          <strong>Student</strong>
                          <span>Looking for opportunities</span>
                        </div>
                      </label>
                    </div>
                    
                    <div className="role-option">
                      <input 
                        type="radio" 
                        id="institution" 
                        name="role" 
                        value="institution" 
                        checked={role === 'institution'} 
                        onChange={e=>setRole(e.target.value)} 
                        disabled={loading}
                      />
                      <label htmlFor="institution" className="role-label">
                        <div className="role-icon" aria-hidden="true">
                          {/* building icon */}
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="4" y="6" width="16" height="12" rx="2"/>
                            <path d="M8 10h2M8 14h2M14 10h2M14 14h2"/>
                            <path d="M4 6l8-4 8 4"/>
                          </svg>
                        </div>
                        <div className="role-text">
                          <strong>Institution</strong>
                          <span>Educational organization</span>
                        </div>
                      </label>
                    </div>
                    
                    <div className="role-option">
                      <input 
                        type="radio" 
                        id="company" 
                        name="role" 
                        value="company" 
                        checked={role === 'company'} 
                        onChange={e=>setRole(e.target.value)} 
                        disabled={loading}
                      />
                      <label htmlFor="company" className="role-label">
                        <div className="role-icon" aria-hidden="true">
                          {/* briefcase icon */}
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M3 7h18v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/>
                            <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            <path d="M3 12h18"/>
                          </svg>
                        </div>
                        <div className="role-text">
                          <strong>Company</strong>
                          <span>Hiring talent</span>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>
                
                <div className="form-actions">
                  <button type="submit" className="btn-primary btn-large" disabled={loading}>
                    {loading ? (
                      <>
                        <div className="spinner-small"></div>
                        Creating Account...
                      </>
                    ) : (
                      'Create Account'
                    )}
                  </button>
                </div>
              </form>

              <div className="auth-divider">
                <span>or</span>
              </div>

              <div className="auth-footer">
                <p>Already have an account? <a href="/login">Sign in</a></p>
              </div>

              <div className="terms-notice">
                <small>
                  By creating an account, you agree to our Terms of Service and Privacy Policy
                </small>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="auth-illustration">
        <div className="illustration-content">
          <h2>Build Your Future</h2>
          <p>Join the leading career platform in Lesotho connecting students, institutions, and companies.</p>
          <div className="feature-points">
            <div className="feature-point">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2L2 7L12 12L22 7L12 2Z"/>
                <path d="M2 17L12 22L22 17"/>
              </svg>
              <span>Connect with opportunities</span>
            </div>
            <div className="feature-point">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M16 21V19C16 17.9391 15.5786 16.9217 14.8284 16.1716C14.0783 15.4214 13.0609 15 12 15H6C4.93913 15 3.92172 14.5786 3.17157 13.8284C2.42143 13.0783 2 12.0609 2 11V5C2 3.93913 2.42143 2.92172 3.17157 2.17157C3.92172 1.42143 4.93913 1 6 1H12C13.0609 1 14.0783 1.42143 14.8284 2.17157C15.5786 2.92172 16 3.93913 16 5"/>
                <path d="M22 11L16 5L22 11Z"/>
              </svg>
              <span>Verified institutions</span>
            </div>
            <div className="feature-point">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              <span>Secure & trusted</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
