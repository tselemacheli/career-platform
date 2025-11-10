
import express from 'express';
import admin from 'firebase-admin';
import nodemailer from 'nodemailer';
import { db } from '../index.js';
import { verifyFirebaseToken, requireRole } from '../middleware/auth.js';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: Boolean(process.env.SMTP_SECURE === 'true'),
  auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
});

function generatePassword(length = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';
  let pwd = '';
  for (let i = 0; i < length; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
  return pwd;
}

const router = express.Router();

router.get('/stats', verifyFirebaseToken, requireRole('admin'), async (_req,res)=>{
  const [u,i,c,a,j] = await Promise.all([
    db.collection('users').get(),
    db.collection('institutions').get(),
    db.collection('courses').get(),
    db.collection('applications').get(),
    db.collection('jobs').get(),
  ]);
  res.json({
    users: u.size,
    institutions: i.size,
    courses: c.size,
    applications: a.size,
    jobs: j.size
  });
});

// Create Institution user (Firebase Auth + Firestore) and email password
router.post('/create-institution', verifyFirebaseToken, requireRole('admin'), async (req, res) => {
  try {
    const { email, name, password } = req.body || {};
    if (!email || !name) return res.status(400).json({ error: 'Email and name are required' });

    const pwd = (password || '').trim().length >= 6 ? (password || '').trim() : generatePassword();
    const userRecord = await admin.auth().createUser({ email, password: pwd, emailVerified: false, displayName: name });
    await admin.auth().setCustomUserClaims(userRecord.uid, { role: 'institution' });

    await db.collection('users').doc(userRecord.uid).set({
      email,
      name: name || null,
      role: 'institution',
      status: 'active',
      createdAt: new Date()
    }, { merge: true });

    // Email sending disabled by configuration request

    res.json({ uid: userRecord.uid });
  } catch (e) {
    console.error('❌ create-institution error:', e);
    const code = e?.code || '';
    if (code === 'auth/email-already-exists') return res.status(409).json({ error: 'Email already exists' });
    if (code === 'auth/invalid-password') return res.status(400).json({ error: 'Invalid password' });
    if (code === 'auth/invalid-email') return res.status(400).json({ error: 'Invalid email' });
    return res.status(500).json({ error: 'Failed to create institution' });
  }
});

// Create Company user (Firebase Auth + Firestore) and email password
router.post('/create-company', verifyFirebaseToken, requireRole('admin'), async (req, res) => {
  try {
    const { email, name, password } = req.body || {};
    if (!email || !name) return res.status(400).json({ error: 'Email and name are required' });

    const pwd = (password || '').trim().length >= 6 ? (password || '').trim() : generatePassword();
    const userRecord = await admin.auth().createUser({ email, password: pwd, emailVerified: false, displayName: name });
    await admin.auth().setCustomUserClaims(userRecord.uid, { role: 'company' });

    await db.collection('users').doc(userRecord.uid).set({
      email,
      name: name || null,
      role: 'company',
      status: 'approved',
      createdAt: new Date()
    }, { merge: true });

    // Email sending disabled by configuration request

    res.json({ uid: userRecord.uid });
  } catch (e) {
    console.error('❌ create-company error:', e);
    const code = e?.code || '';
    if (code === 'auth/email-already-exists') return res.status(409).json({ error: 'Email already exists' });
    if (code === 'auth/invalid-password') return res.status(400).json({ error: 'Invalid password' });
    if (code === 'auth/invalid-email') return res.status(400).json({ error: 'Invalid email' });
    return res.status(500).json({ error: 'Failed to create company' });
  }
});

// Admin creates a job for a specific company
router.post('/create-job', verifyFirebaseToken, requireRole('admin'), async (req, res) => {
  try {
    const { companyId, title, requirements } = req.body || {};
    if (!companyId || !title) return res.status(400).json({ error: 'Company ID and title are required' });

    const jobRef = db.collection('jobs').doc();
    await jobRef.set({
      title,
      requirements: requirements || { points: 0, certificates: [], experienceYears: 0 },
      status: 'open',
      companyId,
      createdAt: new Date()
    });

    // Also write under company subcollection for UI consistency
    const subRef = db.collection('users').doc(companyId).collection('jobs').doc(jobRef.id);
    await subRef.set({
      title,
      requirements: requirements || { points: 0, certificates: [], experienceYears: 0 },
      status: 'open',
      createdAt: new Date()
    });

    res.json({ id: jobRef.id });
  } catch (e) {
    console.error('❌ create-job error:', e);
    res.status(500).json({ error: 'Failed to create job' });
  }
});

// Admin creates a course for a specific institution
router.post('/create-course', verifyFirebaseToken, requireRole('admin'), async (req, res) => {
  try {
    const { institutionId, name, requirements } = req.body || {};
    if (!institutionId || !name) return res.status(400).json({ error: 'Institution ID and course name are required' });

    const courseRef = db.collection('courses').doc();
    await courseRef.set({
      name,
      requirements: requirements || { minPoints: 0, subjects: [] },
      institutionId,
      capacity: 50,
      createdAt: new Date()
    });

    // Also write under institution subcollection for UI consistency
    const subRef = db.collection('users').doc(institutionId).collection('courses').doc(courseRef.id);
    await subRef.set({
      name,
      requirements: requirements || { minPoints: 0, subjects: [] },
      capacity: 50,
      createdAt: new Date()
    });

    res.json({ id: courseRef.id });
  } catch (e) {
    console.error('❌ create-course error:', e);
    res.status(500).json({ error: 'Failed to create course' });
  }
});

// Admin creates a student for a specific institution and sends password via email
router.post('/create-student', verifyFirebaseToken, requireRole('admin'), async (req, res) => {
  try {
    const { email, name, institutionId, password } = req.body || {};
    if (!email || !name) return res.status(400).json({ error: 'Email and name are required' });

    const pwd = (password || '').trim().length >= 6 ? (password || '').trim() : generatePassword();
    const userRecord = await admin.auth().createUser({ email, password: pwd, emailVerified: false, displayName: name });
    await admin.auth().setCustomUserClaims(userRecord.uid, { role: 'student' });

    await db.collection('users').doc(userRecord.uid).set({
      email,
      name,
      role: 'student',
      status: 'active',
      institutionId: institutionId || null,
      createdAt: new Date()
    }, { merge: true });

    // Email sending disabled by configuration request

    res.json({ uid: userRecord.uid });
  } catch (e) {
    console.error('❌ create-student error:', e);
    const code = e?.code || '';
    if (code === 'auth/email-already-exists') return res.status(409).json({ error: 'Email already exists' });
    if (code === 'auth/invalid-password') return res.status(400).json({ error: 'Invalid password' });
    if (code === 'auth/invalid-email') return res.status(400).json({ error: 'Invalid email' });
    return res.status(500).json({ error: 'Failed to create student' });
  }
});

export default router;
