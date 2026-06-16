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

/** Official Shopify logo (green bag + white S). */
export function ShopifyIcon({ size = 20, className, ...r }: P) {
  return (
    <svg width={size} height={size} viewBox="-18 0 292 292" className={className} preserveAspectRatio="xMidYMid" {...r}>
      <path d="M223.774 57.34c-.201-1.46-1.48-2.268-2.537-2.357-1.055-.088-23.383-1.743-23.383-1.743s-15.507-15.395-17.209-17.099c-1.703-1.703-5.029-1.185-6.32-.805-.19.056-3.388 1.043-8.678 2.68-5.18-14.906-14.322-28.604-30.405-28.604-.444 0-.901.018-1.358.044C129.31 3.407 123.644.779 118.75.779c-37.465 0-55.364 46.835-60.976 70.635-14.558 4.511-24.9 7.718-26.221 8.133-8.126 2.549-8.383 2.805-9.45 10.462C21.3 95.806.038 260.235.038 260.235l165.678 31.042 89.77-19.42S223.973 58.8 223.775 57.34zM156.49 40.848l-14.019 4.339c.005-.988.01-1.96.01-3.023 0-9.264-1.286-16.723-3.349-22.636 8.287 1.04 13.806 10.469 17.358 21.32zm-27.638-19.483c2.304 5.773 3.802 14.058 3.802 25.238 0 .572-.005 1.095-.01 1.624-9.117 2.824-19.024 5.89-28.953 8.966 5.575-21.516 16.025-31.908 25.161-35.828zm-11.131-10.537c1.617 0 3.246.549 4.805 1.622-12.007 5.65-24.877 19.88-30.312 48.297l-22.886 7.088C75.694 46.16 90.81 10.828 117.72 10.828z" fill="#95BF46" />
      <path d="M221.237 54.983c-1.055-.088-23.383-1.743-23.383-1.743s-15.507-15.395-17.209-17.099c-.637-.634-1.496-.959-2.394-1.099l-12.527 256.233 89.762-19.418S223.972 58.8 223.774 57.34c-.201-1.46-1.48-2.268-2.537-2.357" fill="#5E8E3E" />
      <path d="M135.242 104.585l-11.069 32.926s-9.698-5.176-21.586-5.176c-17.428 0-18.305 10.937-18.305 13.693 0 15.038 39.2 20.8 39.2 56.024 0 27.713-17.577 45.558-41.277 45.558-28.44 0-42.984-17.7-42.984-17.7l7.615-25.16s14.95 12.835 27.565 12.835c8.243 0 11.596-6.49 11.596-11.232 0-19.616-32.16-20.491-32.16-52.724 0-27.129 19.472-53.382 58.778-53.382 15.145 0 22.627 4.338 22.627 4.338" fill="#FFF" />
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
