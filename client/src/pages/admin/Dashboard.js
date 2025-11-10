import React, { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  deleteDoc,
  doc,
  setDoc,
  getDoc,
} from "firebase/firestore";
import { db, auth } from "../../firebase";
import { saveAs } from "file-saver";
import Loading from "../../components/Loading";
import { api } from "../../api";
import { showToast } from "../../App";
import { onAuthStateChanged } from "firebase/auth";

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    users: 0,
    institutions: 0,
    courses: 0,
    applications: 0,
    jobs: 0,
    companies: 0,
  });

  const [institutions, setInstitutions] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [students, setStudents] = useState([]);

  const [expanded, setExpanded] = useState(null);
  const [facultyInputs, setFacultyInputs] = useState({});

  const [instEmail, setInstEmail] = useState("");
  const [instName, setInstName] = useState("");
  const [instPassword, setInstPassword] = useState("");
  const [compEmail, setCompEmail] = useState("");
  const [compName, setCompName] = useState("");
  const [compPassword, setCompPassword] = useState("");

  const [jobInputs, setJobInputs] = useState({});
  const [courseInputs, setCourseInputs] = useState({});
  const [studentInputs, setStudentInputs] = useState({});
  const [transcripts, setTranscripts] = useState({});
  const [transcriptDocs, setTranscriptDocs] = useState({});
  const [adminProfile, setAdminProfile] = useState({ name: '' });

  // Load student transcript documents from Firebase Storage
  const loadTranscript = async (studentId) => {
    try {
      const API = process.env.REACT_APP_API_BASE || 'http://localhost:4000';
      const token = await window.firebaseAuthToken?.();
      const res = await fetch(`${API}/api/results/student/${studentId}/documents`, {
        headers: { 'Authorization': token ? `Bearer ${token}` : '' }
      });
      const data = await res.json();
      setTranscriptDocs((prev) => ({ ...prev, [studentId]: data.documents || [] }));
    } catch (e) {
      console.error('Failed to load transcript documents', e);
      alert('Failed to load transcript documents.');
    }
  };

  // ----------------------------------------------------------------
  // LOAD DATA
  // ----------------------------------------------------------------
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (u) => {
      if (u) {
        try {
          const me = await getDoc(doc(db, 'users', u.uid));
          if (me.exists()) {
            const data = me.data();
            const fullName = [data.name, data.lastName].filter(Boolean).join(' ').trim();
            setAdminProfile({
              name: fullName || data.displayName || data.email || 'Admin'
            });
          }
        } catch (_) {}
      }
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const usersSnap = await getDocs(collection(db, "users"));
        const allUsers = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

        const institutionsList = allUsers.filter((u) => u.role === "institution");
        const companiesList = allUsers.filter((u) => u.role === "company");
        const studentsList = allUsers.filter((u) => u.role === "student");

        let totalCourses = 0;
        let totalJobs = 0;
        let totalApplications = 0;
        const instAcceptedCounts = {};
        institutionsList.forEach((i) => { instAcceptedCounts[i.id] = 0; });

        for (const inst of institutionsList) {
          const coursesSnap = await getDocs(collection(db, "users", inst.id, "courses"));
          const facSnap = await getDocs(collection(db, "users", inst.id, "faculties"));
          totalCourses += coursesSnap.size;
          inst.courseCount = coursesSnap.size;
          inst.facultyCount = facSnap.size;
          inst.studentCount = studentsList.filter((s) => s.institutionId === inst.id).length;
        }

        for (const comp of companiesList) {
          const jobsSnap = await getDocs(collection(db, "users", comp.id, "jobs"));
          totalJobs += jobsSnap.size;
          comp.jobCount = jobsSnap.size;
        }

        for (const stu of studentsList) {
          const appsSnap = await getDocs(collection(db, "users", stu.id, "applications"));
          totalApplications += appsSnap.size;
          stu.applicationCount = appsSnap.size;
          for (const aDoc of appsSnap.docs) {
            const data = aDoc.data();
            const s = (data.status || '').toLowerCase();
            if (s === 'accepted' && data.institutionId) {
              instAcceptedCounts[data.institutionId] = (instAcceptedCounts[data.institutionId] || 0) + 1;
            }
          }
        }

        institutionsList.forEach((inst) => { inst.studentCount = instAcceptedCounts[inst.id] || 0; });

        setStats({
          users: allUsers.length,
          institutions: institutionsList.length,
          courses: totalCourses,
          applications: totalApplications,
          students: studentsList.length,
          jobs: totalJobs,
          companies: companiesList.length,
        });

        setInstitutions(institutionsList);
        setCompanies(companiesList);
        setStudents(studentsList);
      } catch (err) {
        console.error("Error loading admin data:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ----------------------------------------------------------------
  // DELETE
  // ----------------------------------------------------------------
  const handleDelete = async (type, id) => {
    const confirmMsg = `Delete ${type}? This will remove all nested data.`;
    if (!window.confirm(confirmMsg)) return;

    try {
      // Recursively delete known subcollections for each type
      const deleteAllDocs = async (colPathSegments) => {
        const colRef = collection(db, ...colPathSegments);
        const snap = await getDocs(colRef);
        const promises = snap.docs.map((d) => deleteDoc(d.ref));
        await Promise.all(promises);
      };

      if (type === "institution") {
        await Promise.all([
          deleteAllDocs(["users", id, "courses"]),
          deleteAllDocs(["users", id, "faculties"]),
        ]);
      } else if (type === "company") {
        await deleteAllDocs(["users", id, "jobs"]);
      } else if (type === "student") {
        await Promise.all([
          deleteAllDocs(["users", id, "results"]),
          deleteAllDocs(["users", id, "applications"]),
          deleteAllDocs(["users", id, "notifications"]),
        ]);
      }

      // Finally delete the user document
      await deleteDoc(doc(db, "users", id));

      if (type === "institution") setInstitutions((prev) => prev.filter((i) => i.id !== id));
      if (type === "company") setCompanies((prev) => prev.filter((c) => c.id !== id));
      if (type === "student") setStudents((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      console.error(`Failed to delete ${type}:`, err);
      alert("Failed to delete. Check console for details.");
    }
  };

  // ----------------------------------------------------------------
  // EXPAND / VIEW DETAILS
  // ----------------------------------------------------------------
  const toggleExpand = async (type, id) => {
    if (expanded?.id === id && expanded?.type === type) {
      setExpanded(null);
      return;
    }

    try {
      let details = [];
      if (type === "institution") {
        const snap = await getDocs(collection(db, "users", id, "courses"));
        details = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      } else if (type === "institution-faculties") {
        const snap = await getDocs(collection(db, "users", id, "faculties"));
        details = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      } else if (type === "institution-students") {
        const inst = institutions.find((x) => x.id === id);
        const instName = (inst?.name || inst?.email || inst?.id || "").toString();
        const matches = [];
        for (const stu of students) {
          const appsSnap = await getDocs(collection(db, "users", stu.id, "applications"));
          const hasAcceptedForInst = appsSnap.docs.some((d) => {
            const a = d.data();
            const s = (a.status || '').toLowerCase();
            return s === 'accepted' && (a.institutionId === id || a.institutionName === instName);
          });
          if (hasAcceptedForInst) {
            matches.push({ id: stu.id, name: stu.name || stu.email || stu.id });
          }
        }
        details = matches;
      } else if (type === "company") {
        const snap = await getDocs(collection(db, "users", id, "jobs"));
        details = snap.docs.map((d) => d.data());
      } else if (type === "student") {
        const snap = await getDocs(collection(db, "users", id, "results"));
        details = snap.docs.map((d) => d.data());
      } else if (type === "student-applications") {
        const snap = await getDocs(collection(db, "users", id, "applications"));
        details = snap.docs.map((d) => d.data());
      }
      setExpanded({ type, id, details });
    } catch (err) {
      console.error(`Failed to fetch ${type} details:`, err);
    }
  };

  // ----------------------------------------------------------------
  // ADD FACULTY
  // ----------------------------------------------------------------
  const addFaculty = async (institutionId) => {
    const name = facultyInputs[institutionId]?.trim();
    if (!name) return alert("Enter faculty name first.");
    try {
      const ref = doc(collection(db, "users", institutionId, "faculties"));
      await setDoc(ref, { name, createdAt: new Date() });
      setFacultyInputs((prev) => ({ ...prev, [institutionId]: "" }));
      toggleExpand("institution-faculties", institutionId);
      setInstitutions((prev) => prev.map((i) => i.id === institutionId ? { ...i, facultyCount: (i.facultyCount || 0) + 1 } : i));
    } catch (err) {
      console.error("Failed to add faculty:", err);
    }
  };

  // ----------------------------------------------------------------
  // DELETE FACULTY
  // ----------------------------------------------------------------
  const deleteFaculty = async (institutionId, facultyId) => {
    if (!window.confirm("Delete this faculty?")) return;
    try {
      await deleteDoc(doc(db, "users", institutionId, "faculties", facultyId));
      toggleExpand("institution-faculties", institutionId);
    } catch (err) {
      console.error("Failed to delete faculty:", err);
    }
  };

  // ----------------------------------------------------------------
  // CREATE USERS (Institution / Company)
  // ----------------------------------------------------------------
  const createInstitution = async () => {
    if (!instEmail.trim() || !instName.trim()) return alert("Enter institution name and email");
    try {
      setLoading(true);
      const res = await api("/api/admin/create-institution", "POST", { email: instEmail.trim(), name: instName.trim(), password: instPassword.trim() });
      setInstitutions((prev) => [{ id: res.uid, email: instEmail.trim(), name: instName.trim(), courseCount: 0 }, ...prev]);
      setInstEmail("");
      setInstName("");
      setInstPassword("");
      showToast('Institution created.', 'success');
    } catch (err) {
      console.error("Failed to create institution", err);
      showToast('Failed to create institution.', 'danger');
    } finally {
      setLoading(false);
    }
  };

  const createCompany = async () => {
    if (!compEmail.trim() || !compName.trim()) return alert("Enter company name and email");
    try {
      setLoading(true);
      const res = await api("/api/admin/create-company", "POST", { email: compEmail.trim(), name: compName.trim(), password: compPassword.trim() });
      setCompanies((prev) => [{ id: res.uid, email: compEmail.trim(), name: compName.trim(), jobCount: 0 }, ...prev]);
      setCompEmail("");
      setCompName("");
      setCompPassword("");
      showToast('Company created.', 'success');
    } catch (err) {
      console.error("Failed to create company", err);
      showToast('Failed to create company.', 'danger');
    } finally {
      setLoading(false);
    }
  };

  // ----------------------------------------------------------------
  // ADD JOB TO COMPANY
  // ----------------------------------------------------------------
  const addJobToCompany = async (companyId) => {
    const title = jobInputs[companyId]?.trim();
    if (!title) return alert("Enter job title first.");
    try {
      await api("/api/admin/create-job", "POST", { companyId, title });
      setJobInputs((prev) => ({ ...prev, [companyId]: "" }));
      alert("Job created successfully.");
      // Refresh company jobs if expanded
      if (expanded?.id === companyId && expanded?.type === "company") {
        toggleExpand("company", companyId);
      }
    } catch (err) {
      console.error("Failed to add job:", err);
      alert("Failed to add job. Check console.");
    }
  };

  // ----------------------------------------------------------------
  // ADD COURSE TO INSTITUTION
  // ----------------------------------------------------------------
  const addCourseToInstitution = async (institutionId) => {
    const name = courseInputs[institutionId]?.trim();
    if (!name) return alert("Enter course name first.");
    try {
      await api("/api/admin/create-course", "POST", { institutionId, name });
      setCourseInputs((prev) => ({ ...prev, [institutionId]: "" }));
      alert("Course created successfully.");
      setInstitutions((prev) => prev.map((i) => i.id === institutionId ? { ...i, courseCount: (i.courseCount || 0) + 1 } : i));
      // Refresh institution courses if expanded
      if (expanded?.id === institutionId && expanded?.type === "institution") {
        toggleExpand("institution", institutionId);
      }
    } catch (err) {
      console.error("Failed to add course:", err);
      alert("Failed to add course. Check console.");
    }
  };

  // ----------------------------------------------------------------
  // ADD STUDENT TO INSTITUTION
  // ----------------------------------------------------------------
  const addStudentToInstitution = async (institutionId) => {
    const input = studentInputs[institutionId] || {};
    const email = input.email?.trim();
    const name = input.name?.trim();
    if (!email || !name) return alert("Enter both student name and email.");
    try {
      const res = await api("/api/admin/create-student", "POST", { email, name, institutionId, password: (input.password || '').trim() });
      setStudentInputs((prev) => ({ ...prev, [institutionId]: {} }));
      showToast('Student created.', 'success');
      setInstitutions((prev) => prev.map((i) => i.id === institutionId ? { ...i, studentCount: (i.studentCount || 0) + 1 } : i));
      // Refresh institution students if expanded
      if (expanded?.id === institutionId && expanded?.type === "institution-students") {
        toggleExpand("institution-students", institutionId);
      }
    } catch (err) {
      console.error("Failed to add student:", err);
      showToast('Failed to add student.', 'danger');
    }
  };

  // ----------------------------------------------------------------
  // EXPORT CSV
  // ----------------------------------------------------------------
  const sanitizeForCSV = (value) => {
    const str = (value ?? "").toString();
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  };

  const exportCSV = async (type = "applications") => {
    try {
      if (type === "applications") {
        const rows = [["student", "course", "institution", "status", "createdAt"]];
        const usersSnap = await getDocs(collection(db, "users"));
        for (let u of usersSnap.docs) {
          const appsSnap = await getDocs(collection(db, "users", u.id, "applications"));
          for (let a of appsSnap.docs) {
            const data = a.data();
            const studentName =
              data.studentName ||
              u.data()?.name ||
              u.data()?.displayName ||
              u.data()?.email ||
              u.id;
            const courseName = data.courseName || data.targetName || "";
            const institutionName = data.institutionName || "";
            rows.push([
              sanitizeForCSV(studentName),
              sanitizeForCSV(courseName),
              sanitizeForCSV(institutionName),
              sanitizeForCSV(data.status || ""),
              data.createdAt
                ? new Date(data.createdAt.seconds * 1000).toISOString()
                : "",
            ]);
          }
        }
        const csv = rows.map((r) => r.join(",")).join("\n");
        saveAs(
          new Blob([csv], { type: "text/csv;charset=utf-8;" }),
          "applications.csv"
        );
      } else if (type === "jobs") {
        const rows = [["company", "title", "createdAt"]];
        for (const comp of companies) {
          const jobsSnap = await getDocs(collection(db, "users", comp.id, "jobs"));
          for (const j of jobsSnap.docs) {
            const d = j.data();
            rows.push([
              sanitizeForCSV(comp.name || comp.email || comp.id),
              sanitizeForCSV(d.title || ""),
              d.createdAt
                ? new Date(d.createdAt.seconds * 1000).toISOString()
                : "",
            ]);
          }
        }
        const csv = rows.map((r) => r.join(",")).join("\n");
        saveAs(new Blob([csv], { type: "text/csv;charset=utf-8;" }), "jobs.csv");
      }
    } catch (err) {
      console.error("Export failed:", err);
    }
  };

  // ----------------------------------------------------------------
  // RENDER
  // ----------------------------------------------------------------
  if (loading)
    return <Loading fullScreen={true} message="Loading Admin Dashboard..." />;

  return (
    <div className="container" style={{ padding: 16 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 8, background: '#141d36', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7aa2ff', fontWeight: 700 }}>
            {String(adminProfile.name || 'A').slice(0,1).toUpperCase()}
          </div>
          <div>
            <h2 style={{ margin: 0 }}>{adminProfile.name || 'Admin Dashboard'}</h2>
            <small style={{ color: '#9aa4bf' }}>Manage users, institutions, companies, and system resources</small>
          </div>
        </div>
        <div>
          <button onClick={() => exportCSV("applications")}>
            Export Applications
          </button>{" "}
          <button onClick={() => exportCSV("jobs")}>Export Jobs</button>
        </div>
      </header>

      <section
        style={{
          display: "flex",
          gap: 12,
          marginBottom: 24,
          flexWrap: "wrap",
        }}
      >
        {Object.entries(stats).map(([key, val]) => (
          <div
            key={key}
            style={{
              flex: "1 1 150px",
              padding: 16,
              borderRadius: 8,
              boxShadow: "0 2px 5px rgba(0,0,0,0.1)",
              textAlign: "center",
              background: "var(--card)",
            }}
          >
            <div style={{ textTransform: "capitalize" }}>{key}</div>
            <strong style={{ fontSize: 20 }}>{val}</strong>
          </div>
        ))}
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: 20,
        }}
      >
        {/* Institutions */}
        <div style={cardStyle}>
          <h3>Institutions</h3>
          <div style={{ marginBottom: 16 }}>
            <input
              value={instName}
              onChange={(e) => setInstName(e.target.value)}
              placeholder="Institution Name"
              style={{ padding: 6, borderRadius: 4, border: "1px solid #ccc", marginRight: 6 }}
            />
            <input
              value={instEmail}
              onChange={(e) => setInstEmail(e.target.value)}
              placeholder="Email"
              style={{ padding: 6, borderRadius: 4, border: "1px solid #ccc", marginRight: 6 }}
            />
            <input
              value={instPassword}
              onChange={(e) => setInstPassword(e.target.value)}
              placeholder="Default Password"
              type="password"
              style={{ padding: 6, borderRadius: 4, border: "1px solid #ccc", marginRight: 6 }}
            />
            <button onClick={createInstitution}>Add Institution</button>
          </div>
          {institutions.map((i) => (
            <div key={i.id} style={itemStyle}>
              <div>
                <strong>{i.name || i.email}</strong>
                <div style={{ fontSize: 12, color: "#999" }}>
                  Courses: {i.courseCount || 0} • Faculties: {i.facultyCount || 0} • Students: {i.studentCount || 0}
                </div>
              </div>
              <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={() => toggleExpand("institution", i.id)}>
                  View Courses
                </button>{" "}
                <button onClick={() => toggleExpand("institution-add-course", i.id)}>
                  Add Course
                </button>{" "}
                <button onClick={() => toggleExpand("institution-faculties", i.id)}>
                  View Faculties
                </button>{" "}
                <button onClick={() => toggleExpand("institution-students", i.id)}>
                  View Students
                </button>{" "}
                <button onClick={() => toggleExpand("institution-add-student", i.id)}>
                  Add Student
                </button>{" "}
                <button className="btn-danger" onClick={() => handleDelete("institution", i.id)}>
                  Delete
                </button>
              </div>

              {expanded?.id === i.id && expanded.type === "institution" && (
                <ul style={subListStyle}>
                  {expanded.details.length === 0 ? (
                    <li>No courses found.</li>
                  ) : (
                    expanded.details.map((c, idx) => (
                      <li key={idx}>{c.name || "Untitled Course"}</li>
                    ))
                  )}
                </ul>
              )}

              {expanded?.id === i.id && expanded.type === "institution-add-course" && (
                <div style={{ marginTop: 8 }}>
                  <input
                    value={courseInputs[i.id] || ""}
                    onChange={(e) =>
                      setCourseInputs((prev) => ({
                        ...prev,
                        [i.id]: e.target.value,
                      }))
                    }
                    placeholder="Course Name"
                    style={{
                      padding: 6,
                      borderRadius: 4,
                      border: "1px solid #ccc",
                      marginRight: 6,
                    }}
                  />
                  <button onClick={() => addCourseToInstitution(i.id)}>Create Course</button>
                </div>
              )}

              {expanded?.id === i.id && expanded.type === "institution-students" && (
                <ul style={subListStyle}>
                  {expanded.details.length === 0 ? (
                    <li>No students found.</li>
                  ) : (
                    expanded.details.map((s, idx) => (
                      <li key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span>{s.name || s.email || s.id}</span>
                          <button className="btn-small btn-secondary" style={{ marginLeft: 8 }} onClick={() => loadTranscript(s.id)}>View Transcripts</button>
                        </div>
                        {transcriptDocs[s.id] && (
                          <ul style={{ marginTop: 8, paddingLeft: 20 }}>
                            {transcriptDocs[s.id].length === 0 ? (
                              <li style={{ color: '#999' }}>No transcript documents uploaded</li>
                            ) : (
                              transcriptDocs[s.id].map((d, i) => (
                                <li key={i} style={{ marginBottom: 8, wordBreak: 'break-word' }}>
                                  {d.url ? (
                                    <a href={d.url} target="_blank" rel="noreferrer" style={{ color: '#2563eb', textDecoration: 'underline' }}>
                                      {d.originalName || 'Transcript'}
                                    </a>
                                  ) : (
                                    <span>{d.originalName || 'Transcript'}</span>
                                  )}
                                  <small style={{ marginLeft: 8, color: '#999' }}>
                                    {(d.mimeType || '').replace('application/', '')}
                                    {d.size && ` • ${(d.size / 1024 / 1024).toFixed(2)} MB`}
                                  </small>
                                </li>
                              ))
                            )}
                          </ul>
                        )}
                      </li>
                    ))
                  )}
                </ul>
              )}

              {expanded?.id === i.id && expanded.type === "institution-add-student" && (
                <div style={{ marginTop: 8 }}>
                  <input
                    value={studentInputs[i.id]?.name || ""}
                    onChange={(e) =>
                      setStudentInputs((prev) => ({
                        ...prev,
                        [i.id]: { ...prev[i.id], name: e.target.value },
                      }))
                    }
                    placeholder="Student Name"
                    style={{
                      padding: 6,
                      borderRadius: 4,
                      border: "1px solid #ccc",
                      marginRight: 6,
                    }}
                  />
                  <input
                    value={studentInputs[i.id]?.email || ""}
                    onChange={(e) =>
                      setStudentInputs((prev) => ({
                        ...prev,
                        [i.id]: { ...prev[i.id], email: e.target.value },
                      }))
                    }
                    placeholder="Student Email"
                    style={{
                      padding: 6,
                      borderRadius: 4,
                      border: "1px solid #ccc",
                      marginRight: 6,
                    }}
                  />
                  <input
                    value={studentInputs[i.id]?.password || ""}
                    onChange={(e) =>
                      setStudentInputs((prev) => ({
                        ...prev,
                        [i.id]: { ...prev[i.id], password: e.target.value },
                      }))
                    }
                    placeholder="Default Password"
                    type="password"
                    style={{
                      padding: 6,
                      borderRadius: 4,
                      border: "1px solid #ccc",
                      marginRight: 6,
                    }}
                  />
                  <button onClick={() => addStudentToInstitution(i.id)}>Create Student</button>
                </div>
              )}

              {expanded?.id === i.id && expanded.type === "institution-faculties" && (
                <div style={{ marginTop: 8 }}>
                  <input
                    value={facultyInputs[i.id] || ""}
                    onChange={(e) =>
                      setFacultyInputs((prev) => ({
                        ...prev,
                        [i.id]: e.target.value,
                      }))
                    }
                    placeholder="New Faculty Name"
                    style={{
                      padding: 6,
                      borderRadius: 4,
                      border: "1px solid #ccc",
                      marginRight: 6,
                    }}
                  />
                  <button onClick={() => addFaculty(i.id)}>Add Faculty</button>

                  <ul style={subListStyle}>
                    {expanded.details.length === 0 ? (
                      <li>No faculties found.</li>
                    ) : (
                      expanded.details.map((f, idx) => (
                        <li key={idx}>
                          {f.name || "Unnamed Faculty"}
                          <button
                            className="btn-danger btn-small"
                            onClick={() => deleteFaculty(i.id, f.id)}
                          >
                            Delete
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Companies */}
        <div style={cardStyle}>
          <h3>Companies</h3>
          <div style={{ marginBottom: 16 }}>
            <input
              value={compName}
              onChange={(e) => setCompName(e.target.value)}
              placeholder="Company Name"
              style={{ padding: 6, borderRadius: 4, border: "1px solid #ccc", marginRight: 6 }}
            />
            <input
              value={compEmail}
              onChange={(e) => setCompEmail(e.target.value)}
              placeholder="Email"
              style={{ padding: 6, borderRadius: 4, border: "1px solid #ccc", marginRight: 6 }}
            />
            <input
              value={compPassword}
              onChange={(e) => setCompPassword(e.target.value)}
              placeholder="Default Password"
              type="password"
              style={{ padding: 6, borderRadius: 4, border: "1px solid #ccc", marginRight: 6 }}
            />
            <button onClick={createCompany}>Add Company</button>
          </div>
          {companies.map((c) => (
            <div key={c.id} style={itemStyle}>
              <div>
                <strong>{c.name || c.email}</strong>
                <div style={{ fontSize: 12, color: "#999" }}>
                  Jobs: {c.jobCount || 0}
                </div>
              </div>
              <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={() => toggleExpand("company", c.id)}>
                  View Jobs
                </button>{" "}
                <button onClick={() => toggleExpand("company-add-job", c.id)}>
                  Add Job
                </button>{" "}
                <button className="btn-danger" onClick={() => handleDelete("company", c.id)}>
                  Delete
                </button>
              </div>
              {expanded?.id === c.id && expanded.type === "company" && (
                <ul style={subListStyle}>
                  {expanded.details.length === 0 ? (
                    <li>No jobs found.</li>
                  ) : (
                    expanded.details.map((j, idx) => (
                      <li key={idx}>{j.title || "Untitled Job"}</li>
                    ))
                  )}
                </ul>
              )}

              {expanded?.id === c.id && expanded.type === "company-add-job" && (
                <div style={{ marginTop: 8 }}>
                  <input
                    value={jobInputs[c.id] || ""}
                    onChange={(e) =>
                      setJobInputs((prev) => ({
                        ...prev,
                        [c.id]: e.target.value,
                      }))
                    }
                    placeholder="Job Title"
                    style={{
                      padding: 6,
                      borderRadius: 4,
                      border: "1px solid #ccc",
                      marginRight: 6,
                    }}
                  />
                  <button onClick={() => addJobToCompany(c.id)}>Create Job</button>
                </div>
              )}
            </div>
          ))}
        </div>

      </section>
    </div>
  );
}

const cardStyle = {
  background: "var(--card)",
  padding: 16,
  borderRadius: 8,
  boxShadow: "0 2px 5px rgba(0,0,0,0.1)",
};

const itemStyle = {
  borderBottom: "1px solid #eee",
  paddingBottom: 8,
  marginBottom: 8,
};

const subListStyle = {
  background: "var(--card)",
  borderRadius: 6,
  padding: 8,
  marginTop: 8,
  listStyle: "disc inside",
};
