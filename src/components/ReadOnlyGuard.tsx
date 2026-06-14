import { usePermissions } from "@/hooks/usePermissions";

/**
 * ReadOnlyGuard — wraps editable/config page content so that "Solo lectura"
 * (readonly) members can VIEW everything but cannot interact with any control.
 * A disabled <fieldset> neutralises every input/button/select inside at once
 * (UI layer); the RLS policies are the security backstop at the DB layer.
 *
 * Use on config/power pages (Agents, Automations, Integrations, Marketing).
 * Do NOT use on operational list pages where readonly still needs filters/search
 * (those use targeted permission checks instead).
 */
export function ReadOnlyGuard({ children, className }: { children: React.ReactNode; className?: string }) {
  const { isReadonly } = usePermissions();
  if (!isReadonly) return <>{children}</>;
  return (
    <fieldset disabled className={`border-0 p-0 m-0 min-w-0 ${className ?? ""}`}>
      {children}
    </fieldset>
  );
}
