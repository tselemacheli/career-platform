import express from 'express';
import { db } from '../index.js';
import { verifyFirebaseToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

/**
 * POST /api/results
 * Save or update logged-in student's results
 * Body can be:
 *   { results: [ {subject, grade}, ... ] }
 * OR
 *   { subject: "Math", grade: "A" }
 */
router.post('/', verifyFirebaseToken, async (req, res) => {
  try {
    let { results } = req.body;

    // ✅ Allow single subject/grade object
    if (!Array.isArray(results)) {
      if (req.body.subject && req.body.grade) {
        results = [{ subject: req.body.subject, grade: req.body.grade }];
      } else {
        return res.status(400).json({ error: 'Results are required' });
      }
    }

    const ref = db.collection('results').doc(req.user.uid);

    // Merge with existing results (append/update by subject)
    const existing = await ref.get();
    let updatedResults = results;

    if (existing.exists) {
      const current = existing.data().results || [];
      const subjectsMap = new Map();

      // Keep latest grade for each subject
      [...current, ...results].forEach(r => {
        if (r.subject && r.grade) {
          subjectsMap.set(r.subject.toLowerCase(), { subject: r.subject, grade: r.grade });
        }
      });

      updatedResults = Array.from(subjectsMap.values());
    }

    await ref.set(
      { results: updatedResults, updatedAt: new Date() },
      { merge: true }
    );

    res.json({ ok: true, results: updatedResults });
  } catch (e) {
    console.error("❌ Error saving results:", e);
    res.status(500).json({ error: 'Failed to save results' });
  }
});

/**
 * GET /api/results
 * Fetch only the logged-in student's results
 */
router.get('/', verifyFirebaseToken, async (req, res) => {
  try {
    const ref = db.collection('results').doc(req.user.uid);
    const doc = await ref.get();

    if (!doc.exists) {
      return res.json({ results: [] });
    }

    res.json({ results: doc.data().results || [] });
  } catch (e) {
    console.error("❌ Error fetching results:", e);
    res.status(500).json({ error: 'Failed to fetch results' });
  }
});

router.get('/student/:studentId', verifyFirebaseToken, requireRole('institution','admin'), async (req, res) => {
  try {
    const { studentId } = req.params;
    // Prefer results collection
    const resDoc = await db.collection('results').doc(studentId).get();
    let results = resDoc.exists ? (resDoc.data().results || []) : [];

    // Fallback to users.results if empty
    if (!results.length) {
      const userDoc = await db.collection('users').doc(studentId).get();
      if (userDoc.exists) {
        results = userDoc.data().results || [];
      }
    }

    res.json({ results });
  } catch (e) {
    console.error('❌ Error fetching student transcript:', e);
    res.status(500).json({ error: 'Failed to fetch transcript' });
  }
});

router.get('/student/:studentId/documents', verifyFirebaseToken, requireRole('institution','admin'), async (req, res) => {
  try {
    const { studentId } = req.params;
    const docsSnap = await db
      .collection('users')
      .doc(studentId)
      .collection('documents')
      .where('type', '==', 'transcript')
      .get();
    const documents = docsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ documents });
  } catch (e) {
    console.error('❌ Error fetching student documents:', e);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

export default router;
