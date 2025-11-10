import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../../firebase';
import { sendEmailVerification } from 'firebase/auth';

export default function VerifyEmail() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [emailSent, setEmailSent] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const checkVerification = async () => {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        setLoading(false);
        return;
      }
      
      setUser(currentUser);
      
      // Check if email is already verified
      if (currentUser.emailVerified) {
        navigate('/');
        return;
      }
      
      setLoading(false);
      
      // Set up interval to check verification status
      const interval = setInterval(async () => {
        await currentUser.reload();
        if (currentUser.emailVerified) {
          clearInterval(interval);
          navigate('/');
        }
      }, 3000); // Check every 3 seconds
      
      return () => clearInterval(interval);
    };
    
    checkVerification();
  }, [navigate]);

  useEffect(() => {
    let timer;
    if (countdown > 0) {
      timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [countdown]);

  const handleResendEmail = async () => {
    if (!user || countdown > 0) return;
    
    try {
      setEmailSent(true);
      setCountdown(60); // 60 second cooldown
      
      await sendEmailVerification(user, {
        url: `${window.location.origin}/verify-email`,
        handleCodeInApp: true
      });
      
      setTimeout(() => setEmailSent(false), 3000);
    } catch (error) {
      console.error('Error sending verification email:', error);
      setCountdown(0);
      setEmailSent(false);
    }
  };

  if (loading) {
    return (
      <div className="container grid" style={{ maxWidth: 480 }}>
        <div className="card">
          <div className="loading-container">
            <div className="spinner-wrapper">
              <div className="spinner spinner-small">
                <div className="spinner-ring"></div>
              </div>
              <p>Loading verification status...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container grid" style={{ maxWidth: 480 }}>
        <div className="card">
          <h2>Session Expired</h2>
          <div className="notice notice-warning">
            <p>Your session has expired. Please log in again to verify your email.</p>
          </div>
          <button onClick={() => navigate('/login')}>
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container grid" style={{ maxWidth: 480 }}>
      <div className="card">
        <h2>📧 Verify Your Email</h2>
        <div className="notice success">
          <strong>Check your inbox!</strong>
          <p style={{margin: '8px 0 0 0'}}>
            We've sent a verification link to <strong>{user.email}</strong>.
            Please click the link in the email to verify your address.
          </p>
          <p style={{margin: '8px 0 0 0', fontSize: '14px'}}>
            Waiting for verification... This page will automatically update when you verify your email.
          </p>
        </div>
        
        <div style={{textAlign: 'center', margin: '20px 0'}}>
          <div className="spinner-wrapper">
            <div className="spinner spinner-small">
              <div className="spinner-ring"></div>
            </div>
            <p style={{color: '#9aa4bf', marginTop: '10px'}}>
              Checking verification status...
            </p>
          </div>
        </div>

        <div style={{textAlign: 'center'}}>
          <button 
            onClick={handleResendEmail}
            disabled={countdown > 0}
            style={{marginRight: '10px'}}
          >
            {countdown > 0 ? `Resend in ${countdown}s` : 'Resend Email'}
          </button>
          <button 
            onClick={() => navigate('/login')}
            className="btn-text"
          >
            Back to Login
          </button>
        </div>
        
        {emailSent && (
          <div style={{marginTop: '15px'}}>
            <div className="notice success">
              Verification email sent! Check your inbox.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}