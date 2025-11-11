import React, { useEffect, useState, useRef } from 'react';
import { Routes, Route, Link, Navigate, useNavigate, useLocation } from 'react-router-dom';
import AuthProvider, { useAuth } from './AuthContext';
import Landing from './pages/Landing';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import VerifyEmail from './pages/auth/VerifyEmail';
import ResetPassword from './pages/auth/ResetPassword';
import StudentDashboard from './pages/student/Dashboard';
import StudentResults from './pages/student/Results';
import InstitutionDashboard from './pages/institution/Dashboard';
import CompanyDashboard from './pages/company/Dashboard';
import AdminDashboard from './pages/admin/Dashboard';
import Footer from './components/Footer';
import Loading from './components/Loading';
import { getMe } from './api';
import { signOut } from 'firebase/auth';
import { auth, db } from './firebase';
import { collection, onSnapshot, deleteDoc, doc } from 'firebase/firestore';

/* ------------------------------------------------------------------
   🔧 GLOBAL FIRESTORE LISTENER MANAGEMENT
------------------------------------------------------------------ */
window._firestoreUnsubs = window._firestoreUnsubs || [];

export const registerUnsub = (fn) => {
  if (typeof fn === "function") window._firestoreUnsubs.push(fn);
};

export const clearAllListeners = () => {
  window._firestoreUnsubs.forEach((fn) => {
    try {
      fn();
    } catch {}
  });
  window._firestoreUnsubs = [];
  console.log("🧹 All Firestore listeners cleared");
};

// 🔔 Global toast dispatcher
export const showToast = (message, type = 'info') => {
  try {
    window.dispatchEvent(new CustomEvent('app-toast', { detail: { message, type } }));
  } catch {}
};

