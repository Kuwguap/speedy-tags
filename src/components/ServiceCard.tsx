import { useNavigate } from "react-router-dom";
import type { ServiceRecord } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export function ServiceCard({ service }: { service: ServiceRecord }) {
  const navigate = useNavigate();

  return (
    <Card className="group overflow-hidden shadow-card hover:shadow-card-hover transition-all duration-300 border-border/50 rounded-2xl">
      <div className="h-52 bg-accent/50 flex items-center justify-center overflow-hidden relative">
        {service.image ? (
          <img
            src={service.image}
            alt={service.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <img src="/placeholder.svg" alt="" className="w-24 h-24 object-contain opacity-40" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-foreground/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <CardContent className="p-6 space-y-4">
        <h3 className="font-display text-xl font-bold text-foreground">{service.title}</h3>
        <p className="text-muted-foreground text-sm leading-relaxed line-clamp-3">{service.description}</p>
        <div className="flex items-center justify-between pt-4">
          <span className="text-2xl font-display font-bold text-primary">${service.price.toFixed(2)}</span>
          <Button
            onClick={() => navigate(`/checkout/${service.id}`)}
            size="sm"
            className="rounded-lg gap-1.5"
          >
            Get Started
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
