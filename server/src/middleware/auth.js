
import admin from 'firebase-admin';

export async function verifyFirebaseToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
    if (!token) return res.status(401).json({error:'Missing token'});
    const decoded = await admin.auth().verifyIdToken(token, true);
    req.user = decoded; // contains uid, email, role (if custom claims set)
    next();
  } catch (e) {
    console.error(e);
    res.status(401).json({error:'Invalid token'});
  }
}

export function requireRole(...roles){
  return (req, res, next)=>{
    const role = req.user?.role || req.user?.claims?.role || req.user?.role;
    if (!roles.includes(role)) return res.status(403).json({error:'Forbidden'});
    next();
  }
}
