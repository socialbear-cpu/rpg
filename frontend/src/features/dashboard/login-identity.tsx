'use client';

import { useId } from 'react';

export function LoginBridge() {
  const id = useId();

  return <svg className="worlds-login-bridge" viewBox="0 0 1440 400" preserveAspectRatio="none" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id={`${id}-spectrum`}><stop stopColor="#72cbd4" /><stop offset=".35" stopColor="#9aabed" /><stop offset=".6" stopColor="#c3a4dc" /><stop offset=".8" stopColor="#dc9eae" /><stop offset="1" stopColor="#d7bc8f" /></linearGradient>
      <linearGradient id={`${id}-fade`} x2="0" y2="1"><stop stopColor="white" stopOpacity="0" /><stop offset=".35" stopColor="white" stopOpacity=".4" /><stop offset="1" stopColor="white" /></linearGradient>
      <mask id={`${id}-mask`}><path fill={`url(#${id}-fade)`} d="M0 0h1440v400H0z" /></mask>
    </defs>
    <g stroke={`url(#${id}-spectrum)`} mask={`url(#${id}-mask)`}>
      <path d="M670 0 270 400M695 0 495 400M720 0v400M745 0l200 400M770 0l400 400" />
      <path d="M670 0h100l400 400H270Z" fill={`url(#${id}-spectrum)`} fillOpacity=".025" />
    </g>
  </svg>;
}

export function LoginTabletopMark() {
  return <div className="worlds-tabletop-mark" aria-hidden="true">
    <span />
    <svg viewBox="0 0 48 50" fill="none">
      <path d="m24 3 20 11v22L24 47 4 36V14Z" stroke="currentColor" />
      <path d="m24 12 14 23H10Zm0-9v9M4 14l20-2 20 2M4 36l6-1 14 12 14-12 6 1" stroke="currentColor" opacity=".65" />
      <text x="24" y="30" fill="currentColor" textAnchor="middle">20</text>
    </svg>
    <span />
  </div>;
}
