import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

export function IconQueue(props: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
      <rect x="2" y="2.5" width="12" height="3" stroke="currentColor" strokeWidth="1.4" />
      <rect x="2" y="7" width="12" height="3" stroke="currentColor" strokeWidth="1.4" />
      <rect x="2" y="11.5" width="8" height="2.5" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

export function IconBook(props: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
      <path d="M2.5 2.5H7.5V13.5H2.5V2.5Z" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8.5 2.5H13.5V13.5H8.5V2.5Z" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

export function IconUsers(props: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
      <circle cx="6" cy="5" r="2.2" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M2 13C2 10.7 3.8 9.2 6 9.2C8.2 9.2 10 10.7 10 13"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <circle cx="11.5" cy="5.5" r="1.7" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10.5 9.5C12.3 9.7 13.8 11 13.8 13" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

export function IconLock(props: IconProps) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
      <rect x="3" y="7" width="10" height="7" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M5 7V5C5 3.3 6.3 2 8 2C9.7 2 11 3.3 11 5V7"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
      <path d="M8 2.5V13.5M2.5 8H13.5" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function IconArrowLeft(props: IconProps) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
      <path d="M13 8H3M3 8L7 4M3 8L7 12" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function IconSliders(props: IconProps) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
      <path d="M2 4H14M2 8H14M2 12H14" stroke="currentColor" strokeWidth="1.4" />
      <rect x="4" y="2.5" width="3" height="3" fill="currentColor" />
      <rect x="9" y="6.5" width="3" height="3" fill="currentColor" />
      <rect x="5" y="10.5" width="3" height="3" fill="currentColor" />
    </svg>
  );
}
