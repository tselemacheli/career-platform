// client/src/components/Guard.js
import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { getMe } from "../api";
import Loading from "./Loading";

export default function Guard({ role, children }) {
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    async function fetchUser() {
      try {
        const me = await getMe();
        console.log("🔎 Guard user:", me.user);
        if (me.user && me.user.role === role) {
          setAllowed(true);
        }
      } catch (e) {
        console.error("❌ Guard error:", e);
      } finally {
        setLoading(false);
      }
    }
    fetchUser();
  }, [role]);

  if (loading) return <Loading fullScreen={false} />;
  if (!allowed) return <Navigate to="/login" replace />;
  return children;
}
