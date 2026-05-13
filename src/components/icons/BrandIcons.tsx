/**
 * Official-look brand icons as React SVG components.
 *
 * Paths are simplified versions of the public brand assets — sized via the
 * className/size prop and inherit currentColor where appropriate so they can
 * adapt to dark/light mode.
 *
 * All component signatures: ({ className, size }) → JSX
 */
import type { SVGProps } from "react";

interface BrandIconProps extends SVGProps<SVGSVGElement> {
  size?: number | string;
}

export function WhatsAppIcon({ size = 24, className, ...rest }: BrandIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      {...rest}
    >
      <defs>
        <linearGradient id="wa-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#25D366" />
          <stop offset="1" stopColor="#128C7E" />
        </linearGradient>
      </defs>
      <path
        fill="url(#wa-grad)"
        d="M16 .5C7.4.5.5 7.4.5 16c0 2.8.7 5.4 2 7.7L.5 31.5l8-2c2.2 1.2 4.8 1.9 7.5 1.9 8.6 0 15.5-6.9 15.5-15.5S24.6.5 16 .5z"
      />
      <path
        fill="#fff"
        d="M11.7 9.3c-.3-.7-.6-.7-.9-.7h-.7c-.3 0-.8.1-1.2.6-.4.5-1.6 1.5-1.6 3.7s1.6 4.3 1.8 4.6c.2.3 3.2 5 7.8 7 3.9 1.6 4.7 1.3 5.6 1.2.9-.1 2.7-1.1 3.1-2.2.4-1.1.4-2 .3-2.2-.1-.2-.4-.3-.8-.5l-3-1.5c-.4-.2-.7-.3-1 .2-.3.5-1.1 1.4-1.4 1.7-.3.3-.5.3-1 .1-.4-.2-1.8-.7-3.5-2.1-1.3-1.1-2.2-2.5-2.4-2.9-.3-.4 0-.7.2-.9.2-.2.4-.5.6-.7.2-.2.3-.4.4-.7.1-.2.1-.5 0-.7l-1.3-3.1z"
      />
    </svg>
  );
}

export function InstagramIcon({ size = 24, className, ...rest }: BrandIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      {...rest}
    >
      <defs>
        <radialGradient id="ig-grad" cx="30%" cy="107%" r="150%">
          <stop offset="0" stopColor="#FFDD55" />
          <stop offset="0.1" stopColor="#FFDD55" />
          <stop offset="0.5" stopColor="#FF543E" />
          <stop offset="1" stopColor="#C837AB" />
        </radialGradient>
        <linearGradient id="ig-grad2" x1="14%" y1="0%" x2="86%" y2="100%">
          <stop offset="0" stopColor="#3771C8" stopOpacity="1" />
          <stop offset="0.13" stopColor="#3771C8" stopOpacity="1" />
          <stop offset="1" stopColor="#6600FF" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#ig-grad)" />
      <rect width="32" height="32" rx="8" fill="url(#ig-grad2)" />
      <path
        fill="#fff"
        d="M16 7.5c-2.3 0-2.6 0-3.5.1-.9 0-1.5.2-2 .4-.6.2-1 .5-1.5 1s-.8.9-1 1.5c-.2.5-.4 1.1-.4 2-.1.9-.1 1.2-.1 3.5s0 2.6.1 3.5c0 .9.2 1.5.4 2 .2.6.5 1 1 1.5s.9.8 1.5 1c.5.2 1.1.4 2 .4.9.1 1.2.1 3.5.1s2.6 0 3.5-.1c.9 0 1.5-.2 2-.4.6-.2 1-.5 1.5-1s.8-.9 1-1.5c.2-.5.4-1.1.4-2 .1-.9.1-1.2.1-3.5s0-2.6-.1-3.5c0-.9-.2-1.5-.4-2-.2-.6-.5-1-1-1.5s-.9-.8-1.5-1c-.5-.2-1.1-.4-2-.4-.9-.1-1.2-.1-3.5-.1zm0 1.5c2.3 0 2.5 0 3.4.1.8 0 1.3.2 1.5.3.4.1.7.3 1 .6.3.3.5.6.6 1 .1.2.3.7.3 1.5.1.9.1 1.1.1 3.4s0 2.5-.1 3.4c0 .8-.2 1.3-.3 1.5-.1.4-.3.7-.6 1-.3.3-.6.5-1 .6-.2.1-.7.3-1.5.3-.9.1-1.1.1-3.4.1s-2.5 0-3.4-.1c-.8 0-1.3-.2-1.5-.3-.4-.1-.7-.3-1-.6-.3-.3-.5-.6-.6-1-.1-.2-.3-.7-.3-1.5-.1-.9-.1-1.1-.1-3.4s0-2.5.1-3.4c0-.8.2-1.3.3-1.5.1-.4.3-.7.6-1 .3-.3.6-.5 1-.6.2-.1.7-.3 1.5-.3.9-.1 1.1-.1 3.4-.1zm0 2.5c-2.5 0-4.5 2-4.5 4.5s2 4.5 4.5 4.5 4.5-2 4.5-4.5-2-4.5-4.5-4.5zm0 7.4c-1.6 0-2.9-1.3-2.9-2.9 0-1.6 1.3-2.9 2.9-2.9 1.6 0 2.9 1.3 2.9 2.9 0 1.6-1.3 2.9-2.9 2.9zm5.8-7.6c0 .6-.5 1-1 1s-1-.5-1-1 .5-1 1-1 1 .5 1 1z"
      />
    </svg>
  );
}

