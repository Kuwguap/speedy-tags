import { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import { ServiceCard } from "@/components/ServiceCard";
import { api, type ServiceRecord } from "@/lib/api";
import { getServices } from "@/lib/store";
import { ShieldCheck, Clock, Truck, ArrowRight } from "lucide-react";
import heroBg from "@/assets/hero-bg.jpg";

const features = [
  { icon: ShieldCheck, title: "Fully Compliant", desc: "All tags meet state regulatory requirements" },
  { icon: Clock, title: "Instant Processing", desc: "Get your temporary tag within minutes" },
  { icon: Truck, title: "Fast Delivery", desc: "Delivered to your door or available digitally" },
];

export default function Index() {
  const [services, setServices] = useState<ServiceRecord[]>([]);

  useEffect(() => {
    api.getServices()
      .then(setServices)
      .catch(() => {
        setServices(getServices() as ServiceRecord[]);
      });
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Hero */}
      <section className="relative min-h-[85vh] flex items-center overflow-hidden">
        <img
          src={heroBg}
          alt=""
          className="absolute inset-0 w-full h-full object-cover object-center"
        />
        <div
          className="absolute inset-0 bg-gradient-to-r from-foreground/95 via-foreground/80 to-foreground/50"
          aria-hidden
        />
        <div className="relative container py-20 md:py-28">
          <div className="max-w-2xl">
            <p className="text-primary font-display font-semibold text-sm uppercase tracking-widest mb-4 animate-fade-in opacity-90">
              TempTag Express
            </p>
            <h1 className="font-display text-4xl md:text-6xl lg:text-7xl font-extrabold text-white mb-6 animate-fade-in leading-[1.1] tracking-tight">
              Temporary Car Tags,<br />
              <span className="text-primary">Made Simple</span>
            </h1>
            <p className="text-lg md:text-xl text-white/85 max-w-xl mb-10 animate-fade-in leading-relaxed" style={{ animationDelay: "0.1s" }}>
              Get your vehicle on the road fast with hassle-free temporary registration tags. Fully compliant, instantly processed.
            </p>
            <a
              href="#services"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-8 py-4 font-semibold text-primary-foreground hover:bg-primary/90 transition-all duration-200 shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 animate-fade-in"
              style={{ animationDelay: "0.2s" }}
            >
              Browse Services
              <ArrowRight className="h-5 w-5" />
            </a>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="container py-20 md:py-24 -mt-12 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {features.map((f) => (
            <div
              key={f.title}
              className="group flex items-start gap-5 p-8 rounded-2xl bg-card border border-border/50 shadow-card hover:shadow-card-hover transition-all duration-300"
            >
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300">
                <f.icon className="h-7 w-7" />
              </div>
              <div>
                <h3 className="font-display font-semibold text-lg text-foreground mb-2">{f.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Services */}
      <section id="services" className="py-20 md:py-28 bg-muted/30">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-4">
              Our Services
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto text-lg">
              Choose the temporary tag that fits your needs. Quick checkout, instant confirmation.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {services.map((s) => (
              <ServiceCard key={s.id} service={s} />
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/60 bg-card">
        <div className="container py-12">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2.5">
              <span className="font-display text-lg font-bold text-foreground">QuickTags</span>
            </div>
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} QuickTags. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
