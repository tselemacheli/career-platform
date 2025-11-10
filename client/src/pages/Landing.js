
import React from 'react';
import { Link } from 'react-router-dom';

export default function Landing(){
  return (
    <div className="container grid" style={{gap:'2rem'}}>
      <div className="header-hero">
        <div className="hero-card">
          <h1 style={{marginTop:0}}>Your pathway from high school to career — in Lesotho.</h1>
          <p>Discover institutions, verify eligibility instantly, apply smartly, and get auto-matched to jobs when you graduate.</p>
          <div style={{display:'flex', gap:10, marginTop:10}}>
            <Link to="/register"><button>Get Started</button></Link>
            <Link to="/login"><button style={{background:'#0e162b', border:'1px solid #224'}}>Sign In</button></Link>
          </div>
          <div className="notice" style={{marginTop:16}}>Email verification is required for all accounts.</div>
        </div>
        <div className="grid grid-2">
          <Link to="/student" className="card role-card"><h3>Student</h3><p>Input results, see qualified courses, apply, track admissions, upload certificates.</p></Link>
          <Link to="/institution" className="card role-card"><h3>Institution</h3><p>Publish faculties & courses, manage applications & admissions, enforce rules.</p></Link>
          <Link to="/company" className="card role-card"><h3>Company</h3><p>Post jobs, see matched graduates only, receive interview-ready applications.</p></Link>
          <Link to="/admin" className="card role-card"><h3>Admin</h3><p>Oversee users, institutions, jobs, reports, and systems health.</p></Link>
        </div>
      </div>
    </div>
  );
}
