import express from 'express';
import { db } from '../index.js';
import { verifyFirebaseToken, requireRole } from '../middleware/auth.js';
import { autoApplyAndNotify } from '../services/matching.js';

const router = express.Router();

/**
 * POST /api/jobs
 * Create a new job (company or admin only)
 */
router.post('/', verifyFirebaseToken, requireRole('company', 'admin'), async (req, res) => {
  try {
    const ref = db.collection('jobs').doc();
    const jobData = {
      ...req.body,
      status: 'open',
      createdAt: new Date(),
      companyId: req.user.uid, // ✅ ensure job belongs to logged-in company
    };

    await ref.set(jobData);

    // Run auto-matching service
    await autoApplyAndNotify(ref.id);

    res.json({ id: ref.id, ...jobData });
  } catch (e) {
    console.error('❌ Error posting job:', e);
    res.status(500).json({ error: 'Failed to post job' });
  }
});

/**
 * GET /api/jobs
 * Public: fetch all jobs (optionally filter by status)
 */
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    let q = db.collection('jobs');
    if (status) q = q.where('status', '==', status);

    const snap = await q.orderBy('createdAt', 'desc').get();
    const jobs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.json({ jobs });
  } catch (e) {
    console.error('❌ Error fetching jobs:', e);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

/**
 * GET /api/jobs/my
 * Company-only: fetch jobs created by this company
 */
router.get('/my', verifyFirebaseToken, requireRole('company'), async (req, res) => {
  try {
    const snap = await db
      .collection('jobs')
      .where('companyId', '==', req.user.uid)
      .orderBy('createdAt', 'desc')
      .get();

    const jobs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.json({ jobs });
  } catch (e) {
    console.error('❌ Error fetching company jobs:', e);
    res.status(500).json({ error: 'Failed to fetch company jobs' });
  }
});

/**
 * PUT /api/jobs/:id
 * Company-only: update a job (must belong to logged-in company)
 */
router.put('/:id', verifyFirebaseToken, requireRole('company'), async (req, res) => {
  try {
    const jobId = req.params.id;
    const ref = db.collection('jobs').doc(jobId);
    const doc = await ref.get();

    if (!doc.exists) return res.status(404).json({ error: 'Job not found' });
    if (doc.data().companyId !== req.user.uid)
      return res.status(403).json({ error: 'Not your job' });

    await ref.update({
      ...req.body,
      updatedAt: new Date(),
    });

    res.json({ ok: true });
  } catch (e) {
    console.error('❌ Error updating job:', e);
    res.status(500).json({ error: 'Failed to update job' });
  }
});

/**
 * DELETE /api/jobs/:id
 * Company-only: delete a job (must belong to logged-in company)
 */
router.delete('/:id', verifyFirebaseToken, requireRole('company'), async (req, res) => {
  try {
    const jobId = req.params.id;
    const ref = db.collection('jobs').doc(jobId);
    const doc = await ref.get();

    if (!doc.exists) return res.status(404).json({ error: 'Job not found' });
    if (doc.data().companyId !== req.user.uid)
      return res.status(403).json({ error: 'Not your job' });

    await ref.delete();
    res.json({ ok: true });
  } catch (e) {
    console.error('❌ Error deleting job:', e);
    res.status(500).json({ error: 'Failed to delete job' });
  }
});

export default router;