export function FacebookIcon({ size = 24, className, ...rest }: BrandIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      {...rest}
    >
      <path
        fill="#1877F2"
        d="M32 16C32 7.16 24.84 0 16 0S0 7.16 0 16c0 8 5.85 14.6 13.5 15.8V20.6H9.43V16h4.07v-3.53c0-4.02 2.39-6.24 6.05-6.24 1.75 0 3.59.31 3.59.31v3.95h-2.02c-2 0-2.62 1.24-2.62 2.51V16h4.45l-.71 4.6h-3.74v11.2C26.15 30.6 32 24 32 16z"
      />
      <path
        fill="#fff"
        d="M22.23 20.6l.71-4.6h-4.45v-2.99c0-1.27.62-2.51 2.62-2.51h2.02V6.55s-1.84-.31-3.59-.31c-3.66 0-6.05 2.22-6.05 6.24V16H9.43v4.6h4.07v11.2c1.65.26 3.35.26 5 0V20.6h3.74z"
      />
    </svg>
  );
}

export function MessengerIcon({ size = 24, className, ...rest }: BrandIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      {...rest}
    >
      <defs>
        <radialGradient id="msg-grad" cx="19%" cy="99%" r="108%">
          <stop offset="0" stopColor="#0099FF" />
          <stop offset="0.6" stopColor="#A033FF" />
          <stop offset="0.9" stopColor="#FF5280" />
          <stop offset="1" stopColor="#FF7061" />
        </radialGradient>
      </defs>
      <path
        fill="url(#msg-grad)"
        d="M16 0C7.07 0 0 6.55 0 15.16c0 4.5 1.94 8.4 5.1 11.1V32l4.66-2.56c1.96.54 4.03.82 6.24.82 8.93 0 16-6.55 16-15.16C32 6.55 24.93 0 16 0z"
      />
      <path
        fill="#fff"
        d="M7.5 20.05L11.95 13l4.55 3.5L20.45 13l5.05 7.05-4.05-2.55-3.55 3.55-4.55-3.5-3.45 2.5z"
      />
    </svg>
  );
}

export function TelegramIcon({ size = 24, className, ...rest }: BrandIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      {...rest}
    >
      <defs>
        <linearGradient id="tg-grad" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0" stopColor="#2AABEE" />
          <stop offset="1" stopColor="#229ED9" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="16" fill="url(#tg-grad)" />
      <path
        fill="#fff"
        d="M7.4 15.7L22.8 9.6c.7-.3 1.4.2 1.2 1.1l-2.6 12.5c-.2.7-.6.9-1.2.6l-3.4-2.5-1.7 1.6c-.2.2-.4.4-.7.4l.3-3.6 6.5-5.9c.3-.3-.1-.4-.4-.2l-8 5.1-3.4-1.1c-.8-.2-.8-.7.1-1z"
      />
    </svg>
  );
}

