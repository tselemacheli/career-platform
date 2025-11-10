
import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth } from './firebase';
import { onAuthStateChanged, getIdToken } from 'firebase/auth';

const AuthContext = createContext();
export function useAuth(){ return useContext(AuthContext); }

export default function AuthProvider({ children }){
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(()=>{
    return onAuthStateChanged(auth, async (u)=>{
      setUser(u);
      window.firebaseAuthToken = async ()=> u ? await getIdToken(u, true) : null;
      setLoading(false);
    });
  },[]);

  return <AuthContext.Provider value={{ user, loading }}>{children}</AuthContext.Provider>;
}

