import express from 'express';
import admin from 'firebase-admin';
import { db } from '../index.js';
import { verifyFirebaseToken } from '../middleware/auth.js';

const router = express.Router();

/**
 * Register or update profile after Firebase Auth signup
 */
router.post('/register-profile', verifyFirebaseToken, async (req, res) => {
  try {
    const { role, profile, emailVerified = false, verificationSentAt = null } = req.body;
    if (!role) {
      return res.status(400).json({ error: 'Role is required' });
    }
    const rawName = (profile?.name || '').trim();
    if (!rawName) {
      return res.status(400).json({ error: 'Full name is required' });
    }
    // Normalize to single spaces and enforce letters-only with role-based word limits
    const maxWords = role === 'student' ? 2 : 5;
    const words = rawName.split(/\s+/).filter(Boolean).slice(0, maxWords);
    const normalizedName = words.join(' ');
    const nameValid = new RegExp(`^[A-Za-z]+(?: [A-Za-z]+){0,${maxWords-1}}$`).test(normalizedName);
    if (!nameValid) {
      return res.status(400).json({ error: 'Full name must contain letters only and up to ' + maxWords + ' words' });
    }

    const userData = {
      uid: req.user.uid,
      email: req.user.email,
      role,
      name: normalizedName,
      lastName: (profile?.lastName || '').trim() || null,
      emailVerified,
      verificationSentAt: verificationSentAt ? new Date(verificationSentAt) : null,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await db.collection('users').doc(req.user.uid).set(userData, { merge: true });

    res.status(201).json({ message: 'Profile registered successfully' });
  } catch (e) {
    console.error('❌ Error in /register-profile:', e);
    res.status(500).json({ error: 'Failed to register profile' });
  }
});

router.get('/me', verifyFirebaseToken, async (req, res) => {
  try {
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    const userData = userDoc.data();

    // Load results separately
    const resultsDoc = await db.collection('results').doc(req.user.uid).get();
    const resultsData = resultsDoc.exists ? resultsDoc.data() : { results: [], resultsPoints: 0 };

    const merged = {
      uid: req.user.uid,
      email: req.user.email,
      role: userData.role || null,
      name: userData.name || null,
      ...userData,
      results: resultsData.results || [],
      resultsPoints: resultsData.resultsPoints || 0,
    };

    console.log('🔎 Returning user from /me:', merged);

    res.json({ user: merged });
  } catch (e) {
    console.error('❌ Error in /me:', e);
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

export default router;
