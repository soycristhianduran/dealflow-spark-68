/**
 * Official-look brand marks for the infra platforms shown in the SaaS monitor.
 * Designed to sit on a white chip. Sized via `size`.
 */
import type { SVGProps } from "react";
interface P extends SVGProps<SVGSVGElement> { size?: number | string }

export function AnthropicIcon({ size = 20, className, ...r }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...r}>
      <g fill="#D97757">
        <rect x="11" y="2" width="2" height="20" rx="1" />
        <rect x="11" y="2" width="2" height="20" rx="1" transform="rotate(45 12 12)" />
        <rect x="11" y="2" width="2" height="20" rx="1" transform="rotate(90 12 12)" />
        <rect x="11" y="2" width="2" height="20" rx="1" transform="rotate(135 12 12)" />
      </g>
    </svg>
  );
}

export function OpenAIIcon({ size = 20, className, ...r }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...r}>
      <path fill="#000" d="M22.28 9.82a5.98 5.98 0 0 0-.52-4.91 6.05 6.05 0 0 0-6.51-2.9A6.07 6.07 0 0 0 4.98 4.18a5.98 5.98 0 0 0-3.99 2.9 6.05 6.05 0 0 0 .74 7.1 5.98 5.98 0 0 0 .51 4.91 6.05 6.05 0 0 0 6.52 2.9A5.98 5.98 0 0 0 13.26 22a6.06 6.06 0 0 0 5.77-4.21 5.99 5.99 0 0 0 4-2.9 6.06 6.06 0 0 0-.75-7.07zM13.26 20.6a4.5 4.5 0 0 1-2.88-1.04l.14-.08 4.78-2.76a.78.78 0 0 0 .39-.68v-6.74l2.02 1.17a.07.07 0 0 1 .04.05v5.58a4.5 4.5 0 0 1-4.5 4.5zM3.6 16.47a4.47 4.47 0 0 1-.54-3.01l.14.09 4.78 2.76a.78.78 0 0 0 .78 0l5.84-3.37v2.33a.08.08 0 0 1-.03.06L9.73 20.2a4.5 4.5 0 0 1-6.14-1.65zM2.34 6.7a4.5 4.5 0 0 1 2.35-1.97v5.68a.77.77 0 0 0 .39.68l5.81 3.35-2.02 1.17a.07.07 0 0 1-.07 0l-4.83-2.79A4.5 4.5 0 0 1 2.34 6.7zm16.6 3.86-5.84-3.4 2.02-1.16a.07.07 0 0 1 .07 0l4.83 2.79a4.5 4.5 0 0 1-.68 8.12v-5.68a.78.78 0 0 0-.4-.67zm2.01-3.03-.14-.09-4.77-2.78a.78.78 0 0 0-.79 0L9.42 8.99V6.66a.07.07 0 0 1 .03-.06l4.83-2.79a4.5 4.5 0 0 1 6.68 4.66zM8.32 11.78 6.3 10.62a.08.08 0 0 1-.04-.06V4.99a4.5 4.5 0 0 1 7.38-3.45l-.14.08-4.78 2.76a.78.78 0 0 0-.39.68zm1.1-2.37 2.6-1.5 2.6 1.5v3l-2.6 1.5-2.6-1.5z" />
    </svg>
  );
}

export function ResendIcon({ size = 20, className, ...r }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...r}>
      <path fill="#000" d="M5 3h7.5a5 5 0 0 1 1.6 9.74L19 21h-4.3l-4.2-7.5H9V21H5V3zm4 3.4v3.8h3.1a1.9 1.9 0 0 0 0-3.8H9z" />
    </svg>
  );
}

export function SupabaseIcon({ size = 20, className, ...r }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...r}>
      <path fill="#3ECF8E" d="M13.4 2.2c.5-.6 1.5-.2 1.5.6v7.3h5.5c.9 0 1.4 1 .8 1.7l-8.6 9.9c-.5.6-1.5.2-1.5-.6v-7.3H5.6c-.9 0-1.4-1-.8-1.7l8.6-9.9z" />
    </svg>
  );
}

export function StripeIcon({ size = 20, className, ...r }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...r}>
      <rect width="24" height="24" rx="5" fill="#635BFF" />
      <path fill="#fff" d="M11.5 9.3c0-.5.45-.7 1.1-.7.95 0 2.15.3 3.1.8V6.55a8 8 0 0 0-3.1-.6c-2.55 0-4.25 1.35-4.25 3.6 0 3.5 4.7 2.95 4.7 4.45 0 .55-.5.75-1.2.75-1.05 0-2.45-.45-3.5-1.05v2.75c1.15.5 2.35.7 3.5.7 2.6 0 4.4-1.3 4.4-3.6 0-3.75-4.75-3.1-4.75-4.5z" />
    </svg>
  );
}

export function VercelIcon({ size = 20, className, ...r }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...r}>
      <path fill="#000" d="M12 2 23 21H1L12 2z" />
    </svg>
  );
}

export function CloudflareIcon({ size = 20, className, ...r }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...r}>
      <path fill="#FBAD41" d="M22 15.5c0 1.4-1.1 2.5-2.5 2.5H7l1.3-4.7 11.2-.3c1.4 0 2.5.9 2.5 2.5z" />
      <path fill="#F6821F" d="M17.4 17.2c.15-.5.1-1-.18-1.32-.26-.3-.65-.47-1.12-.5l-8.9-.12a.18.18 0 0 1-.14-.08.2.2 0 0 1-.02-.17c.03-.1.13-.18.24-.18l8.98-.12c1.06-.05 2.21-.92 2.62-1.98l.5-1.36a.3.3 0 0 0 .01-.18 5.6 5.6 0 0 0-10.76-.6 2.5 2.5 0 0 0-3.9 2.27A3.6 3.6 0 0 0 4 19h13a.27.27 0 0 0 .26-.2l.14-.5z" />
    </svg>
  );
}

/** Generic voice/Vapi mark (no public brand asset) — clean phone-wave glyph. */
export function VoiceIcon({ size = 20, className, ...r }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...r}>
      <rect width="24" height="24" rx="5" fill="#10B981" />
      <g fill="#fff">
        <rect x="11" y="6" width="2" height="12" rx="1" />
        <rect x="7.5" y="9" width="2" height="6" rx="1" />
        <rect x="14.5" y="8" width="2" height="8" rx="1" />
        <rect x="4" y="10.5" width="2" height="3" rx="1" />
        <rect x="18" y="10.5" width="2" height="3" rx="1" />
      </g>
    </svg>
  );
}
