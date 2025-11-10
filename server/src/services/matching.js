import { db } from '../index.js';

// Grade ranking system
const gradeRank = { A: 6, B: 5, C: 4, D: 3, E: 2, F: 1 };

/**
 * Determine if a student qualifies for a course.
 * course.requirements: { minPoints: number, subjects: [{subject, grade}] }
 * student.results: { points: number, subjects: [{subject, grade}] }
 */
export function qualifiesForCourse(student, course) {
  if (!student || !course) return false;

  const points = student?.resultsPoints || student?.results?.points || 0;
  if (points < (course?.requirements?.minPoints || 0)) return false;

  const studentSubjects = student?.results?.subjects || []; // [{subject, grade}]
  const neededSubjects = course?.requirements?.subjects || []; // [{subject, grade}]

  for (let req of neededSubjects) {
    const studentSubject = studentSubjects.find(
      s => s.subject?.toLowerCase() === req.subject?.toLowerCase()
    );
    if (!studentSubject) return false;

    const studentGradeVal = gradeRank[studentSubject.grade?.toUpperCase()] || 0;
    const requiredGradeVal = gradeRank[req.grade?.toUpperCase()] || 0;

    // student must have equal or better grade
    if (studentGradeVal < requiredGradeVal) return false;
  }

  return true;
}

/**
 * Determine if a student matches a job.
 * job.requirements: { points, certificates:string[], experienceYears:number }
 */
export function matchesJob(student, job) {
  if (!student || !job) return false;

  const points = student?.resultsPoints || student?.results?.points || 0;
  const certs = new Set(student?.certificates || []);
  const exp = student?.experienceYears || 0;
  const req = job?.requirements || {};

  if (points < (req.points || 0)) return false;
  if ((req.experienceYears || 0) > exp) return false;
  if ((req.certificates || []).some(c => !certs.has(c))) return false;

  return true;
}

/**
 * Auto-apply matched graduates to a job and notify them
 */
export async function autoApplyAndNotify(jobId) {
  const jobDoc = await db.collection('jobs').doc(jobId).get();
  if (!jobDoc.exists) return;
  const job = jobDoc.data();

  const studentsSnap = await db.collection('users')
    .where('role', '==', 'student')
    .where('status', '==', 'graduate')
    .get();

  const batch = db.batch();
  for (const s of studentsSnap.docs) {
    const st = s.data();
    if (matchesJob(st, job)) {
      const appRef = db.collection('applications').doc();
      batch.set(appRef, {
        createdAt: new Date(),
        type: 'job',
        jobId,
        companyId: job.companyId,
        studentId: s.id,
        status: 'ready-for-interview'
      });

      const nRef = db.collection('notifications').doc();
      batch.set(nRef, {
        toUserId: s.id,
        type: 'job-match',
        message: `You were auto-applied to ${job.title}`,
        meta: { jobId },
        read: false,
        createdAt: new Date()
      });
    }
  }

  await batch.commit();
}
