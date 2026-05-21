import { Toaster as Sonner, toast } from "sonner";
import { useTheme } from "@/components/ThemeProvider";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme();

  return (
    <Sonner
      theme={resolvedTheme as ToasterProps["theme"]}
      className="toaster group"
      // Branded look: rounded, soft shadow, brand-tinted accents per state.
      // Sonner's `richColors` gives us success/error tints automatically; we
      // override the success ring to a slightly softer green that pairs with
      // our orange primary instead of fighting it.
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg group-[.toaster]:rounded-xl",
          title: "group-[.toast]:font-semibold",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:rounded-md",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          // Override the default sonner colors to match our brand palette
          success: "group-[.toaster]:!border-emerald-200 group-[.toaster]:!bg-emerald-50 group-[.toaster]:!text-emerald-900 dark:group-[.toaster]:!bg-emerald-950/40 dark:group-[.toaster]:!text-emerald-100 dark:group-[.toaster]:!border-emerald-900/40",
          error: "group-[.toaster]:!border-red-200 group-[.toaster]:!bg-red-50 group-[.toaster]:!text-red-900 dark:group-[.toaster]:!bg-red-950/40 dark:group-[.toaster]:!text-red-100 dark:group-[.toaster]:!border-red-900/40",
          info: "group-[.toaster]:!border-primary/30 group-[.toaster]:!bg-primary-soft group-[.toaster]:!text-foreground",
          warning: "group-[.toaster]:!border-amber-200 group-[.toaster]:!bg-amber-50 group-[.toaster]:!text-amber-900 dark:group-[.toaster]:!bg-amber-950/40",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
