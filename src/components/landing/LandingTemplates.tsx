import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  LANDING_TEMPLATES, TEMPLATE_CATEGORIES,
  getTemplatesByCategory, type LandingTemplate, type TemplateCategory,
} from "@/lib/landing-templates";
import {
  Building2, Briefcase, Rocket, Store, Stethoscope, CalendarCheck,
  Video, Ticket, GraduationCap, BookOpen, Sparkles, ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// ── Icon resolver ─────────────────────────────────────────────────────────────
const ICONS: Record<string, React.ElementType> = {
  Building2, Briefcase, Rocket, Store, Stethoscope, CalendarCheck,
  Video, Ticket, GraduationCap, BookOpen,
};
function TemplateIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? Sparkles;
  return <Icon className={className} />;
}

// ── Template card ─────────────────────────────────────────────────────────────
function TemplateCard({
  template,
  onUse,
}: {
  template: LandingTemplate;
  onUse: (t: LandingTemplate) => void;
}) {
  return (
    <div className="group rounded-xl border border-border bg-card overflow-hidden flex flex-col hover:border-primary/40 hover:shadow-lg transition-all duration-200">
      {/* Gradient header */}
      <div className={cn("h-24 bg-gradient-to-br flex items-center justify-center relative", template.gradient)}>
        <div className="absolute inset-0 bg-black/20" />
        <TemplateIcon name={template.iconName} className="w-10 h-10 text-white/90 relative z-10 drop-shadow" />
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col gap-2 flex-1">
        <h3 className="font-semibold text-sm text-foreground leading-tight">{template.name}</h3>
        <p className="text-xs text-muted-foreground leading-relaxed flex-1">{template.description}</p>

        {/* Industry tags */}
        <div className="flex flex-wrap gap-1 mt-1">
          {template.industries.slice(0, 2).map(ind => (
            <Badge
              key={ind}
              variant="secondary"
              className="text-[10px] px-1.5 py-0 h-4 font-normal"
            >
              {ind}
            </Badge>
          ))}
          {template.industries.length > 2 && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-normal">
              +{template.industries.length - 2}
            </Badge>
          )}
        </div>
      </div>

      {/* Action */}
      <div className="px-4 pb-4">
        <Button
          size="sm"
          className="w-full gap-1.5 text-xs h-8"
          onClick={() => onUse(template)}
        >
          <Sparkles className="h-3 w-3" />
          Usar plantilla
          <ArrowRight className="h-3 w-3 ml-auto" />
        </Button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
interface LandingTemplatesProps {
  onSelectTemplate: (prompt: string, templateName: string) => void;
  onStartFromScratch: () => void;
  className?: string;
}

export function LandingTemplates({
  onSelectTemplate,
  onStartFromScratch,
  className,
}: LandingTemplatesProps) {
  const [activeCategory, setActiveCategory] = useState<TemplateCategory | "all">("all");

  const templates = getTemplatesByCategory(activeCategory);

  const handleUse = (t: LandingTemplate) => {
    onSelectTemplate(t.seed_prompt, t.name);
  };

  return (
    <div className={cn("flex flex-col gap-4 p-4 overflow-y-auto", className)}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Plantillas</h2>
          <p className="text-xs text-muted-foreground">Elige un objetivo y la IA genera la página lista</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs h-7 text-muted-foreground shrink-0"
          onClick={onStartFromScratch}
        >
          Desde cero
        </Button>
      </div>

      {/* Category filter */}
      <div className="flex gap-1.5 flex-wrap">
        {TEMPLATE_CATEGORIES.map(cat => (
          <button
            key={cat.key}
            onClick={() => setActiveCategory(cat.key as TemplateCategory | "all")}
            className={cn(
              "text-[11px] px-2.5 py-1 rounded-full border transition-colors font-medium",
              activeCategory === cat.key
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-transparent text-muted-foreground border-border hover:border-primary/40 hover:text-foreground",
            )}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Template grid */}
      <div className="grid grid-cols-2 gap-3">
        {templates.map(t => (
          <TemplateCard key={t.id} template={t} onUse={handleUse} />
        ))}
      </div>

      {/* Footer */}
      <div className="text-center pt-2 pb-1">
        <button
          onClick={onStartFromScratch}
          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
        >
          Prefiero escribir mi propio prompt →
        </button>
      </div>
    </div>
  );
}
