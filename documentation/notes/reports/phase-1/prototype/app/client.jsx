"use client";import dynamic from'next/dynamic';const Lab=dynamic(()=>import('../src/Lab'),{ssr:false});export default function Client(){return <Lab/>}