/* ------------------------------------------------------------------
   🔝 NAVBAR COMPONENT
------------------------------------------------------------------ */
function Nav() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const nav = useNavigate();
  const location = useLocation(); // Add this to track current location
  const [showSettings, setShowSettings] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [notif, setNotif] = useState([]);
  const [visibleNotifCount, setVisibleNotifCount] = useState(2);
  const notifPopoverRef = useRef(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!user) { setProfile(null); return; }
    (async () => {
      try {
        const me = await getMe();
        setProfile(me.user);
      } catch (e) {
        console.error("Failed to load profile", e);
      }
    })();
  }, [user]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Listen for global toast events
  useEffect(() => {
    const handler = (e) => {
      const { message, type } = e.detail || {};
      setToast({ message, type });
      // auto dismiss after 3s
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    };
    window.addEventListener('app-toast', handler);
    return () => window.removeEventListener('app-toast', handler);
  }, []);

  // Load notifications for logged-in user
  useEffect(() => {
    if (!user) {
      setNotif([]);
      return;
    }
    const notifRef = collection(db, 'users', user.uid, 'notifications');
    const unsub = onSnapshot(notifRef, (snap) => {
      const list = snap.docs
        .map((d) => ({
          id: d.id,
          ...d.data(),
          timestamp: d.data().timestamp?.toDate(),
        }))
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      setNotif(list);
    });
    // Clean up this listener when user changes (not through global cleanup)
    return () => unsub();
  }, [user]);

  useEffect(() => {
    setVisibleNotifCount(Math.min(2, notif.length || 0));
  }, [notif]);

  // Close notifications panel on outside click or Escape key
  useEffect(() => {
    if (!showNotifPanel) return;
    const handleClick = (e) => {
      if (!notifPopoverRef.current) return;
      if (!notifPopoverRef.current.contains(e.target)) {
        setShowNotifPanel(false);
      }
    };
    const handleKey = (e) => {
      if (e.key === 'Escape') setShowNotifPanel(false);
    };
    document.addEventListener('mousedown', handleClick);
    window.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      window.removeEventListener('keydown', handleKey);
    };
  }, [showNotifPanel]);

  const timeAgo = (date) => {
    if (!date) return "";
    const diff = Math.floor((new Date() - date) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  const deleteNotification = async (notifId) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'notifications', notifId));
    } catch (err) {
      console.error('Failed to delete notification:', err.message);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordError('');
    
    if (!user || !user.email) {
      setPasswordError('Please sign in to change your password');
      return;
    }
    
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      return;
    }

    try {
      const { EmailAuthProvider, reauthenticateWithCredential, updatePassword } = await import('firebase/auth');
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);
      
      setShowChangePassword(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      await handleLogout();
    } catch (e) {
      console.error('Password change error:', e);
      const code = e?.code || '';
      if (code === 'auth/invalid-email') {
        setPasswordError('Invalid email');
      } else if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setPasswordError('Invalid password');
      } else {
        setPasswordError('Failed to change password');
      }
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth); // Sign out first
      setProfile(null);
      clearAllListeners(); // Then clean up listeners (most will already be cleaned by React)
      nav("/"); // redirect to home after logout
      console.log("✅ User signed out safely");
    } catch (e) {
      console.error("❌ Logout error:", e);
    }
  };

  // Save user's last location when it changes
  useEffect(() => {
    if (user && location.pathname !== '/login' && location.pathname !== '/register') {
      try {
        localStorage.setItem('lastLocation', JSON.stringify({
          pathname: location.pathname,
          search: location.search,
          hash: location.hash,
          timestamp: Date.now()
        }));
      } catch (e) {
        console.warn('Could not save last location', e);
      }
    }
  }, [location, user]);

  return (
    <div className="nav container">
      {toast && (
        <div style={{ position: 'fixed', top: 16, right: 16, background: 'var(--card)', border: '1px solid var(--card-border)', color: 'var(--text)', padding: '12px 16px', borderRadius: 8, boxShadow: 'var(--shadow-md)', zIndex: 1000, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className={toast.type === 'success' ? 'badge-success' : toast.type === 'warning' ? 'badge-warning' : toast.type === 'danger' ? 'badge-danger' : 'badge-info'} style={{ padding: '2px 6px' }}>{toast.type || 'info'}</span>
          <span>{toast.message}</span>
          <button className="btn-ghost btn-small" onClick={() => setToast(null)} style={{ marginLeft: 8 }}>Dismiss</button>
        </div>
      )}
      <Link to="/" style={{ fontWeight: 700 }}>Lesotho Career Platform</Link>
      <div style={{ display: 'flex', gap: 10, alignItems: "center" }}>
        {profile ? (
          <>
            <div style={{ position: 'relative' }} ref={notifPopoverRef}>
              <button className="btn-icon" onClick={() => setShowSettings(v => !v)} title="Settings">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
                {notif.length > 0 && (
                  <span style={{ position: "absolute", top: -4, right: -4, background: "#ef4444", color: "#fff", borderRadius: 9999, fontSize: 10, padding: "0 6px", lineHeight: "16px", height: 18, minWidth: 18, textAlign: "center", boxShadow: "0 0 0 2px var(--bg)" }}>
                    {notif.length > 99 ? '99+' : (notif.length > 9 ? '9+' : notif.length)}
                  </span>
                )}
              </button>
              {showSettings && (
                <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', background: 'var(--card)', border: '1px solid #2a3554', borderRadius: 8, padding: 12, minWidth: 220, boxShadow: 'var(--shadow-md)', zIndex: 10 }}>
                  <button onClick={() => { setShowNotifPanel(true); setShowSettings(false); }} className="btn-secondary btn-small" style={{ width: '100%', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>Notifications</span>
                    {notif.length > 0 && (
                      <span style={{ background: "#ef4444", color: "#fff", borderRadius: 9999, fontSize: 10, padding: "2px 6px", minWidth: 18, textAlign: "center" }}>
                        {notif.length}
                      </span>
                    )}
                  </button>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span style={{ color: '#a8b3cf' }}>Theme</span>
                    <button className="btn-secondary btn-small" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
                      {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                    </button>
                  </div>
                  <button onClick={() => { setShowChangePassword(true); setShowSettings(false); }} className="btn-secondary btn-small" style={{ width: '100%', marginBottom: 8 }}>Change Password</button>
                  <button onClick={handleLogout} className="btn-danger btn-small" style={{ width: '100%' }}>Logout</button>
                </div>
              )}
              {showNotifPanel && (
                <div
                  className="card"
                  role="dialog"
                  aria-label="Notifications"
                  style={{ position: "absolute", top: 48, right: 0, zIndex: 20, width: 360, maxWidth: "90vw", maxHeight: 420, overflow: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.12)" }}
                >
                  <h3>Notifications</h3>
                  {notif.length === 0 ? (
                    <div className="notifications-empty">
                      <p>No notifications yet.</p>
                      <small>You'll see updates here when they arrive.</small>
                    </div>
                  ) : (
                    <>
                      <div className="notifications-header">
                        <span className="notifications-count">{notif.length} {notif.length === 1 ? 'notification' : 'notifications'}</span>
                        {notif.length > 0 && (
                          <button
                            className="btn-secondary btn-small"
                            onClick={async () => {
                              if (window.confirm('Clear all notifications?')) {
                                await Promise.all(notif.map(n => deleteNotification(n.id)));
                              }
                            }}
                          >
                            Clear All
                          </button>
                        )}
                      </div>
                      <div className="notifications-list">
                        {notif.slice(0, visibleNotifCount).map((n) => {
                          const notifType = (n.type || n.status || "Info").toLowerCase();
                          const getBadgeClass = () => {
                            if (notifType.includes('success') || notifType.includes('admitted') || notifType.includes('accepted')) return 'badge-success';
                            if (notifType.includes('warning') || notifType.includes('waiting')) return 'badge-warning';
                            if (notifType.includes('error') || notifType.includes('rejected') || notifType.includes('danger')) return 'badge-danger';
                            if (notifType.includes('application') || notifType.includes('job')) return 'badge-info';
                            return 'badge';
                          };
                          return (
                            <div key={n.id} className="notification-item">
                              <div className="notification-content">
                                <div className="notification-body">
                                  <div className="notification-header-row">
                                    <span className={getBadgeClass()}>{n.type || n.status || "Info"}</span>
                                    <small className="notification-time">
                                      {n.timestamp ? timeAgo(n.timestamp) : ""}
                                    </small>
                                  </div>
                                  <p className="notification-message">{n.message}</p>
                                </div>
                              </div>
                              <button
                                className="notification-delete"
                                onClick={() => deleteNotification(n.id)}
                                aria-label="Delete notification"
                                title="Delete"
                              >
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                                </svg>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                      {(visibleNotifCount < notif.length || visibleNotifCount > 2) && (
                        <div className="mt-sm flex gap-sm">
                          {visibleNotifCount < notif.length && (
                            <button
                              className="btn-secondary btn-small"
                              onClick={() => setVisibleNotifCount((v) => Math.min(v + 2, notif.length))}
                            >
                              See more notifications
                            </button>
                          )}
                          {visibleNotifCount > 2 && (
                            <button
                              className="btn-secondary btn-small"
                              onClick={() => setVisibleNotifCount(2)}
                            >
                              Hide notifications
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
            {showChangePassword && (
              <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowChangePassword(false)}>
                <div style={{ background: 'var(--card)', padding: 24, borderRadius: 12, minWidth: 400, maxWidth: 500 }} onClick={(e) => e.stopPropagation()}>
                  <h3 style={{ marginBottom: 16, color: 'var(--text)' }}>Change Password</h3>
                  {passwordError && <div style={{ background: '#fee', color: '#c00', padding: 8, borderRadius: 6, marginBottom: 12 }}>{passwordError}</div>}
                  <form onSubmit={handleChangePassword}>
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ display: 'block', marginBottom: 4, color: 'var(--text)' }}>Current Password</label>
                      <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #ccc' }} />
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ display: 'block', marginBottom: 4, color: 'var(--text)' }}>New Password</label>
                      <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #ccc' }} />
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ display: 'block', marginBottom: 4, color: 'var(--text)' }}>Confirm New Password</label>
                      <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #ccc' }} />
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="submit" className="btn-primary">Update Password</button>
                      <button type="button" className="btn-secondary" onClick={() => { setShowChangePassword(false); setPasswordError(''); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); }}>Cancel</button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <Link to="/login">Login</Link>
            <Link to="/register">Register</Link>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   🧱 ROLE GUARD
------------------------------------------------------------------ */
function Guard({ role, children }) {
  const { user, loading } = useAuth();
  const [profile, setProfile] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    async function loadProfile() {
      if (!user) { setProfile(null); setChecking(false); return; }
      try {
        const me = await getMe();
        console.log("🔎 Guard loaded user:", me.user);
        setProfile(me.user);
      } catch (e) {
        console.error("❌ Guard failed to load profile", e);
      } finally {
        setChecking(false);
      }
    }
    loadProfile();
  }, [user]);

  if (loading || checking) return <div className="container"><Loading fullScreen={false} /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (role && profile?.role !== role) return <Navigate to="/" replace />;
  return children;
}

/* ------------------------------------------------------------------
   🔁 AUTO-REDIRECT TO DASHBOARD
------------------------------------------------------------------ */
function AutoRedirect() {
  const { user, loading } = useAuth();
  const [profile, setProfile] = useState(null);
  const nav = useNavigate();
  
  useEffect(() => {
    if (loading || !user) return;
    
    (async () => {
      try {
        // Try to restore last location first
        const lastLocationStr = localStorage.getItem('lastLocation');
        if (lastLocationStr) {
          try {
            const lastLocation = JSON.parse(lastLocationStr);
            // Only restore if it was within the last 24 hours
            if (Date.now() - lastLocation.timestamp < 24 * 60 * 60 * 1000) {
              // Don't redirect back to auth pages
              if (!lastLocation.pathname.startsWith('/auth')) {
                nav(lastLocation.pathname + lastLocation.search + lastLocation.hash);
                return;
              }
            }
          } catch (e) {
            console.warn('Could not parse last location', e);
          }
        }
        
        // Fallback to role-based redirect
        const me = await getMe();
        setProfile(me.user);
        const role = me.user?.role;
        if (role === "student") nav("/student");
        else if (role === "institution") nav("/institution");
        else if (role === "company") nav("/company");
        else if (role === "admin") nav("/admin");
      } catch (e) {
        console.error("❌ AutoRedirect failed", e);
      }
    })();
  }, [user, loading, nav]);

  return <Landing />;
}

/* ------------------------------------------------------------------
   🚀 MAIN APP
------------------------------------------------------------------ */
export default function App() {
  return (
    <AuthProvider>
      <Nav />
      <Routes>
        <Route path="/" element={<AutoRedirect />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        <Route path="/student" element={<Guard role="student"><StudentDashboard /></Guard>} />
        <Route path="/student/results" element={<Guard role="student"><StudentResults /></Guard>} />
        <Route path="/institution" element={<Guard role="institution"><InstitutionDashboard /></Guard>} />
        <Route path="/company" element={<Guard role="company"><CompanyDashboard /></Guard>} />
        <Route path="/admin" element={<Guard role="admin"><AdminDashboard /></Guard>} />
      </Routes>
      <Footer />
    </AuthProvider>
  );
}
