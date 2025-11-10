import { db } from '../index.js';

// Grade ranking system (A best → F worst)
const gradeRank = { A: 6, B: 5, C: 4, D: 3, E: 2, F: 1 };

/** Enforce max 2 applications per institution */
export async function canApplyToCourse(studentId, institutionId) {
  const snap = await db.collection('applications')
    .where('studentId', '==', studentId)
    .where('institutionId', '==', institutionId)
    .where('type', '==', 'course')
    .get();
  return snap.size < 2;
}

/** Ensure student qualifies for a course */
export async function ensureQualification(studentId, courseId) {
  const [studentDoc, courseDoc] = await Promise.all([
    db.collection('users').doc(studentId).get(),
    db.collection('courses').doc(courseId).get()
  ]);

  if (!studentDoc.exists || !courseDoc.exists) return false;

  const student = studentDoc.data();
  const course = courseDoc.data();

  // Points check
  const studentPoints = student.resultsPoints || 0;
  if (studentPoints < (course.requirements?.minPoints || 0)) {
    return false;
  }

  // Subject + grade check
  const studentResults = student.results || [];   // [{ subject, grade }]
  const requiredSubjects = course.requirements?.subjects || []; // [{ subject, grade }]

  for (let req of requiredSubjects) {
    const studentSubject = studentResults.find(
      r => r.subject?.toLowerCase() === req.subject?.toLowerCase()
    );
    if (!studentSubject) return false;

    const studentGradeValue = gradeRank[studentSubject.grade?.toUpperCase()] || 0;
    const requiredGradeValue = gradeRank[req.grade?.toUpperCase()] || 0;

    if (studentGradeValue < requiredGradeValue) return false;
  }

  return true;
}

/** Ensure single admission per institution */
export async function ensureSingleAdmissionPerInstitution(studentId, institutionId) {
  const snap = await db.collection('admissions')
    .where('studentId', '==', studentId)
    .where('institutionId', '==', institutionId)
    .where('status', 'in', ['admitted', 'accepted'])
    .get();
  return snap.empty;
}
