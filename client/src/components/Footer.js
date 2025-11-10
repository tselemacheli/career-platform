
import React from "react";
import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-content">
        <div className="footer-grid">
          <div className="footer-section">
            <h3 className="footer-heading">Lesotho Career Platform</h3>
            <p className="footer-text">
              Empowering students in Lesotho to discover institutions, apply smartly,
              and get matched to jobs.
            </p>
          </div>

          <div className="footer-section">
            <h4 className="footer-heading">Quick Links</h4>
            <ul className="footer-links">
              <li><Link className="footer-link" to="/">Home</Link></li>
              <li><Link className="footer-link" to="/login">Login</Link></li>
              <li><Link className="footer-link" to="/register">Register</Link></li>
            </ul>
          </div>

          <div className="footer-section">
            <h4 className="footer-heading">Contact</h4>
            <ul className="footer-contact">
              <li className="footer-text">Email: tselemacheli334@gmail.com</li>
              <li className="footer-text">Phone: +266 6894 7715</li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Lesotho Career Platform. All rights reserved.</span>
        </div>
      </div>
    </footer>
  );
}
