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
      viewBox="-2.73 0 1225.016 1225.016"
      className={className}
      {...rest}
    >
      <defs>
        <linearGradient id="wa-official" gradientUnits="userSpaceOnUse" x1="609.77" y1="1190.114" x2="609.77" y2="21.084">
          <stop offset="0" stopColor="#20b038" />
          <stop offset="1" stopColor="#60d66a" />
        </linearGradient>
      </defs>
      {/* outer white ring */}
      <path
        fill="#FFF"
        d="M1036.898 176.091C923.562 62.677 772.859.185 612.297.114 281.43.114 12.172 269.286 12.039 600.137 12 705.896 39.633 809.13 92.156 900.13L7 1211.067l318.203-83.438c87.672 47.812 186.383 73.008 286.836 73.047h.255.003c330.812 0 600.109-269.219 600.25-600.055.055-160.343-62.328-311.108-175.649-424.53zm-424.601 923.242h-.195c-89.539-.047-177.344-24.086-253.93-69.531l-18.227-10.805-188.828 49.508 50.414-184.039-11.875-18.867c-49.945-79.414-76.312-171.188-76.273-265.422.109-274.992 223.906-498.711 499.102-498.711 133.266.055 258.516 52 352.719 146.266 94.195 94.266 146.031 219.578 145.992 352.852-.118 274.999-223.923 498.749-498.899 498.749z"
      />
      {/* green gradient bubble */}
      <path
        fill="url(#wa-official)"
        d="M27.875 1190.114l82.211-300.18c-50.719-87.852-77.391-187.523-77.359-289.602.133-319.398 260.078-579.25 579.469-579.25 155.016.07 300.508 60.398 409.898 169.891 109.414 109.492 169.633 255.031 169.57 409.812-.133 319.406-260.094 579.281-579.445 579.281-.023 0 .016 0 0 0h-.258c-96.977-.031-192.266-24.375-276.898-70.5l-307.188 80.548z"
      />
      {/* white phone glyph */}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill="#FFF"
        d="M462.273 349.294c-11.234-24.977-23.062-25.477-33.75-25.914-8.742-.375-18.75-.352-28.742-.352-10 0-26.25 3.758-39.992 18.766-13.75 15.008-52.5 51.289-52.5 125.078 0 73.797 53.75 145.102 61.242 155.117 7.5 10 103.758 166.266 256.203 226.383 126.695 49.961 152.477 40.023 179.977 37.523s88.734-36.273 101.234-71.297c12.5-35.016 12.5-65.031 8.75-71.305-3.75-6.25-13.75-10-28.75-17.5s-88.734-43.789-102.484-48.789-23.75-7.5-33.75 7.516c-10 15-38.727 48.773-47.477 58.773-8.75 10.023-17.5 11.273-32.5 3.773-15-7.523-63.305-23.344-120.609-74.438-44.586-39.75-74.688-88.844-83.438-103.859-8.75-15-.938-23.125 6.586-30.602 6.734-6.719 15-17.508 22.5-26.266 7.484-8.758 9.984-15.008 14.984-25.008 5-10.016 2.5-18.773-1.25-26.273s-32.898-81.67-46.234-111.326z"
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

/** 3D email: glossy blue envelope with depth shadow + flap highlight. */
export function EmailIcon3D({ size = 24, className, ...rest }: BrandIconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 32 32" className={className} {...rest}>
      <defs>
        <linearGradient id="em3-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6FB8FF" />
          <stop offset="0.55" stopColor="#2E7DF6" />
          <stop offset="1" stopColor="#1B57C9" />
        </linearGradient>
        <linearGradient id="em3-flap" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9BD0FF" />
          <stop offset="1" stopColor="#3C8BF8" />
        </linearGradient>
        <radialGradient id="em3-gloss" cx="0.3" cy="0.2" r="0.7">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.5" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="3" y="6.5" width="26" height="19" rx="4" fill="url(#em3-g)" />
      <path d="M3 10.5 16 19l13-8.5V11L16 19.5 3 11z" fill="#0E3F94" opacity="0.45" />
      <path d="M5 8.5 16 16l11-7.5z" fill="url(#em3-flap)" />
      <rect x="3" y="6.5" width="26" height="19" rx="4" fill="url(#em3-gloss)" />
    </svg>
  );
}

/** 3D call: glossy amber rounded badge with white phone handset. */
export function CallIcon3D({ size = 24, className, ...rest }: BrandIconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 32 32" className={className} {...rest}>
      <defs>
        <linearGradient id="cl3-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFC36B" />
          <stop offset="0.5" stopColor="#FB8C2A" />
          <stop offset="1" stopColor="#E5670B" />
        </linearGradient>
        <radialGradient id="cl3-gloss" cx="0.3" cy="0.22" r="0.7">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.5" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="8" fill="url(#cl3-g)" />
      <rect x="1" y="1" width="30" height="30" rx="8" fill="url(#cl3-gloss)" />
      <path
        fill="#fff"
        d="M21.7 19.3l-2.2-2.2c-.4-.4-1.1-.4-1.5 0l-1.1 1.1c-1.7-.9-3.1-2.3-4-4l1.1-1.1c.4-.4.4-1.1 0-1.5l-2.2-2.2c-.4-.4-1.1-.4-1.5 0l-1.2 1.2c-.6.6-.8 1.5-.5 2.3 1.6 4.5 5.2 8.1 9.7 9.7.8.3 1.7.1 2.3-.5l1.2-1.2c.3-.5.3-1.2-.1-1.6z"
      />
    </svg>
  );
}
