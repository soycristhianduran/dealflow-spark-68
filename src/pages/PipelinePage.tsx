import { AppLayout } from "@/components/layout/AppLayout";
import { AppHeader } from "@/components/layout/AppHeader";
import { Badge } from "@/components/ui/badge";
import { mockDeals, defaultStages } from "@/data/mock-data";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Deal } from "@/types/crm";

export default function PipelinePage() {
  const navigate = useNavigate();
  const [deals, setDeals] = useState<Deal[]>(mockDeals);
  const [draggedDeal, setDraggedDeal] = useState<string | null>(null);

  const stages = defaultStages.filter(s => s.id !== 's8'); // exclude lost for kanban main view

  const handleDragStart = (dealId: string) => {
    setDraggedDeal(dealId);
  };

  const handleDrop = (stageId: string) => {
    if (!draggedDeal) return;
    setDeals(prev => prev.map(d =>
      d.id === draggedDeal
        ? { ...d, stage_id: stageId, stage: defaultStages.find(s => s.id === stageId) }
        : d
    ));
    setDraggedDeal(null);
  };

  const getStageValue = (stageId: string) => {
    return deals.filter(d => d.stage_id === stageId && d.status === 'open').reduce((sum, d) => sum + d.value, 0);
  };

  return (
    <AppLayout>
      <AppHeader title="Pipeline" subtitle="Vista Kanban de oportunidades" />
      <main className="flex-1 overflow-x-auto p-6 scrollbar-thin">
        <div className="flex gap-4 min-w-max h-full">
          {stages.map((stage) => {
            const stageDeals = deals.filter(d => d.stage_id === stage.id);
            return (
              <div
                key={stage.id}
                className="flex w-72 flex-col rounded-lg bg-muted/50"
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(stage.id)}
              >
                {/* Stage header */}
                <div className="flex items-center justify-between px-3 py-3 border-b">
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
                    <span className="text-sm font-semibold text-foreground">{stage.name}</span>
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                      {stageDeals.length}
                    </span>
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">
                    ${(getStageValue(stage.id) / 1000).toFixed(0)}K
                  </span>
                </div>

                {/* Cards */}
                <div className="flex-1 space-y-2 p-2 overflow-y-auto scrollbar-thin">
                  {stageDeals.map((deal) => (
                    <div
                      key={deal.id}
                      draggable
                      onDragStart={() => handleDragStart(deal.id)}
                      onClick={() => navigate(`/deals/${deal.id}`)}
                      className="rounded-lg border bg-card p-3 shadow-sm hover:shadow-md cursor-grab active:cursor-grabbing transition-shadow"
                    >
                      <p className="text-sm font-medium text-foreground mb-1">{deal.title}</p>
                      <p className="text-xs text-muted-foreground mb-2">{deal.contact?.full_name || 'Sin contacto'}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-foreground">${deal.value.toLocaleString()}</span>
                        <Badge variant="outline" className="text-xs">{deal.currency}</Badge>
                      </div>
                      {deal.expected_close_date && (
                        <p className="text-xs text-muted-foreground mt-1.5">Cierre: {deal.expected_close_date}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </AppLayout>
  );
}
