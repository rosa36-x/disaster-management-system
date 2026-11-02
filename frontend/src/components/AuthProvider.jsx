'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '@/lib/api';
const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const raw = sessionStorage.getItem('dms_user');
    if (raw && sessionStorage.getItem('dms_token')) {
      try { setUser(JSON.parse(raw)); } catch { sessionStorage.removeItem('dms_token'); sessionStorage.removeItem('dms_user'); }
    }
    setReady(true);
  }, []);
  const login = async (username, password) => {
    const result = await api('/auth/login', { method:'POST', body:JSON.stringify({username,password}) });
    sessionStorage.setItem('dms_token', result.token);
    sessionStorage.setItem('dms_user', JSON.stringify(result.user));
    setUser(result.user);
  };
  const logout = () => { sessionStorage.removeItem('dms_token'); sessionStorage.removeItem('dms_user'); setUser(null); window.location.href='/login'; };
  return <AuthContext.Provider value={{user,ready,login,logout}}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);
