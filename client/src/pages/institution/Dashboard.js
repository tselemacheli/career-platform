import React, { useEffect, useState } from 'react';
import { auth, db } from '../../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  getDocs,
  serverTimestamp
} from 'firebase/firestore';

export default function InstitutionDashboard() {
  const [courses, setCourses] = useState([]);
  const [faculties, setFaculties] = useState([]);
  const [applications, setApplications] = useState([]);
  const [userId, setUserId] = useState(null);
  const [statusCounts, setStatusCounts] = useState({});
  const [studentNames, setStudentNames] = useState({});
  const [institutionProfile, setInstitutionProfile] = useState({ name: '' });
  const [admissionsTab, setAdmissionsTab] = useState('admitted'); // 'admitted' | 'waiting' | 'accepted'
  const [admittedList, setAdmittedList] = useState([]);
  const [waitingList, setWaitingList] = useState([]);
  const [acceptedList, setAcceptedList] = useState([]);
  const [transcriptsDocs, setTranscriptsDocs] = useState({});
  const [showTranscriptsFor, setShowTranscriptsFor] = useState(null); // Track which student's transcripts are visible

  // Form states
  const [name, setName] = useState('');
  const [requirements, setRequirements] = useState({ minPoints: 0, subjects: [] });
  const [subjectInput, setSubjectInput] = useState('');
  const [gradeInput, setGradeInput] = useState('A');
  const [facultyName, setFacultyName] = useState('');

  // Edit course state
  const [editCourseId, setEditCourseId] = useState(null);
  const [editCourseName, setEditCourseName] = useState('');
  const [editMinPoints, setEditMinPoints] = useState(0);
  const [editSubjects, setEditSubjects] = useState([]);
  const [editSubjectInput, setEditSubjectInput] = useState('');
  const [editGradeInput, setEditGradeInput] = useState('A');

  // UI: manage navigation between faculty and course forms
  const [manageTab, setManageTab] = useState('course'); // 'course' | 'faculty'

  // 🔄 unsubscribers for real-time cleanup
  const unsubAppsListeners = React.useRef([]);
  const initialAppLoad = React.useRef({});

  // ------------------ AUTH + LOAD ------------------
  useEffect(() => {
    let unsubCourses = () => {};
    let unsubFac = () => {};

    const unsubAuth = onAuthStateChanged(auth, async (u) => {
      // Clean up any old listeners
      unsubCourses();
      unsubFac();
      unsubAppsListeners.current.forEach((fn) => fn());
      unsubAppsListeners.current = [];

      if (!u) {
        setUserId(null);
        setCourses([]);
        setFaculties([]);
        setApplications([]);
        setStatusCounts({});
        return;
      }

      setUserId(u.uid);

      // Load institution profile (name/displayName)
      try {
        const me = await getDoc(doc(db, 'users', u.uid));
        if (me.exists()) {
          const data = me.data();
          const fullName = [data.name, data.lastName].filter(Boolean).join(' ').trim();
          setInstitutionProfile({
            name: fullName || data.displayName || data.email || 'My Institution'
          });
        }
      } catch (_) {}

      // Load institution courses (real-time)
      const courseRef = collection(db, 'users', u.uid, 'courses');
      unsubCourses = onSnapshot(courseRef, (snap) => {
        setCourses(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      });

      // Load faculties (real-time)
      const facRef = collection(db, 'users', u.uid, 'faculties');
      unsubFac = onSnapshot(facRef, (snap) => {
        setFaculties(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      });

      // Load real-time student applications filtered by institution
      await setupRealTimeInstitutionApps(u.uid);
    });

    return () => {
      unsubAuth();
      unsubCourses();
      unsubFac();
      unsubAppsListeners.current.forEach((fn) => fn());
    };
  }, []);

  // ------------------ REAL-TIME APPLICATION LISTENERS ------------------
  const setupRealTimeInstitutionApps = async (institutionId) => {
    try {
      const usersSnap = await getDocs(collection(db, 'users'));
      const allApps = [];
      const studentNameCache = {};

      // Loop through all students and attach a listener on each applications subcollection
      usersSnap.forEach((userDoc) => {
        const studentId = userDoc.id;
        const appsRef = collection(db, 'users', studentId, 'applications');

        const unsub = onSnapshot(appsRef, async (snap) => {
          // Filter only this institution’s apps
          const newApps = snap.docs
            .map((d) => ({ id: d.id, studentId, ...d.data() }))
            .filter((a) => a.institutionId === institutionId);

          // Update student name cache if needed
          if (!studentNameCache[studentId]) {
            const sdata = userDoc.data();
            studentNameCache[studentId] =
              sdata.name || sdata.displayName || sdata.email || 'Unnamed Student';
          }

          // Merge or replace apps for this student
          setApplications((prev) => {
            const other = prev.filter((p) => p.studentId !== studentId);
            return [...other, ...newApps];
          });

          setStudentNames({ ...studentNameCache });

          // Skip initial snapshot to avoid backfilling notifications
          if (!initialAppLoad.current[studentId]) {
            initialAppLoad.current[studentId] = true;
            return;
          }

          // Notify institution on new applications only
          for (const change of snap.docChanges()) {
            if (change.type === 'added') {
              const a = change.doc.data();
              if (a.institutionId === institutionId) {
                const studentName = studentNameCache[studentId] || 'Student';
                const notifRef = doc(collection(db, 'users', institutionId, 'notifications'));
                await setDoc(notifRef, {
                  type: 'New Application',
                  message: `${studentName} applied for ${a.courseName || 'a course'}`,
                  timestamp: serverTimestamp(),
                  status: 'info',
                });
              }
            }
          }
        });

        unsubAppsListeners.current.push(unsub);
      });
    } catch (err) {
      console.error('Real-time institution applications setup failed:', err);
    }
  };

  // ------------------ COURSE CRUD ------------------
  const addCourse = async (e) => {
    e.preventDefault();
    if (!userId) return;
    const data = {
      name,
      requirements: {
        minPoints: Number(requirements.minPoints || 0),
        subjects: requirements.subjects
      },
      capacity: 50,
      createdAt: new Date()
    };
    const ref = doc(collection(db, 'users', userId, 'courses'));
    await setDoc(ref, data);
    setName('');
    setRequirements({ minPoints: 0, subjects: [] });
  };

  const deleteCourse = async (courseId) => {
    if (!window.confirm('Delete this course permanently?')) return;
    await deleteDoc(doc(db, 'users', userId, 'courses', courseId));
  };

  const startEditCourse = (course) => {
    setEditCourseId(course.id);
    setEditCourseName(course.name || '');
    setEditMinPoints(Number(course.requirements?.minPoints || 0));
    setEditSubjects(Array.isArray(course.requirements?.subjects) ? course.requirements.subjects : []);
    setEditSubjectInput('');
    setEditGradeInput('A');
  };

  const cancelEditCourse = () => {
    setEditCourseId(null);
    setEditCourseName('');
    setEditMinPoints(0);
    setEditSubjects([]);
    setEditSubjectInput('');
    setEditGradeInput('A');
  };

  const addEditSubjectRequirement = () => {
    if (!editSubjectInput) return;
    setEditSubjects((v) => ([...v, { subject: editSubjectInput, grade: editGradeInput }]));
    setEditSubjectInput('');
    setEditGradeInput('A');
  };

  const removeEditSubject = (i) => {
    setEditSubjects((v) => v.filter((_, idx) => idx !== i));
  };

  const saveCourseEdit = async () => {
    if (!userId || !editCourseId) return;
    try {
      await updateDoc(doc(db, 'users', userId, 'courses', editCourseId), {
        name: editCourseName,
        requirements: {
          minPoints: Number(editMinPoints || 0),
          subjects: editSubjects
        }
      });
      cancelEditCourse();
    } catch (e) {
      console.error('Failed to save course edits:', e);
      alert('Failed to save changes');
    }
  };

  const addSubjectRequirement = () => {
    if (!subjectInput) return;
    setRequirements((v) => ({
      ...v,
      subjects: [...v.subjects, { subject: subjectInput, grade: gradeInput }]
    }));
    setSubjectInput('');
    setGradeInput('A');
  };

  const removeSubject = (i) => {
    setRequirements((v) => ({
      ...v,
      subjects: v.subjects.filter((_, idx) => idx !== i)
    }));
  };

  // ------------------ FACULTIES ------------------
  const addFaculty = async (e) => {
    e.preventDefault();
    if (!facultyName.trim() || !userId) return;
    const ref = doc(collection(db, 'users', userId, 'faculties'));
    await setDoc(ref, { name: facultyName.trim(), createdAt: new Date() });
    setFacultyName('');
  };

  const deleteFaculty = async (fid) => {
    if (!window.confirm('Delete this faculty?')) return;
    await deleteDoc(doc(db, 'users', userId, 'faculties', fid));
  };

  // ------------------ APPLICATION MANAGEMENT ------------------
  const updateApplicationStatus = async (app, newStatus) => {
    try {
      await updateDoc(doc(db, 'users', app.studentId, 'applications', app.id), {
        status: newStatus
      });

      const notifRef = doc(collection(db, 'users', app.studentId, 'notifications'));
      await setDoc(notifRef, {
        title: 'Application Status Update',
        message: `Your application for "${app.courseName || 'a course'}" has been updated to "${newStatus.toUpperCase()}".`,
        status: newStatus,
        createdAt: new Date(),
        read: false
      });
    } catch (err) {
      console.error('Failed to update application or send notification:', err);
    }
  };

  // Fetch and show student transcripts for this institution
  const viewTranscriptDocs = async (studentId) => {
    // Toggle visibility: if already showing for this student, hide; otherwise show
    if (showTranscriptsFor === studentId) {
      setShowTranscriptsFor(null);
      return;
    }

    try {
      // Only fetch if not already loaded
      if (!transcriptsDocs[studentId]) {
        const docsRef = collection(db, 'users', studentId, 'documents');
        const snap = await getDocs(docsRef);
        const list = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(d => (d.type || '').toLowerCase() === 'transcript');
        setTranscriptsDocs(prev => ({ ...prev, [studentId]: list }));
      }
      setShowTranscriptsFor(studentId);
    } catch (err) {
      console.error('Failed to load transcripts:', err);
    }
  };

  // Graduate enrolled student (sets status to 'graduate')
  const graduateStudent = async (row) => {
    try {
      await updateDoc(doc(db, 'users', row.studentId), { status: 'graduate' });

      // Notify student
      const notifRef = doc(collection(db, 'users', row.studentId, 'notifications'));
      await setDoc(notifRef, {
        type: 'Graduation',
        message: `You have been graduated for ${row.courseName}.`,
        timestamp: serverTimestamp(),
        status: 'success',
      });

      // Notify institution
      const instNotifRef = doc(collection(db, 'users', userId, 'notifications'));
      await setDoc(instNotifRef, {
        type: 'Graduation',
        message: `${row.studentName} graduated for ${row.courseName}.`,
        timestamp: serverTimestamp(),
        status: 'success',
      });
    } catch (err) {
      console.error('Failed to graduate student:', err);
    }
  };

  // ------------------ COMPUTE STATUS COUNTS ------------------
  useEffect(() => {
    const counts = {};
    const admitted = [];
    const waiting = [];
    const accepted = [];
    const tmpTranscripts = {};
    applications.forEach((a) => {
      const cId = a.courseId || 'unknown';
      if (!counts[cId]) {
        counts[cId] = { waiting: 0, rejected: 0, pending: 0, admitted: 0 };
      }
      if (a.status && counts[cId][a.status] !== undefined) {
        counts[cId][a.status]++;
      }

      const studentName = studentNames[a.studentId] || a.studentName || 'Student';
      const row = {
        studentName,
        courseName: a.courseName || '',
        studentId: a.studentId,
        applicationId: a.id,
      };
      const s = (a.status || '').toLowerCase();
      if (s === 'admitted') admitted.push(row);
      if (s === 'waiting') waiting.push(row);
      if (s === 'accepted') accepted.push(row);
    });
    setStatusCounts(counts);
    setAdmittedList(admitted.sort((x, y) => x.studentName.localeCompare(y.studentName)));
    setWaitingList(waiting.sort((x, y) => x.studentName.localeCompare(y.studentName)));
    setAcceptedList(accepted.sort((x, y) => x.studentName.localeCompare(y.studentName)));
  }, [applications]);

  // ------------------ TRANSCRIPTS VIEW ------------------
  const [transcripts, setTranscripts] = useState({});
  const viewResults = async (studentId) => {
    try {
      const API = process.env.REACT_APP_API_BASE || 'http://localhost:4000';
      const token = await window.firebaseAuthToken?.();
      const res = await fetch(`${API}/api/results/student/${studentId}`, {
        headers: { 'Authorization': token ? `Bearer ${token}` : '' }
      });
      const data = await res.json();
      setTranscripts((prev) => ({ ...prev, [studentId]: data.results || [] }));
    } catch (e) {
      console.error('Failed to load transcript', e);
      alert('Failed to load transcript.');
    }
  };

  const downloadCsv = (rows, filename) => {
    const header = ['Student Name', 'Course Name', 'Student ID'];
    const lines = [header.join(',')].concat(
      rows.map(r => [r.studentName, r.courseName, r.studentId].map(v => `"${(v || '').replace(/"/g,'""')}"`).join(','))
    );
    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="container" style={{ padding: 16 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 8, background: '#141d36', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7aa2ff', fontWeight: 700 }}>
            {String(institutionProfile.name || 'I').slice(0,1).toUpperCase()}
          </div>
          <div>
            <h2 style={{ margin: 0 }}>{institutionProfile.name || 'Institution Dashboard'}</h2>
            <small style={{ color: '#9aa4bf' }}>Manage faculties, courses, and student admissions</small>
          </div>
        </div>
        <div />
      </header>

      <div
        className="grid"
        style={{
          display: 'grid',
          gap: 20,
          gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
          marginTop: 20
        }}
      >
        {/* Faculties & Courses (Tabbed) */}
        <div className="card" style={cardStyle}>
          <h3>Faculties & Courses</h3>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button
              className={manageTab === 'course' ? '' : 'btn-secondary'}
              onClick={() => setManageTab('course')}
            >
              Add Course
            </button>
            <button
              className={manageTab === 'faculty' ? '' : 'btn-secondary'}
              onClick={() => setManageTab('faculty')}
            >
              Add Faculty
            </button>
          </div>

          {manageTab === 'course' ? (
            <div>
              <h4 style={{ marginTop: 0 }}>Add Course</h4>
              <form onSubmit={addCourse}>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Course Name"
                  required
                />
                <input
                  type="number"
                  value={requirements.minPoints}
                  onChange={(e) =>
                    setRequirements((v) => ({ ...v, minPoints: e.target.value }))
                  }
                  placeholder="Minimum Points"
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    placeholder="Subject"
                    value={subjectInput}
                    onChange={(e) => setSubjectInput(e.target.value)}
                  />
                  <select
                    value={gradeInput}
                    onChange={(e) => setGradeInput(e.target.value)}
                  >
                    {['A', 'B', 'C', 'D', 'E', 'F'].map((g) => (
                      <option key={g}>{g}</option>
                    ))}
                  </select>
                  <button type="button" onClick={addSubjectRequirement}>
                    Add
                  </button>
                </div>
                <ul>
                  {requirements.subjects.map((s, i) => (
                    <li key={i}>
                      {s.subject} ≥ {s.grade}
                      <button
                        type="button"
                        onClick={() => removeSubject(i)}
                        className="btn-danger btn-small"
                        style={smallBtn}
                      >
                        ❌
                      </button>
                    </li>
                  ))}
                </ul>
                <button type="submit">Publish Course</button>
              </form>
            </div>
          ) : (
            <div>
              <h4 style={{ marginTop: 0 }}>Faculties</h4>
              <form onSubmit={addFaculty}>
                <input
                  value={facultyName}
                  onChange={(e) => setFacultyName(e.target.value)}
                  placeholder="Faculty Name"
                />
                <button type="submit">Add Faculty</button>
              </form>
              <ul>
                {faculties.map((f) => (
                  <li key={f.id}>
                    {f.name}
                    <button onClick={() => deleteFaculty(f.id)} className="btn-danger btn-small" style={smallBtn}>❌</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* My Courses */}
        <div className="card" style={cardStyle}>
          <h3>My Courses</h3>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {courses.map((c) => {
              const stats = statusCounts[c.id] || { waiting: 0, rejected: 0, pending: 0, admitted: 0 };
              return (
                <li
                  key={c.id}
                  style={{
                    marginBottom: 15,
                    paddingBottom: 10,
                    borderBottom: '1px solid #1f2a4b'
                  }}
                >
                  {editCourseId === c.id ? (
                    <div>
                      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 180px' }}>
                        <input
                          value={editCourseName}
                          onChange={(e) => setEditCourseName(e.target.value)}
                          placeholder="Course Name"
                        />
                        <input
                          type="number"
                          value={editMinPoints}
                          onChange={(e) => setEditMinPoints(e.target.value)}
                          placeholder="Min Points"
                        />
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <input
                          placeholder="Subject"
                          value={editSubjectInput}
                          onChange={(e) => setEditSubjectInput(e.target.value)}
                        />
                        <select value={editGradeInput} onChange={(e) => setEditGradeInput(e.target.value)}>
                          {['A','B','C','D','E','F'].map(g => <option key={g}>{g}</option>)}
                        </select>
                        <button type="button" onClick={addEditSubjectRequirement}>Add</button>
                      </div>
                      <ul style={{ marginTop: 8 }}>
                        {editSubjects.map((s, i) => (
                          <li key={i}>
                            {s.subject} ≥ {s.grade}
                            <button type="button" onClick={() => removeEditSubject(i)} style={smallBtn}>❌</button>
                          </li>
                        ))}
                      </ul>
                      <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'nowrap' }}>
                        <button type="button" onClick={saveCourseEdit}>Save</button>
                        <button type="button" className="btn-secondary" onClick={cancelEditCourse}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <strong>{c.name}</strong> — Min: {c.requirements?.minPoints} pts
                      <div style={{ marginTop: 8 }}>
                        <span>Pending: {stats.pending}</span> |{' '}
                        <span>Waiting: {stats.waiting}</span> |{' '}
                        <span>Admitted: {stats.admitted}</span> |{' '}
                        <span>Rejected: {stats.rejected}</span>
                      </div>
                      <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'nowrap' }}>
                        <button onClick={() => startEditCourse(c)}> Edit</button>
                        <button onClick={() => deleteCourse(c.id)} className="btn-danger"> Delete</button>
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        {/* Student Applications */}
        <div className="card" style={cardStyle}>
          <h3>Student Applications (Live)</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>#</th>
                  <th style={thStyle}>Student</th>
                  <th style={thStyle}>Course</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Action</th>
                </tr>
              </thead>
              <tbody>
                {applications.length > 0 ? (
                  applications.map((a, i) => (
                    <tr key={a.id} style={trStyle}>
                      <td style={tdStyle}>{i + 1}</td>
                      <td style={tdStyle}>{studentNames[a.studentId] || 'Loading...'}</td>
                      <td style={tdStyle}>{a.courseName || '—'}</td>
                      <td style={{ ...tdStyle, textTransform: 'capitalize' }}>
                        {a.status || 'pending'}
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <select
                            value={a.status}
                            onChange={(e) =>
                              updateApplicationStatus(a, e.target.value)
                            }
                            style={selectStyle}
                          >
                            <option value="pending">Pending</option>
                            <option value="waiting">Waiting</option>
                            <option value="admitted">Admitted</option>
                            <option value="rejected">Rejected</option>
                          </select>
                          <button 
                            type="button" 
                            className="btn-secondary btn-small" 
                            onClick={() => viewTranscriptDocs(a.studentId)}
                          >
                            {showTranscriptsFor === a.studentId ? 'Hide Transcripts' : 'View Transcripts'}
                          </button>
                          {showTranscriptsFor === a.studentId && transcriptsDocs[a.studentId] && (
                            <ul style={{ marginTop: 6, paddingLeft: 20, maxWidth: 300 }}>
                              {transcriptsDocs[a.studentId].length === 0 ? (
                                <li style={{ color:'#cbd5e8', fontSize: '0.9em' }}>No transcript documents</li>
                              ) : (
                                transcriptsDocs[a.studentId].map((d, idx) => (
                                  <li key={idx} style={{ marginBottom: 4, wordBreak: 'break-word' }}>
                                    {d.url ? (
                                      <a href={d.url} target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>
                                        {d.originalName || 'Transcript'}
                                      </a>
                                    ) : (
                                      <span>{d.originalName || 'Transcript'}</span>
                                    )}
                                    <div>
                                      <small style={{ color:'#9aa4bf', fontSize: '0.85em' }}>
                                        {(d.mimeType || '').replace('application/','')}{d.size && ` • ${(d.size/1024/1024).toFixed(2)} MB`}
                                      </small>
                                    </div>
                                  </li>
                                ))
                              )}
                            </ul>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td style={tdStyle} colSpan={5} align="center">
                      No applications for your institution yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Admission Lists */}
        <div className="card" style={cardStyle}>
          <h3 style={{ marginBottom: 8 }}>Admissions</h3>
          <div style={{ display:'flex', gap:8, marginBottom:12, flexWrap:'wrap' }}>
            <button
              className={admissionsTab === 'admitted' ? '' : 'btn-secondary'}
              onClick={() => setAdmissionsTab('admitted')}
            >
              Admitted ({admittedList.length})
            </button>
            <button
              className={admissionsTab === 'waiting' ? '' : 'btn-secondary'}
              onClick={() => setAdmissionsTab('waiting')}
            >
              Waiting ({waitingList.length})
            </button>
            <button
              className={admissionsTab === 'accepted' ? '' : 'btn-secondary'}
              onClick={() => setAdmissionsTab('accepted')}
            >
              Enrolled ({acceptedList.length})
            </button>
            <div style={{ marginLeft:'auto' }}>
              {admissionsTab === 'admitted' && (
                <button onClick={() => downloadCsv(admittedList, 'admitted.csv')} className="btn-secondary btn-small">Download CSV</button>
              )}
              {admissionsTab === 'waiting' && (
                <button onClick={() => downloadCsv(waitingList, 'waiting.csv')} className="btn-secondary btn-small">Download CSV</button>
              )}
              {admissionsTab === 'accepted' && (
                <button onClick={() => downloadCsv(acceptedList, 'enrolled.csv')} className="btn-secondary btn-small">Download CSV</button>
              )}
            </div>
          </div>

          {admissionsTab === 'admitted' && (
            <div>
              {admittedList.length === 0 ? (
                <p>No admitted students.</p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {admittedList.map((r) => (
                    <li key={r.applicationId} style={{ padding: '10px 12px', border: '1px solid #1f2a4b', borderRadius: 8, background:'var(--card)', marginBottom: 8 }}>
                      <div>
                        <strong>{r.studentName}</strong>
                        <div><small style={{ color:'#9aa4bf' }}>{r.courseName}</small></div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {admissionsTab === 'waiting' && (
            <div>
              {waitingList.length === 0 ? (
                <p>No waiting students.</p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {waitingList.map((r) => (
                    <li key={r.applicationId} style={{ padding: '10px 12px', border: '1px solid #1f2a4b', borderRadius: 8, background:'var(--card)', marginBottom: 8 }}>
                      <div>
                        <strong>{r.studentName}</strong>
                        <div><small style={{ color:'#9aa4bf' }}>{r.courseName}</small></div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {admissionsTab === 'accepted' && (
            <div>
              {acceptedList.length === 0 ? (
                <p>No enrolled students.</p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {acceptedList.map((r) => (
                    <li key={r.applicationId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', border: '1px solid #1f2a4b', borderRadius: 8, background:'var(--card)', marginBottom: 8 }}>
                      <div>
                        <strong>{r.studentName}</strong>
                        <div><small style={{ color:'#9aa4bf' }}>{r.courseName}</small></div>
                      </div>
                      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                        <button type="button" className="btn-success btn-small" onClick={() => graduateStudent(r)}>Graduate Student</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// 💅 Styles
const cardStyle = {
  background: 'var(--card)',
  padding: '1.5rem',
  borderRadius: '12px',
  color: 'white',
  boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
};

const smallBtn = {
  marginLeft: 8,
  background: 'transparent',
  border: 'none',
  color: '#c00',
  cursor: 'pointer'
};

const deleteBtnStyle = {
  background: '#c0392b',
  color: '#fff',
  border: 'none',
  padding: '6px 12px',
  borderRadius: '6px',
  cursor: 'pointer',
  fontWeight: 'bold',
  transition: 'all 0.2s ease'
};

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  color: 'var(--text)',
  fontSize: '0.95rem'
};

const thStyle = {
  textAlign: 'left',
  padding: '10px 14px',
  borderBottom: '1px solid var(--card-border)',
  background: 'var(--card)',
  color: 'var(--text)',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.03em'
};

const trStyle = {
  borderBottom: '1px solid var(--card-border)'
};

const tdStyle = {
  padding: '10px 14px',
  verticalAlign: 'middle',
  color: 'var(--text)'
};

const selectStyle = {
  background: '#1b2545',
  color: '#fff',
  border: '1px solid #2a3554',
  borderRadius: 6,
  padding: '4px 6px',
  fontSize: '0.9rem',
  cursor: 'pointer'
};
