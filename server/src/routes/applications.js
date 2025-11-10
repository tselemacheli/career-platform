import express from 'express';
import { db } from '../index.js';
import { verifyFirebaseToken, requireRole } from '../middleware/auth.js';
import { canApplyToCourse, ensureQualification, ensureSingleAdmissionPerInstitution } from '../utils/validators.js';

const router = express.Router();

// ----------------- Student Results ------------------

// Save subject + grade
router.post('/add-result', verifyFirebaseToken, requireRole('student'), async (req, res) => {
  try {
    const { subject, grade } = req.body;
    if (!subject || !grade) return res.status(400).json({ error: "Subject and grade are required" });

    const ref = db.collection('users').doc(req.user.uid);
    const doc = await ref.get();
    let data = doc.data() || {};
    let results = data.results || [];

    // Prevent duplicate subjects
    results = results.filter(r => r.subject.toLowerCase() !== subject.toLowerCase());
    results.push({ subject, grade });

    await ref.set({ ...data, results }, { merge: true });

    res.json({ ok: true, results });
  } catch (e) {
    console.error("❌ Error adding result:", e);
    res.status(500).json({ error: "Failed to add result" });
  }
});

// Fetch results
router.get('/my-results', verifyFirebaseToken, requireRole('student'), async (req, res) => {
  try {
    const doc = await db.collection('users').doc(req.user.uid).get();
    const data = doc.data() || {};
    res.json({ results: data.results || [] });
  } catch (e) {
    console.error("❌ Error fetching results:", e);
    res.status(500).json({ error: "Failed to load results" });
  }
});

// ----------------- Applications ---------------------

// Student applies to a course (max 2/institution and must qualify)
router.post('/course', verifyFirebaseToken, requireRole('student'), async (req,res)=>{
  const { courseId, institutionId } = req.body;
  const studentId = req.user.uid;

  if (!await canApplyToCourse(studentId, institutionId)) {
    return res.status(400).json({ error: 'Max 2 applications per institution reached' });
  }
  if (!await ensureQualification(studentId, courseId)) {
    return res.status(400).json({ error: 'You do not qualify for this course' });
  }

  const ref = db.collection('applications').doc();
  await ref.set({
    type: 'course',
    studentId,
    institutionId,
    courseId,
    status: 'pending',
    createdAt: new Date()
  });

  await db.collection('notifications').add({
    toUserId: studentId,
    type: 'application-submitted',
    message: 'Application submitted successfully',
    meta: { courseId },
    read: false,
    createdAt: new Date()
  });

  res.json({ id: ref.id });
});

// Institution updates application status; handle admissions and waitlist
router.post('/admit', verifyFirebaseToken, requireRole('institution','admin'), async (req,res)=>{
  const { applicationId, status } = req.body; // admitted|rejected|waitlisted
  const appRef = db.collection('applications').doc(applicationId);
  const appDoc = await appRef.get();
  if (!appDoc.exists) return res.status(404).json({error:'Application not found'});
  const app = appDoc.data();

  if (status === 'admitted'){
    const ok = await ensureSingleAdmissionPerInstitution(app.studentId, app.institutionId);
    if (!ok) return res.status(400).json({ error:'Student already admitted to another program in this institution' });
    // create admission doc
    await db.collection('admissions').add({
      studentId: app.studentId,
      institutionId: app.institutionId,
      courseId: app.courseId,
      status: 'admitted',
      createdAt: new Date()
    });
  }
  await appRef.set({ status }, {merge:true});
  await db.collection('notifications').add({
    toUserId: app.studentId,
    type: 'admission-update',
    message: `Your application status changed to ${status}`,
    meta: { applicationId },
    read: false,
    createdAt: new Date()
  });
  res.json({ ok:true });
});

// Student selects one institution; withdraw others and promote waitlist
router.post('/select-offer', verifyFirebaseToken, requireRole('student'), async (req,res)=>{
  const { institutionId, courseId } = req.body;
  const studentId = req.user.uid;

  const batch = db.batch();
  // Mark chosen admission as accepted
  const chosenSnap = await db.collection('admissions')
    .where('studentId','==',studentId)
    .where('institutionId','==',institutionId)
    .where('courseId','==',courseId)
    .where('status','==','admitted').get();
  for (const d of chosenSnap.docs){
    batch.update(d.ref, { status:'accepted', acceptedAt: new Date() });
  }
  // Withdraw other admissions and promote waitlist
  const otherSnap = await db.collection('admissions')
    .where('studentId','==',studentId)
    .where('status','in',['admitted','waitlisted']).get();
  for (const d of otherSnap.docs){
    const a = d.data();
    if (a.institutionId !== institutionId || a.courseId !== courseId){
      batch.update(d.ref, { status:'withdrawn' });
      // promote waitlist by converting first waitlisted application to admitted
      const waitSnap = await db.collection('applications')
        .where('courseId','==',a.courseId)
        .where('status','==','waitlisted').limit(1).get();
      if (!waitSnap.empty){
        const first = waitSnap.docs[0];
        batch.update(first.ref, { status:'admitted' });
        const nRef = db.collection('notifications').doc();
        batch.set(nRef, {
          toUserId: first.data().studentId,
          type: 'admission-update',
          message: 'You have been promoted from waitlist to admitted',
          meta: { courseId: a.courseId },
          read: false,
          createdAt: new Date()
        });
      }
    }
  }
  await batch.commit();
  res.json({ ok:true });
});

export default router;
