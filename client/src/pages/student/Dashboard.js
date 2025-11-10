import React, { useEffect, useState, useCallback } from "react";
import { auth, db, storage } from "../../firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  collectionGroup,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { registerUnsub, showToast } from "../../App"; // ✅ listener cleanup + toast

export default function StudentDashboard() {
  const [results, setResults] = useState([]);
  const [resultsPoints, setResultsPoints] = useState(0);
  const [newSubject, setNewSubject] = useState("");
  const [newGrade, setNewGrade] = useState("A");
  const [userId, setUserId] = useState(null);
  const [eligibleCourses, setEligibleCourses] = useState([]);
  const [applications, setApplications] = useState([]);
  const [matchedJobs, setMatchedJobs] = useState([]);
  const [userStatus, setUserStatus] = useState('');
  const [studentProfile, setStudentProfile] = useState({ name: '' });
  const [showResults, setShowResults] = useState(false);
  const [experienceYears, setExperienceYears] = useState(0);
  const [isUpdatingExperience, setIsUpdatingExperience] = useState(false);
  const [resultsView, setResultsView] = useState('results'); // 'results' or 'transcripts'
  const [uploadingTranscript, setUploadingTranscript] = useState(false);
  const [transcripts, setTranscripts] = useState([]);

  const gradeToPoints = (g) => ({ A: 5, B: 4, C: 3, D: 2, E: 1, F: 0 }[g] || 0);

  const timeAgo = (date) => {
    if (!date) return "";
    const diff = Math.floor((new Date() - date) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  // 🔐 AUTH + REALTIME LISTENERS
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setUserId(null);
        setResults([]);
        setEligibleCourses([]);
        setApplications([]);
        setMatchedJobs([]);
        setResultsPoints(0);
        return;
      }

      setUserId(u.uid);

      // Load student profile
      try {
        const me = await getDoc(doc(db, 'users', u.uid));
        if (me.exists()) {
          const data = me.data();
          const fullName = [data.name, data.lastName].filter(Boolean).join(' ').trim();
          setStudentProfile({
            name: fullName || data.displayName || data.email || 'Student'
          });
        }
      } catch (_) {}

      const userRef = doc(db, "users", u.uid);
      const resRef = collection(db, "users", u.uid, "results");
      const appRef = collection(db, "users", u.uid, "applications");
      const docsRef = collection(db, "users", u.uid, "documents");

      // 🎓 Real-time results
      const unsubResults = onSnapshot(resRef, async (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setResults(list);

        const total = list.reduce((sum, r) => sum + gradeToPoints(r.grade), 0);
        setResultsPoints(total);
        try {
          await updateDoc(userRef, { resultsPoints: total });
        } catch {}
      });
      registerUnsub(unsubResults);

      // 📜 Applications watcher
      const unsubApps = onSnapshot(appRef, async (snap) => {
        const newApps = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setApplications(newApps);

        for (const change of snap.docChanges()) {
          if (change.type === "modified") {
            const data = change.doc.data();
            const status = data.status?.toLowerCase();

            if (
              ["rejected", "admitted", "pending", "waiting", "withdrawn"].includes(status)
            ) {
              const notifMessage =
                status === "admitted"
                  ? `You have been admitted to ${data.courseName}.`
                  : status === "rejected"
                  ? `Your application for ${data.courseName} was rejected.`
                  : status === "waiting"
                  ? `Your application for ${data.courseName} is now on the waiting list.`
                  : status === "withdrawn"
                  ? `You withdrew your application for ${data.courseName}.`
                  : `Your application for ${data.courseName} is now pending.`;

              const notifDoc = doc(collection(db, "users", u.uid, "notifications"));
              await setDoc(notifDoc, {
                type: "Application Update",
                message: notifMessage,
                status,
                timestamp: serverTimestamp(),
              });
            }
          }
        }
      });
      registerUnsub(unsubApps);

      // Track user status (graduate or not) and experience years
      const unsubUser = onSnapshot(userRef, (snap) => {
        const data = snap.data() || {};
        setUserStatus((data.status || '').toLowerCase());
        setExperienceYears(data.experienceYears || 0);
      });
      registerUnsub(unsubUser);

      // 📄 Transcripts/documents watcher
      const docsQ = query(docsRef, where('type', '==', 'transcript'));
      const unsubDocs = onSnapshot(docsQ, (snap) => {
        const list = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setTranscripts(list);
      });
      registerUnsub(unsubDocs);

      return () => {
        unsubResults();
        unsubApps();
      };
    });

    return () => unsubAuth();
  }, []);

  // 🧩 Save/Delete Results
  const saveResult = async (subject, grade) => {
    if (!userId) return;
    const ref = doc(db, "users", userId, "results", subject.toLowerCase());
    await setDoc(ref, { subject: subject.toLowerCase(), grade });
  };

  const addResult = async (e) => {
    e.preventDefault();
    if (!newSubject || !userId) return;
    await saveResult(newSubject, newGrade);
    setNewSubject("");
    setNewGrade("A");
  };

  const deleteResult = async (subjectId) => {
    if (!userId) return;
    await deleteDoc(doc(db, "users", userId, "results", subjectId.toLowerCase()));
  };

  // 📤 Upload Transcript
  const onSelectTranscript = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    if (file.type !== "application/pdf") {
      showToast("Only PDF files are allowed for transcripts", "warning");
      e.target.value = '';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      showToast("File too large (max 10MB)", "warning");
      e.target.value = '';
      return;
    }
    setUploadingTranscript(true);
    try {
      const { ref, uploadBytes, getDownloadURL } = await import("firebase/storage");
      const path = `users/${userId}/transcripts/${Date.now()}-${file.name}`;
      const fileRef = ref(storage, path);
      await uploadBytes(fileRef, file, { contentType: file.type });
      const url = await getDownloadURL(fileRef);

      // Save metadata under user's subcollection
      const docRef = doc(collection(db, "users", userId, "documents"));
      await setDoc(docRef, {
        ownerId: userId,
        type: "transcript",
        storagePath: path,
        url,
        mimeType: file.type,
        size: file.size,
        originalName: file.name,
        createdAt: serverTimestamp(),
        verified: false,
      });

      // Notify user
      const notifRef = doc(collection(db, "users", userId, "notifications"));
      await setDoc(notifRef, {
        type: "Transcript Upload",
        message: "Your transcript was uploaded successfully.",
        timestamp: serverTimestamp(),
        status: "success",
      });

      showToast("Transcript uploaded successfully.", "success");
    } catch (err) {
      console.error("Transcript upload failed:", err);
      showToast("Failed to upload transcript.", "danger");
    } finally {
      setUploadingTranscript(false);
      e.target.value = '';
    }
  };

  // 🎓 Compute eligible courses
  const computeEligibleCourses = useCallback(async () => {
    if (!userId) return;
    try {
      // If already enrolled, do not compute/show qualified courses
      const isEnrolled = applications.some(a => (a.status || '').toLowerCase() === 'accepted');
      if (isEnrolled) {
        setEligibleCourses([]);
        return;
      }
      const snap = await getDocs(collectionGroup(db, "courses"));
      const allCourses = snap.docs.map((d) => {
        const data = d.data();
        const instId = d.ref.path.split("/")[1];
        return { id: d.id, institutionId: instId, ...data };
      });

      const qualified = [];
      const institutionCache = {};

      for (const c of allCourses) {
        const minPoints = Number(c.requirements?.minPoints || 0);
        if (resultsPoints < minPoints) continue;

        const gradeMap = results.reduce(
          (acc, r) => ({ ...acc, [r.subject.toLowerCase()]: r.grade }),
          {}
        );

        let meetsReqs = true;
        if (c.requirements?.subjects) {
          for (const s of c.requirements.subjects) {
            const g = gradeMap[s.subject?.toLowerCase()] || "F";
            const order = ["F", "E", "D", "C", "B", "A"];
            if (order.indexOf(g) < order.indexOf(s.grade)) {
              meetsReqs = false;
              break;
            }
          }
        }
        if (!meetsReqs) continue;

        let institutionName = "Unknown Institution";
        if (institutionCache[c.institutionId]) {
          institutionName = institutionCache[c.institutionId];
        } else {
          const instDoc = await getDoc(doc(db, "users", c.institutionId));
          if (instDoc.exists()) {
            const data = instDoc.data();
            institutionName =
              data.name || data.displayName || data.email || "Unnamed Institution";
            institutionCache[c.institutionId] = institutionName;
          }
        }

        qualified.push({ ...c, institutionName });
      }

      setEligibleCourses(qualified);
    } catch (err) {
      console.error("Compute courses failed:", err.message);
    }
  }, [results, resultsPoints, userId, applications]);

  useEffect(() => {
    computeEligibleCourses();
  }, [computeEligibleCourses]);

  // 📝 Apply for a course
  const applyForCourse = async (course) => {
    if (!userId) { showToast("Please sign in first.", "warning"); return; }
    try {
      // Prevent applying if already enrolled in a course
      const isEnrolled = applications.some(a => (a.status || '').toLowerCase() === 'accepted');
      if (isEnrolled) { showToast('You are already enrolled in a course.', 'warning'); return; }

      const userAppRef = collection(db, "users", userId, "applications");
      const q = query(userAppRef, where("institutionId", "==", course.institutionId));
      const snap = await getDocs(q);

      const active = snap.docs.filter(
        (d) => !["withdrawn", "rejected"].includes(d.data().status)
      );
      if (active.length >= 2) { showToast("Max 2 courses per institution.", "warning"); return; }

      const ref = doc(userAppRef);
      await setDoc(ref, {
        courseId: course.id,
        courseName: course.name,
        institutionId: course.institutionId,
        institutionName: course.institutionName,
        studentId: userId,
        studentName: studentProfile.name,
        status: "pending",
        createdAt: serverTimestamp(),
      });

      const certRef = doc(collection(db, "users", userId, "certificates"));
      await setDoc(certRef, {
        name: course.name,
        institutionId: course.institutionId,
        institutionName: course.institutionName,
        createdAt: serverTimestamp(),
      });

      const notifRef = doc(collection(db, "users", userId, "notifications"));
      await setDoc(notifRef, {
        type: "Application Created",
        message: `You applied for ${course.name}.`,
        timestamp: serverTimestamp(),
      });

      showToast(`Applied for ${course.name} and certificate saved!`, 'info');
      await runJobMatcher();
    } catch (err) {
      console.error("Apply failed:", err.message);
    }
  };

  const withdrawApplication = async (app) => {
    if (!userId) return;
    try {
      await updateDoc(doc(db, "users", userId, "applications", app.id), {
        status: "withdrawn",
      });

      // Remove related certificate added during apply to affect job matches
      try {
        const certsQ = query(
          collection(db, "users", userId, "certificates"),
          where("name", "==", app.courseName || "")
        );
        const certsSnap = await getDocs(certsQ);
        await Promise.all(certsSnap.docs.map((d) => deleteDoc(d.ref)));
      } catch (_) {}

      // Recompute job matches immediately
      await runJobMatcher();
    } catch (err) {
      console.error("Withdraw failed:", err.message);
    }
  };

  const acceptAdmission = async (app) => {
    if (!userId) return;
    try {
      // Accept chosen admission
      await updateDoc(doc(db, 'users', userId, 'applications', app.id), { status: 'accepted' });

      // Withdraw others (admitted or waiting)
      const others = applications.filter(a => a.id !== app.id && ['admitted','waiting'].includes((a.status||'').toLowerCase()));
      await Promise.all(others.map(o => updateDoc(doc(db, 'users', userId, 'applications', o.id), { status: 'withdrawn' })));

      // Notify
      const notifRef = doc(collection(db, 'users', userId, 'notifications'));
      await setDoc(notifRef, {
        type: 'Admission Accepted',
        message: `You accepted an offer for ${app.courseName}.`,
        timestamp: serverTimestamp(),
      });
    } catch (err) {
      console.error('Accept admission failed:', err.message);
    }
  };

  // 💼 Update experience years
  const updateExperienceYears = async () => {
    if (!userId) return;
    setIsUpdatingExperience(true);
    try {
      const userRef = doc(db, "users", userId);
      await updateDoc(userRef, { experienceYears: Number(experienceYears) || 0 });
      await runJobMatcher();
      showToast("Experience years updated successfully.", "success");
    } catch (err) {
      console.error("Failed to update experience years:", err.message);
      showToast("Failed to update experience years.", "danger");
    } finally {
      setIsUpdatingExperience(false);
    }
  };

  // 💼 JOB MATCHING
  const runJobMatcher = useCallback(async () => {
    if (!userId) return;
    try {
      // Only match for graduates
      const userSnap0 = await getDoc(doc(db, "users", userId));
      const userData0 = userSnap0.exists() ? userSnap0.data() : {};
      const isGraduate = (userData0.status || '').toLowerCase() === 'graduate';
      if (!isGraduate) {
        setMatchedJobs([]);
        return;
      }
      const jobsSnap = await getDocs(collectionGroup(db, "jobs"));
      const qualifiedJobs = [];
      const userSnap = await getDoc(doc(db, "users", userId));
      const userData = userSnap.exists() ? userSnap.data() : {};

      const certsSnap = await getDocs(collection(db, "users", userId, "certificates"));
      const certs = certsSnap.docs.map((d) => d.data().name);
      // Allow certificates for admitted or accepted courses
      const allowedCourseNames = applications
        .filter((a) => ['admitted','accepted'].includes((a.status || '').toLowerCase()))
        .map((a) => (a.courseName || '').toLowerCase());
      const admittedCerts = certs
        .map((c) => (c || '').toLowerCase())
        .filter((c) => allowedCourseNames.includes(c));
      const exp = userData.experienceYears || 0;

      for (const jobDoc of jobsSnap.docs) {
        const job = jobDoc.data();
        const companyId = jobDoc.ref.path.split("/")[1];
        const req = job.requirements || {};

        const meetsPoints = resultsPoints >= (req.points || 0);
        const meetsCerts =
          !req.certificates ||
          req.certificates.every((c) => admittedCerts.includes((c || '').toLowerCase()));
        const meetsExp = !req.experienceYears || exp >= req.experienceYears;

        if (meetsPoints && meetsCerts && meetsExp) {
          const companySnap = await getDoc(doc(db, "users", companyId));
          const companyName =
            companySnap.exists() && companySnap.data().name
              ? companySnap.data().name
              : "Unknown Company";

          qualifiedJobs.push({
            id: jobDoc.id,
            title: job.title,
            description: job.description,
            requirements: req,
            companyId,
            companyName,
          });
        }
      }

      setMatchedJobs(qualifiedJobs);
    } catch (err) {
      console.error("Job matcher failed:", err.message);
    }
  }, [userId, resultsPoints, applications]);

  useEffect(() => {
    if (userId) runJobMatcher();
  }, [results, applications, userId, runJobMatcher]);

  // Recompute matches when jobs change (no manual refresh needed)
  useEffect(() => {
    if (!userId) return;
    const unsub = onSnapshot(collectionGroup(db, 'jobs'), () => {
      runJobMatcher();
    });
    return () => unsub();
  }, [userId, runJobMatcher]);

  // ------------------------------------------------------------------------
  // UI
  // ------------------------------------------------------------------------
  return (
    <>
      <div className="container" style={{ padding: 16 }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 8, background: '#141d36', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7aa2ff', fontWeight: 700 }}>
              {String(studentProfile.name || 'S').slice(0,1).toUpperCase()}
            </div>
            <div>
              <h2 style={{ margin: 0 }}>{studentProfile.name || 'Student Dashboard'}</h2>
              <small style={{ color: '#9aa4bf' }}>Manage your results, applications, and career opportunities</small>
            </div>
          </div>
        </header>
      </div>
      <div className="container grid grid-auto gap-md">
      {/* 🧮 Results */}
      <Card title="My Results">
        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, borderBottom: '1px solid #2a3553' }}>
          <button
            onClick={() => setResultsView('results')}
            style={{
              padding: '8px 16px',
              background: resultsView === 'results' ? '#2563eb' : 'transparent',
              color: resultsView === 'results' ? '#fff' : '#9aa4bf',
              border: 'none',
              borderBottom: resultsView === 'results' ? '2px solid #2563eb' : '2px solid transparent',
              cursor: 'pointer',
              fontWeight: resultsView === 'results' ? '600' : '400',
              transition: 'all 0.2s'
            }}
          >
            My Results
          </button>
          <button
            onClick={() => setResultsView('transcripts')}
            style={{
              padding: '8px 16px',
              background: resultsView === 'transcripts' ? '#2563eb' : 'transparent',
              color: resultsView === 'transcripts' ? '#fff' : '#9aa4bf',
              border: 'none',
              borderBottom: resultsView === 'transcripts' ? '2px solid #2563eb' : '2px solid transparent',
              cursor: 'pointer',
              fontWeight: resultsView === 'transcripts' ? '600' : '400',
              transition: 'all 0.2s'
            }}
          >
            Upload Transcripts
          </button>
        </div>

        {/* Results View */}
        {resultsView === 'results' && (
          <>
            <form onSubmit={addResult} style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <input
                  placeholder="Subject"
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  required
                  style={{ flex: '1 1 200px' }}
                />
                <select value={newGrade} onChange={(e) => setNewGrade(e.target.value)} style={{ flex: '0 0 100px' }}>
                  {["A", "B", "C", "D", "E", "F"].map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </select>
                <button type="submit">Add</button>
              </div>
            </form>

            <div className="mb-md card-section" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'nowrap' }}>
              <button onClick={() => setShowResults(!showResults)}>
                {showResults ? "Hide Results" : "Show Results"}
              </button>
            </div>

            {showResults && (
              <div className="card-section">
                {results.length === 0 ? (
                  <p>No results yet.</p>
                ) : (
                  <ul className="list-separated">
                    {results.map((r) => (
                      <li key={r.id} className="flex justify-between items-center">
                        <span>
                          {r.subject}: <strong>{r.grade}</strong>
                        </span>
                        <button className="btn-danger btn-small" onClick={() => deleteResult(r.id)}>
                          Delete
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <div className="mt-lg card-section" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <strong>Total Points:</strong> {resultsPoints}
              </div>
            </div>
          </>
        )}

        {/* Transcripts View */}
        {resultsView === 'transcripts' && (
          <div className="card-section">
            <div style={{ marginBottom: 16 }}>
              <h4 style={{ marginBottom: 8 }}>Upload Transcript Document</h4>
              <small style={{ color: '#9aa4bf', display: 'block', marginBottom: 12 }}>
                Upload your transcript document. Only PDF files are accepted (max 10MB)
              </small>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={onSelectTranscript}
                  disabled={uploadingTranscript}
                  style={{ flex: '1 1 300px' }}
                />
                {uploadingTranscript && (
                  <small style={{ color: '#2563eb' }}>Uploading...</small>
                )}
              </div>
            </div>

            {transcripts.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <h4 style={{ marginBottom: 12 }}>Uploaded Transcripts</h4>
                <ul className="list-separated">
                  {transcripts.map((d) => (
                    <li key={d.id}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                          <div style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}><strong>{d.originalName || 'Document'}</strong></div>
                          <small style={{ color: '#9aa4bf' }}>
                            {(d.mimeType || '').replace('application/', '')}
                            {d.size && ` • ${(d.size / 1024 / 1024).toFixed(2)} MB`}
                          </small>
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                          {d.url && (
                            <a href={d.url} target="_blank" rel="noreferrer" className="btn-secondary btn-small">
                              View
                            </a>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {transcripts.length === 0 && !uploadingTranscript && (
              <div style={{ textAlign: 'center', padding: '32px 0', color: '#9aa4bf' }}>
                <p>No transcripts uploaded yet.</p>
                <small>Upload your first transcript using the file input above.</small>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* 🎓 Courses / Enrolled */}
      {applications.some(a => (a.status || '').toLowerCase() === 'accepted') ? (
        <Card title={userStatus === 'graduate' ? "Graduated Course" : "Enrolled Course"}>
          {(() => {
            const enrolled = applications.find(a => (a.status || '').toLowerCase() === 'accepted');
            if (!enrolled) return <p>No enrolled course found.</p>;
            return (
              <div className="list-separated">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <strong>{enrolled.courseName}</strong>
                    <div><small>Institution: {enrolled.institutionName}</small></div>
                  </div>
                </div>
                {userStatus === 'graduate' && (
                  <div className="card-section" style={{ marginTop: 16 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <strong>Years of Experience:</strong>
                        <input
                          type="number"
                          min="0"
                          value={experienceYears}
                          onChange={(e) => setExperienceYears(Number(e.target.value) || 0)}
                          style={{ width: 80, padding: '4px 8px' }}
                        />
                      </label>
                      <button
                        onClick={updateExperienceYears}
                        disabled={isUpdatingExperience}
                        className="btn-secondary btn-small"
                      >
                        {isUpdatingExperience ? "Updating..." : "Save"}
                      </button>
                    </div>
                    <small style={{ color: '#9aa4bf', display: 'block', marginTop: 8 }}>
                      Update your work experience to improve job matching.
                    </small>
                  </div>
                )}
              </div>
            );
          })()}
        </Card>
      ) : (
        <Card title="Qualified Courses">
          {eligibleCourses.length === 0 ? (
            <p>No qualified courses.</p>
          ) : (
            <ul className="list-separated">
              {eligibleCourses.map((c) => (
                <li key={c.id}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <strong>{c.name}</strong> <small>({c.requirements?.minPoints || 0} pts min)</small>
                      <div><small>Institution: {c.institutionName}</small></div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'nowrap' }}>
                      <button onClick={() => applyForCourse(c)}>Apply</button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {/* 📝 Applications */}
      <Card title="My Applications">
        {applications.length === 0 ? (
          <p>No applications yet.</p>
        ) : (
          <ul className="list-separated">
            {applications.map((a) => (
              <li key={a.id}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <strong>{a.courseName}</strong> <small style={{ textTransform: 'capitalize' }}>— {a.status}</small>
                    <div><small>Institution: {a.institutionName}</small></div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'nowrap' }}>
                    {["pending", "waiting", "admitted"].includes(a.status) && (
                      <button onClick={() => withdrawApplication(a)}>Withdraw</button>
                    )}
                    {a.status === 'admitted' && (
                      <button onClick={() => acceptAdmission(a)}>Accept Offer</button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* 💼 Jobs */}
      <Card title="Matched Jobs">
        {userStatus !== 'graduate' ? (
          <>
            <p>Jobs will appear after graduation.</p>
            <small style={{ color: "gray" }}>
              Your institution must graduate you to enable job matching.
            </small>
          </>
        ) : matchedJobs.length === 0 ? (
          <>
            <p>No matching jobs found.</p>
            <small style={{ color: "gray" }}>We’ll notify you when new jobs match.</small>
          </>
        ) : (
          <ul className="list-separated">
            {matchedJobs.map((j) => (
              <li key={j.id}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <strong>{j.title}</strong> <small>at {j.companyName}</small>
                  </div>
                </div>
                <div className="card-section" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '0.92em' }}>
                  <div><strong>Points:</strong> {j.requirements?.points || 0}</div>
                  <div><strong>Experience:</strong> {j.requirements?.experienceYears || 0}y</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      
    </div>
    </>
  );
}

function Card({ title, children }) {
  return (
    <div className="card">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

// removed inline delete button styles in favor of global CSS classes
