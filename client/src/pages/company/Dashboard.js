import React, { useEffect, useState } from 'react';
import { auth, db } from '../../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  onSnapshot,
  getDocs,
  query,
  where,
  serverTimestamp
} from 'firebase/firestore';
import { registerUnsub, showToast } from "../../App"; // ✅ added for global cleanup + toast

export default function CompanyDashboard() {
  const [title, setTitle] = useState('');
  const [requirements, setRequirements] = useState({
    points: 0,
    certificates: [],
    experienceYears: 0,
  });
  const [jobs, setJobs] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [newCert, setNewCert] = useState('');
  const [applications, setApplications] = useState([]);
  const [userId, setUserId] = useState(null);
  const [expandedJobs, setExpandedJobs] = useState({});
  const [companyProfile, setCompanyProfile] = useState({ name: '' });

  // 🔑 AUTH + JOBS + APPLICATIONS (REALTIME)
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      if (!u) {
        setUserId(null);
        setJobs([]);
        setApplications([]);
        return;
      }

      setUserId(u.uid);

      // Load company profile
      (async () => {
        try {
          const me = await getDoc(doc(db, 'users', u.uid));
          if (me.exists()) {
            const data = me.data();
            const fullName = [data.name, data.lastName].filter(Boolean).join(' ').trim();
            setCompanyProfile({
              name: fullName || data.displayName || data.email || 'Company'
            });
          }
        } catch (_) {}
      })();

      const jobsRef = collection(db, "users", u.uid, "jobs");
      const unsubJobs = onSnapshot(jobsRef, (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setJobs(list);
      });
      registerUnsub(unsubJobs); // ✅ added

      const appsRef = collection(db, "users", u.uid, "applications");
      const unsubApps = onSnapshot(appsRef, (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setApplications(list);
      });
      registerUnsub(unsubApps); // ✅ added

      return () => {
        unsubJobs();
        unsubApps();
      };
    });

    return () => unsubAuth();
  }, []);

  // 🧩 Save job (add or update) and run matching
  const saveJob = async (e) => {
    e.preventDefault();
    if (!userId) return;

    const body = {
      title,
      requirements: {
        points: Number(requirements.points || 0),
        certificates: requirements.certificates,
        experienceYears: Number(requirements.experienceYears || 0),
      },
      status: 'open',
      createdAt: new Date()
    };

    try {
      let jobRef;
      if (editingId) {
        jobRef = doc(db, "users", userId, "jobs", editingId);
        await setDoc(jobRef, body, { merge: true });
        await matchStudentsForJob(editingId, body);
        showToast('Job updated and matching re-run.', 'success');
      } else {
        jobRef = doc(collection(db, "users", userId, "jobs"));
        await setDoc(jobRef, body);
        const createdId = jobRef.id;
        await matchStudentsForJob(createdId, body);
        showToast('Job posted and matching triggered.', 'success');
      }

      setTitle('');
      setRequirements({ points: 0, certificates: [], experienceYears: 0 });
      setEditingId(null);
    } catch (e) {
      console.error('❌ Job save failed:', e);
      showToast('Failed to save job.', 'danger');
    }
  };

  // ✏️ Edit Job
  const editJob = (job) => {
    setEditingId(job.id);
    setTitle(job.title);
    setRequirements({
      points: job.requirements?.points || 0,
      certificates: job.requirements?.certificates || [],
      experienceYears: job.requirements?.experienceYears || 0,
    });
  };

  // 🗑️ Delete Job
  const deleteJob = async (id) => {
    if (!window.confirm('Are you sure you want to delete this job?')) return;
    try {
      const jobRef = doc(db, "users", userId, "jobs", id);
      await deleteDoc(jobRef);

      const appCol = collection(db, "users", userId, "applications");
      const appQ = query(appCol, where('jobId', '==', id));
      const appSnap = await getDocs(appQ);
      for (const a of appSnap.docs) {
        await deleteDoc(doc(db, "users", userId, "applications", a.id));
      }

      setApplications((v) => v.filter((a) => a.jobId !== id));
    } catch (e) {
      console.error('❌ Failed to delete job:', e);
      showToast('Delete failed', 'danger');
    }
  };

  // ➕ Add Certificate
  const addCertificate = () => {
    if (!newCert.trim()) return;
    const cert = newCert.trim();
    setRequirements((v) => ({
      ...v,
      certificates: [
        ...v.certificates.filter((c) => c.toLowerCase() !== cert.toLowerCase()),
        cert,
      ],
    }));
    setNewCert('');
  };

  // ❌ Remove Certificate
  const removeCertificate = (cert) => {
    setRequirements((v) => ({
      ...v,
      certificates: v.certificates.filter((c) => c !== cert),
    }));
  };

  // ✅ Check if Student Qualified
  const isStudentQualified = (studentData, studentCerts, req) => {
    const sPoints = Number(studentData.resultsPoints || 0);
    if (sPoints < (req.points || 0)) return false;

    if (req.certificates && req.certificates.length > 0) {
      const lowerStudentCerts = studentCerts.map((c) => c.toLowerCase());
      const ok = req.certificates.every((c) =>
        lowerStudentCerts.includes(c.toLowerCase())
      );
      if (!ok) return false;
    }

    return true;
  };

  // 🔍 Match Students for Job
  const matchStudentsForJob = async (jobId, jobData) => {
    if (!userId) return;
    try {
      const usersCol = collection(db, 'users');
      const studentsQ = query(usersCol, where('role', '==', 'student'), where('status','==','graduate'));
      const studentsSnap = await getDocs(studentsQ);

      const companyAppCol = collection(db, "users", userId, "applications");

      for (const sDoc of studentsSnap.docs) {
        const sData = sDoc.data();
        const studentId = sDoc.id;

        const certsSnap = await getDocs(collection(db, "users", studentId, "certificates"));
        const studentCerts = certsSnap.docs.map((d) => (d.data().name || '').trim());

        if (!isStudentQualified(sData, studentCerts, jobData.requirements || {})) continue;

        const existingQ = query(
          companyAppCol,
          where('jobId', '==', jobId),
          where('studentId', '==', studentId)
        );
        const existingSnap = await getDocs(existingQ);
        if (!existingSnap.empty) continue;

        const appRef = doc(companyAppCol);
        await setDoc(appRef, {
          jobId,
          jobTitle: jobData.title || '',
          studentId,
          student: {
            name: sData.name || sData.displayName || '',
            resultsPoints: sData.resultsPoints || 0,
            certificates: studentCerts,
            experienceYears: sData.experienceYears || 0,
          },
          status: 'ready-for-interview',
          createdAt: serverTimestamp(),
        });

        // Notify company of new application
        const notifRef = doc(collection(db, "users", userId, "notifications"));
        await setDoc(notifRef, {
          type: "New Application",
          message: `${sData.name || sData.displayName || 'Student'} matched to "${jobData.title || ''}"`,
          timestamp: serverTimestamp(),
          status: "info",
        });
      }

      console.log(`✅ Matching complete for job "${jobData.title}"`);
    } catch (err) {
      console.error('❌ matchStudentsForJob failed:', err);
    }
  };

  const getApplicantsForJob = (jobId) =>
    applications.filter((a) => a.jobId === jobId);

  const toggleApplicants = (jobId) =>
    setExpandedJobs((v) => ({ ...v, [jobId]: !v[jobId] }));

  return (
    <div className="container" style={{ padding: 16 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 8, background: '#141d36', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7aa2ff', fontWeight: 700 }}>
            {String(companyProfile.name || 'C').slice(0,1).toUpperCase()}
          </div>
          <div>
            <h2 style={{ margin: 0 }}>{companyProfile.name || 'Company Dashboard'}</h2>
            <small style={{ color: '#9aa4bf' }}>Post jobs and manage qualified applicants</small>
          </div>
        </div>
      </header>
      <div
        className="grid"
        style={{
          gap: '1rem',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          alignItems: 'stretch',
        }}
      >
      {/* 💼 Job Form */}
      <div className="card" style={cardStyle}>
        <h3>{editingId ? 'Edit Job' : 'Post Job'}</h3>
        <form className="grid" onSubmit={saveJob}>
          <label>
            Job Title
            <input
              placeholder="Job Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </label>

          <label>
            Minimum Points
            <input
              type="number"
              value={requirements.points}
              onChange={(e) =>
                setRequirements((v) => ({ ...v, points: Number(e.target.value) }))
              }
            />
          </label>

          <label>
            Required Certificates
            <div className="grid" style={{ gap: '0.5rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  placeholder="Add Certificate"
                  value={newCert}
                  onChange={(e) => setNewCert(e.target.value)}
                />
                <button type="button" onClick={addCertificate}>
                  Add
                </button>
              </div>
              <ul>
                {requirements.certificates.map((c, i) => (
                  <li key={i}>
                    {c}{' '}
                    <button type="button" onClick={() => removeCertificate(c)} style={removeBtn}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </label>

          <label>
            Experience (Years)
            <input
              type="number"
              value={requirements.experienceYears}
              onChange={(e) =>
                setRequirements((v) => ({
                  ...v,
                  experienceYears: Number(e.target.value),
                }))}/>
          </label>

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit">{editingId ? 'Update Job' : 'Publish Job'}</button>
            {editingId && (
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setTitle('');
                  setRequirements({ points: 0, certificates: [], experienceYears: 0 });
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      {/* 👥 Jobs & Applicants */}
      <div className="card" style={cardStyle}>
        <h3>My Jobs & Applicants</h3>
        {jobs.length === 0 ? (
          <p>No jobs posted yet.</p>
        ) : (
          <ul className="list-separated">
            {jobs.map((j) => (
              <li key={j.id}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span className="badge">{j.status || 'open'}</span>
                    <strong style={{ fontSize: '1.05rem' }}>{j.title}</strong>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span className="badge-info" style={{ padding: '0.25rem 0.5rem' }}>
                      {getApplicantsForJob(j.id).length} applicants
                    </span>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'nowrap' }}>
                      <button onClick={() => editJob(j)}>Edit</button>
                      <button onClick={() => deleteJob(j.id)} className="btn-danger">Delete</button>
                    </div>
                  </div>
                </div>

                <div className="card-section" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '0.92em' }}>
                  <div><strong>Min Points:</strong> {j.requirements?.points || 0}</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <strong>Certificates:</strong>
                    {(j.requirements?.certificates || []).length === 0 ? (
                      <span style={{ color: '#cbd5e8' }}>None</span>
                    ) : (
                      (j.requirements?.certificates || []).map((c, i) => (
                        <span key={i} className="badge-info" style={{ padding: '0.15rem 0.5rem' }}>{c}</span>
                      ))
                    )}
                  </div>
                  <div><strong>Experience:</strong> {j.requirements?.experienceYears || 0} yrs</div>
                </div>

                <div className="card-section">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <h4 style={{ marginBottom: 8 }}>Applicants</h4>
                    {getApplicantsForJob(j.id).length > 0 && (
                      <button type="button" className="btn-secondary btn-small" onClick={() => toggleApplicants(j.id)}>
                        {expandedJobs[j.id] ? 'Hide' : 'Show'}
                      </button>
                    )}
                  </div>
                  {getApplicantsForJob(j.id).length === 0 ? (
                    <p style={{ fontSize: '0.9em', color: '#cbd5e8' }}>No applicants yet.</p>
                  ) : expandedJobs[j.id] ? (
                    <ul className="list-separated">
                      {getApplicantsForJob(j.id).map((a) => (
                        <li key={a.id}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                            <div>
                              <strong>{a.student?.name || 'Unnamed Student'}</strong>
                            </div>
                            <div style={{ display: 'flex', gap: 12, fontSize: '0.9em', color: '#cbd5e8', flexWrap: 'wrap' }}>
                              <span>Pts: {a.student?.resultsPoints || 0}</span>
                              <span>Certs: {(a.student?.certificates || []).join(', ') || 'None'}</span>
                              <span>Exp: {a.student?.experienceYears || 0}y</span>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      </div>
    </div>
  );
}

// 💅 Styles
const cardStyle = {
  background: 'var(--card)',
  border: '1px solid #e5e7eb',
  padding: '1rem',
  borderRadius: '10px',
  color: 'white'
};

const removeBtn = {
  marginLeft: 5,
  background: '#0e162b',
  color: 'white',
  border: 'none',
  cursor: 'pointer',
  padding: '2px 6px'
};

const dangerBtn = {
  marginLeft: 5,
  background: 'red',
  color: 'white',
  border: 'none',
  padding: '6px 10px',
  cursor: 'pointer'
};
