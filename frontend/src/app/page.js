'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
export default function Home(){ const router=useRouter(); useEffect(()=>{router.replace(sessionStorage.getItem('dms_token')?'/dashboard':'/login');},[router]); return <div className="boot-screen">DISPATCH <span>Loading workspace…</span></div>; }
