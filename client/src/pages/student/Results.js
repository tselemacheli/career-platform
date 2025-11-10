import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db, storage } from "../../firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { registerUnsub } from "../../App";

export default function Results() {
  const navigate = useNavigate();
  const [results, setResults] = useState([]);
  const [resultsPoints, setResultsPoints] = useState(0);
  const [newSubject, setNewSubject] = useState("");
  const [newGrade, setNewGrade] = useState("A");
  const [userId, setUserId] = useState(null);
  const [uploadingTranscript, setUploadingTranscript] = useState(false);
  const [transcripts, setTranscripts] = useState([]);

  const gradeToPoints = (g) => ({ A: 5, B: 4, C: 3, D: 2, E: 1, F: 0 }[g] || 0);

  // 🔐 AUTH + REALTIME LISTENERS
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setUserId(null);
        setResults([]);
        setResultsPoints(0);
        return;
      }

      setUserId(u.uid);

      const resRef = collection(db, "users", u.uid, "results");
      const docsRef = collection(db, "users", u.uid, "documents");

      // 🎓 Real-time results
      const unsubResults = onSnapshot(resRef, async (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setResults(list);

        const total = list.reduce((sum, r) => sum + gradeToPoints(r.grade), 0);
        setResultsPoints(total);
        try {
          const userRef = doc(db, "users", u.uid);
          await updateDoc(userRef, { resultsPoints: total });
        } catch {}
      });
      registerUnsub(unsubResults);

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
        unsubDocs();
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
    const allowed = ["application/pdf", "image/png", "image/jpeg"];
    if (!allowed.includes(file.type)) {
      alert("Only PDF, PNG, or JPEG allowed");
      e.target.value = '';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert("File too large (max 10MB)");
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

      const notifRef = doc(collection(db, "users", userId, "notifications"));
      await setDoc(notifRef, {
        type: "Transcript Upload",
        message: "Your transcript was uploaded successfully.",
        timestamp: serverTimestamp(),
        status: "success",
      });

      alert("Transcript uploaded successfully.");
    } catch (err) {
      console.error("Transcript upload failed:", err);
      alert("Failed to upload transcript.");
    } finally {
      setUploadingTranscript(false);
      e.target.value = '';
    }
  };

  return (
    <div className="container" style={{ maxWidth: 800, margin: '0 auto' }}>
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 16 }}>
        <button onClick={() => navigate('/student')} className="btn-secondary">
          ← Back to Dashboard
        </button>
        <h1 style={{ margin: 0 }}>My Results</h1>
      </div>

      <div className="card">
        <h3>Add New Result</h3>
        <form onSubmit={addResult} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 200px' }}>
            <input
              placeholder="Subject"
              value={newSubject}
              onChange={(e) => setNewSubject(e.target.value)}
              required
              style={{ width: '100%' }}
            />
          </div>
          <div style={{ flex: '0 0 100px' }}>
            <select value={newGrade} onChange={(e) => setNewGrade(e.target.value)} style={{ width: '100%' }}>
              {["A", "B", "C", "D", "E", "F"].map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </div>
          <button type="submit">Add</button>
        </form>
      </div>

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>All Results</h3>
          <div style={{ fontSize: '1.1em', fontWeight: 'bold', color: '#4f9cf9' }}>
            Total Points: {resultsPoints}
          </div>
        </div>

        {results.length === 0 ? (
          <p style={{ color: '#9aa4bf', textAlign: 'center', padding: '32px 0' }}>No results yet. Add your first result above.</p>
        ) : (
          <ul className="list-separated">
            {results.map((r) => (
              <li key={r.id} className="flex justify-between items-center" style={{ padding: '12px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <span style={{ fontSize: '1.1em' }}>
                    <strong>{r.subject}</strong>: <span style={{ color: '#4f9cf9', fontSize: '1.2em' }}>{r.grade}</span>
                  </span>
                  <small style={{ color: '#9aa4bf' }}>
                    ({gradeToPoints(r.grade)} points)
                  </small>
                </div>
                <button className="btn-danger btn-small" onClick={() => deleteResult(r.id)}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h3>Upload Results Document</h3>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <small style={{ color: '#9aa4bf' }}>
              Upload your transcript or results document (PDF, PNG, or JPEG, max 10MB)
            </small>
            {uploadingTranscript && <small style={{ color: '#9aa4bf' }}>Uploading...</small>}
          </div>
          <input
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            onChange={onSelectTranscript}
          />
          {transcripts.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <h4 style={{ marginBottom: 12 }}>Uploaded Documents</h4>
              <ul className="list-separated">
                {transcripts.map((d) => (
                  <li key={d.id}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <div>
                        <div><strong>{d.originalName || 'Document'}</strong></div>
                        <small style={{ color: '#9aa4bf' }}>{(d.mimeType || '').replace('application/', '')}</small>
                      </div>
                      {d.url && (
                        <a href={d.url} target="_blank" rel="noreferrer" className="btn-secondary btn-small">
                          View
                        </a>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

