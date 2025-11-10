import express from 'express';
import { db } from '../index.js';
import { verifyFirebaseToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

/**
 * POST /api/courses
 * Institution or admin creates a new course
 */
router.post('/', verifyFirebaseToken, requireRole('institution', 'admin'), async (req, res) => {
  try {
    const ref = db.collection('courses').doc();
    const courseData = {
      ...req.body,
      institutionId: req.user.uid, // ✅ enforce institution ownership
      createdAt: new Date(),
      waitlist: [],
    };
    await ref.set(courseData);
    res.json({ id: ref.id, ...courseData });
  } catch (e) {
    console.error('❌ Error creating course:', e);
    res.status(500).json({ error: 'Failed to create course' });
  }
});

/**
 * GET /api/courses
 * Public: fetch all courses (optionally filter by institutionId)
 */
router.get('/', async (req, res) => {
  try {
    const { institutionId } = req.query;
    let q = db.collection('courses');
    if (institutionId) q = q.where('institutionId', '==', institutionId);

    const snap = await q.orderBy('createdAt', 'desc').get();
    const courses = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.json({ courses });
  } catch (e) {
    console.error('❌ Error fetching courses:', e);
    res.status(500).json({ error: 'Failed to fetch courses' });
  }
});

/**
 * GET /api/courses/my
 * Institution: fetch only the courses created by this institution
 */
router.get('/my', verifyFirebaseToken, requireRole('institution'), async (req, res) => {
  try {
    const snap = await db
      .collection('courses')
      .where('institutionId', '==', req.user.uid)
      .orderBy('createdAt', 'desc')
      .get();

    const courses = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.json({ courses });
  } catch (e) {
    console.error('❌ Error fetching institution courses:', e);
    res.status(500).json({ error: 'Failed to fetch institution courses' });
  }
});

/**
 * PUT /api/courses/:id
 * Institution-only: update a course (must belong to the institution)
 */
router.put('/:id', verifyFirebaseToken, requireRole('institution'), async (req, res) => {
  try {
    const courseId = req.params.id;
    const ref = db.collection('courses').doc(courseId);
    const doc = await ref.get();

    if (!doc.exists) return res.status(404).json({ error: 'Course not found' });
    if (doc.data().institutionId !== req.user.uid)
      return res.status(403).json({ error: 'Not your course' });

    await ref.update({
      ...req.body,
      updatedAt: new Date(),
    });

    res.json({ ok: true });
  } catch (e) {
    console.error('❌ Error updating course:', e);
    res.status(500).json({ error: 'Failed to update course' });
  }
});

/**
 * DELETE /api/courses/:id
 * Institution-only: delete a course (must belong to the institution)
 */
router.delete('/:id', verifyFirebaseToken, requireRole('institution'), async (req, res) => {
  try {
    const courseId = req.params.id;
    const ref = db.collection('courses').doc(courseId);
    const doc = await ref.get();

    if (!doc.exists) return res.status(404).json({ error: 'Course not found' });
    if (doc.data().institutionId !== req.user.uid)
      return res.status(403).json({ error: 'Not your course' });

    await ref.delete();
    res.json({ ok: true });
  } catch (e) {
    console.error('❌ Error deleting course:', e);
    res.status(500).json({ error: 'Failed to delete course' });
  }
});

export default router;