export function TikTokIcon({ size = 24, className, ...rest }: BrandIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      {...rest}
    >
      <rect width="32" height="32" rx="6" fill="#000" />
      <path
        fill="#25F4EE"
        d="M22 9.5v2.6c-.7 0-1.5-.2-2.2-.5v6.2c0 3.2-2.6 5.8-5.8 5.8-1.2 0-2.4-.4-3.3-1.1.9.8 2 1.3 3.3 1.3 3.2 0 5.8-2.6 5.8-5.8v-6.2c.7.3 1.4.5 2.2.5V10c-.4 0-.8-.1-1.2-.2z"
      />
      <path
        fill="#FF004F"
        d="M20.8 11.3c-1-1-1.6-2.3-1.6-3.8h-1.9v9.7c0 1.7-1.4 3-3 3-.5 0-1-.1-1.4-.3.5.7 1.4 1.2 2.4 1.2 1.7 0 3-1.3 3-3v-9.7h1.9c0 1.4.5 2.6 1.4 3.6h-.8z"
      />
      <path
        fill="#fff"
        d="M19.6 7.4h-1.5V18.7c0 1.7-1.3 3-3 3-1 0-1.9-.5-2.4-1.2-.8-.5-1.4-1.4-1.4-2.5 0-1.6 1.3-2.9 2.9-2.9.3 0 .6 0 .9.1v-2c-.3 0-.6-.1-.9-.1-2.7 0-4.9 2.2-4.9 4.9 0 1.7.8 3.1 2.1 4 .9.7 2.1 1.1 3.3 1.1 3.2 0 5.8-2.6 5.8-5.8v-6.2c.7.3 1.5.5 2.2.5V9.5c-1.3-.1-2.3-.8-3.1-2.1z"
      />
    </svg>
  );
}

export function GoogleCalendarIcon({ size = 24, className, ...rest }: BrandIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      {...rest}
    >
      <rect x="4" y="4" width="24" height="24" rx="2" fill="#fff" />
      <path fill="#4285F4" d="M22 4h4a2 2 0 0 1 2 2v4h-6V4z" />
      <path fill="#1A73E8" d="M4 22h6v6H6a2 2 0 0 1-2-2v-4z" />
      <path fill="#FBBC04" d="M22 28v-6h6v4a2 2 0 0 1-2 2h-4z" />
      <path fill="#34A853" d="M4 10h6v12H4V10z" />
      <path fill="#EA4335" d="M22 10v12H10V10h12z" />
      <text
        x="16" y="21" textAnchor="middle" fontSize="11" fontFamily="Arial, sans-serif"
        fontWeight="700" fill="#1A73E8"
      >31</text>
    </svg>
  );
}

export function MetaAdsIcon({ size = 24, className, ...rest }: BrandIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      {...rest}
    >
      <defs>
        <linearGradient id="meta-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0" stopColor="#0081FB" />
          <stop offset="0.5" stopColor="#0064E1" />
          <stop offset="1" stopColor="#0064E1" />
        </linearGradient>
      </defs>
      <path
        fill="url(#meta-grad)"
        d="M16 4C9.5 4 4 9.5 4 16c0 5 3 9.2 7.4 11l.1-.1c-1-1.5-1.5-3.3-1.5-5.2 0-3.7 2-7 5-8.7l.1.1c1.4 2.6 3.2 4.9 5.4 6.7l.5-.5c-2.1-1.7-3.9-3.9-5.3-6.4l.5-.3c1.5-.7 3.1-1.1 4.8-1.1 3.3 0 6.1 1.5 8 4l.1-.1C26.4 6.9 21.6 4 16 4zm10 8.4c-1.6-1.8-3.6-3.1-5.9-3.7l-.1.1c2.2 2.3 4 4.9 5.4 7.8l.6.1zM6.4 19.7c.5 2.3 1.7 4.2 3.4 5.7l.2-.2c-1-1.6-1.6-3.5-1.6-5.5 0-3.7 2.1-7 5.2-8.7l-.4-.5c-3.7 1.5-6.4 5-7 9.2z"
      />
    </svg>
  );
}

export function EmailIcon({ size = 24, className, ...rest }: BrandIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      {...rest}
    >
      <rect width="32" height="32" rx="6" fill="#EA4335" />
      <path
        fill="#fff"
        d="M6 11l10 7 10-7v12H6V11zm0-2h20v.5l-10 7-10-7V9z"
      />
    </svg>
  );
}
