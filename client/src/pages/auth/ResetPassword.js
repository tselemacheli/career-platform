import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { auth } from '../../firebase';
import { confirmPasswordReset } from 'firebase/auth';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [oobCode, setOobCode] = useState(null);
  const [email, setEmail] = useState('');
  const [emailSent, setEmailSent] = useState(false);

  useEffect(() => {
    // Check if redirected from login after sending email
    const sent = searchParams.get('sent');
    const emailParam = searchParams.get('email');
    if (sent === 'true' && emailParam) {
      setEmailSent(true);
      setEmail(emailParam);
      setInfo('Password reset email sent! Check your inbox and click the link in the email to reset your password.');
      return;
    }

    // Get the action code from URL query parameters (from email link)
    const code = searchParams.get('oobCode');
    if (!code) {
      setError('Invalid or missing reset link. Please request a new password reset from the login page.');
    } else {
      setOobCode(code);
    }
  }, [searchParams]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');

    if (!password || !confirmPassword) {
      setError('Please fill in both password fields.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (!oobCode) {
      setError('Invalid reset link.');
      return;
    }

    setLoading(true);
    try {
      await confirmPasswordReset(auth, oobCode, password);
      setInfo('Password reset successfully! Redirecting to login...');
      setTimeout(() => {
        navigate('/login');
      }, 2000);
    } catch (e) {
      console.error('❌ Password reset error:', e);
      if (e.code === 'auth/expired-action-code') {
        setError('This reset link has expired. Please request a new password reset.');
      } else if (e.code === 'auth/invalid-action-code') {
        setError('Invalid reset link. Please request a new password reset.');
      } else if (e.code === 'auth/weak-password') {
        setError('Password is too weak. Please choose a stronger password.');
      } else {
        setError(e.message || 'Failed to reset password. Please try again.');
      }
      setLoading(false);
    }
  };

  return (
    <div className="container grid" style={{ maxWidth: 480 }}>
      <div className="card">
        <h2>Reset Password</h2>
        {error && <div className="notice">{String(error)}</div>}
        {info && !error && <div className="notice success">{String(info)}</div>}
        
        {emailSent ? (
          <div>
            <p style={{ color: '#9aa4bf', marginBottom: 16 }}>
              We've sent a password reset link to <strong>{email}</strong>. Please check your inbox and click the link to continue.
            </p>
            <p style={{ color: '#9aa4bf', marginBottom: 16, fontSize: '0.9em' }}>
              If you don't see the email, check your spam folder or try requesting a new reset link.
            </p>
            <button type="button" onClick={() => navigate('/login')}>
              Back to Login
            </button>
          </div>
        ) : oobCode ? (
          <form onSubmit={onSubmit} className="grid">
            <input
              placeholder="New Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
            />
            <input
              placeholder="Confirm New Password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              disabled={loading}
            />
            <button type="submit" disabled={loading}>
              {loading ? 'Resetting...' : 'Reset Password'}
            </button>
            <button
              type="button"
              className="btn-text"
              onClick={() => navigate('/login')}
              disabled={loading}
            >
              Back to Login
            </button>
          </form>
        ) : (
          <div>
            <p style={{ color: '#9aa4bf', marginBottom: 16 }}>
              {error || 'Loading reset link...'}
            </p>
            <button type="button" onClick={() => navigate('/login')}>
              Back to Login
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

