import { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import { ServiceCard } from "@/components/ServiceCard";
import { api, type ServiceRecord } from "@/lib/api";
import { getServices } from "@/lib/store";
import {
  ShieldCheck,
  Clock,
  Truck,
  ArrowRight,
  Zap,
  FileCheck,
  Mail,
  ChevronDown,
  ChevronUp,
  Star,
  Check,
} from "lucide-react";
import heroBg from "@/assets/hero-bg.jpg";

const benefits = [
  { icon: Clock, title: "Same Day Processing", desc: "Get your temp tags the same day—no waiting." },
  { icon: ShieldCheck, title: "Official NJ MVC System", desc: "Processed through the official New Jersey Motor Vehicle Commission." },
  { icon: FileCheck, title: "DMV Verified Records", desc: "Your registration is verified and visible in DMV systems." },
  { icon: Zap, title: "Legal Temporary Registration", desc: "100% legit temp plates—compliant and enforceable." },
  { icon: FileCheck, title: "Temporary Insurance Card", desc: "Insurance card included with your temp tag package." },
  { icon: ShieldCheck, title: "Police & DMV Verified", desc: "Verified in police and DMV systems when pulled over." },
];

const steps = [
  { num: "1", title: "Submit Info", desc: "Fill out our quick online form with vehicle details and contact info." },
  { num: "2", title: "NJ MVC Processing", desc: "We process your order through the official NJ MVC system." },
  { num: "3", title: "Receive Your Temp Tags", desc: "Get your temp plate, registration, and insurance card via email or 1-hour delivery." },
];

const testimonials = [
  { quote: "Pulled over → Verified → Cleared → On the road. Cops ran my plate and everything checked out.", stars: 5, author: "Carlos L." },
  { quote: "Same day delivery is no joke. Had my temp tag in my hand within 2 hours. Legit and stress-free.", stars: 5, author: "Ava R." },
  { quote: "Bought a car privately, needed plates ASAP. DMV verified, no issues. Highly recommend.", stars: 5, author: "Sandra M." },
];

const faqs = [
  { q: "Are these legit?", a: "Yes. We are an NJ licensed dealer. All temp tags are processed through the official NJ MVC system and appear in DMV records." },
  { q: "Will police see them?", a: "Yes. When police run your plate, our temp tags show up as valid, DMV-verified registration." },
  { q: "How fast can I get them?", a: "Same day processing. Instant email delivery or 1-hour local car delivery—your choice." },
  { q: "How long are they valid?", a: "Our standard temp tags are valid for 30 days, giving you time to complete permanent registration." },
  { q: "Do I need to visit in person?", a: "No. 100% online—submit your info, pay securely, and receive delivery via email or same-day driver." },
];

export default function Index() {
  const [services, setServices] = useState<ServiceRecord[]>([]);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

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

      {/* Trust bar */}
      <div className="bg-primary text-primary-foreground py-2.5 text-center text-sm font-medium flex flex-wrap items-center justify-center gap-4 md:gap-8">
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="h-4 w-4 inline" />
          NJ Licensed Dealer
        </span>
        <span>NJ MVC Official Processing</span>
        <span>DMV Verified</span>
        <span>Legit Temporary Tags</span>
        <span>Secure Payments</span>
      </div>

      {/* Hero */}
      <section className="relative overflow-hidden bg-foreground">
        <img src={heroBg} alt="" className="absolute inset-0 w-full h-full object-cover object-center opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-b from-foreground/90 to-foreground" />
        <div className="relative container py-16 md:py-24 text-center">
          <h1 className="font-display text-2xl md:text-4xl lg:text-5xl font-extrabold text-white mb-4 leading-tight">
            New Jersey Temporary Tags —<br />
            <span className="text-primary">Legit • Same Day • DMV Verified</span>
          </h1>
          <p className="text-lg text-white/90 max-w-2xl mx-auto mb-6">
            Get legal NJ temporary plates + registration + insurance card.<br className="hidden sm:block" />
            Instant email or 1-hour local delivery.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-8">
            <a
              href="/checkout"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-8 py-4 font-bold text-primary-foreground hover:bg-primary/90 transition-all text-lg"
            >
              BUY IT NOW
              <ArrowRight className="h-5 w-5" />
            </a>
            <a
              href="/checkout"
              className="inline-flex items-center justify-center gap-2 rounded-lg border-2 border-white px-8 py-4 font-bold text-white hover:bg-white/10 transition-all text-lg"
            >
              GET MY TEMP TAG
            </a>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-white/80">
            <span>✔ Licensed Dealer</span>
            <span>✔ Official NJ MVC Processing</span>
            <span>✔ Legit Temp Plates</span>
            <span>✔ 30-Day Validity</span>
          </div>
        </div>
      </section>

      {/* Benefits grid */}
      <section className="container py-12 md:py-16 -mt-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {benefits.map((b) => (
            <div key={b.title} className="flex gap-4 p-6 rounded-xl bg-card border border-border shadow-sm hover:shadow-md transition-shadow">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <b.icon className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-display font-semibold text-foreground mb-1">{b.title}</h3>
                <p className="text-sm text-muted-foreground">{b.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="text-center mt-10">
          <a
            href="/checkout"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-8 py-3 font-bold text-primary-foreground hover:bg-primary/90 transition-all"
          >
            GET MY PLATE NOW
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </section>

      {/* Delivery Options */}
      <section className="py-12 md:py-16 bg-muted/50">
        <div className="container">
          <h2 className="font-display text-2xl md:text-3xl font-bold text-center text-foreground mb-10">
            Delivery Options
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
            <div className="flex gap-4 p-6 rounded-xl bg-card border border-border shadow-sm">
              <Mail className="h-10 w-10 text-primary shrink-0" />
              <div>
                <h3 className="font-display font-semibold text-foreground mb-1">Instant Email Delivery</h3>
                <p className="text-sm text-muted-foreground">Receive your temp tag, registration, and insurance card via email. Print and go.</p>
              </div>
            </div>
            <div className="flex gap-4 p-6 rounded-xl bg-card border border-border shadow-sm">
              <Truck className="h-10 w-10 text-primary shrink-0" />
              <div>
                <h3 className="font-display font-semibold text-foreground mb-1">1-Hour Local Car Delivery</h3>
                <p className="text-sm text-muted-foreground">Same-day driver delivery in select NJ areas. Get your physical temp tag in hand.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why Choose Us + Stats */}
      <section className="container py-16 md:py-20">
        <h2 className="font-display text-2xl md:text-3xl font-bold text-center text-foreground mb-12">
          Why Choose Us?
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          <div className="text-center p-6 rounded-xl bg-primary/5 border border-primary/20">
            <p className="font-display text-4xl font-bold text-primary">10,000+</p>
            <p className="text-muted-foreground mt-1">Tags Issued</p>
          </div>
          <div className="text-center p-6 rounded-xl bg-primary/5 border border-primary/20">
            <p className="font-display text-4xl font-bold text-primary">1-2 hrs</p>
            <p className="text-muted-foreground mt-1">Delivery Guarantee</p>
          </div>
          <div className="text-center p-6 rounded-xl bg-primary/5 border border-primary/20">
            <p className="font-display text-4xl font-bold text-primary">7 Days</p>
            <p className="text-muted-foreground mt-1">Support Available</p>
          </div>
        </div>
      </section>

      {/* 3 Easy Steps */}
      <section className="py-16 md:py-20">
        <div className="container">
          <h2 className="font-display text-2xl md:text-3xl font-bold text-center text-foreground mb-4">
            How It Works
          </h2>
          <p className="text-muted-foreground text-center mb-12">Skip inspections and unnecessary forms. Complete everything online.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {steps.map((s) => (
              <div key={s.num} className="text-center">
                <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-xl mb-4">
                  {s.num}
                </div>
                <h3 className="font-display font-semibold text-lg text-foreground mb-2">{s.title}</h3>
                <p className="text-muted-foreground text-sm">{s.desc}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-12">
              <a
              href="/checkout"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-8 py-3 font-semibold text-primary-foreground hover:bg-primary/90 transition-all"
            >
              GET YOUR PLATE NOW
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="container py-16 md:py-20">
        <h2 className="font-display text-2xl md:text-3xl font-bold text-center text-foreground mb-12">
          What Our Customers Say
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {testimonials.map((t) => (
            <blockquote key={t.author} className="p-6 rounded-xl bg-card border border-border shadow-sm">
              <div className="flex gap-0.5 mb-3">
                {Array.from({ length: t.stars }).map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
                ))}
              </div>
              <p className="text-muted-foreground italic mb-4">"{t.quote}"</p>
              <cite className="font-semibold text-foreground not-italic">— {t.author}</cite>
            </blockquote>
          ))}
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-16 md:py-20 bg-muted/50">
        <div className="container">
          <h2 className="font-display text-2xl md:text-3xl font-bold text-center text-foreground mb-4">
            Same Day NJ Temporary Tags
          </h2>
          <p className="text-muted-foreground text-center max-w-xl mx-auto mb-10">
            Get road legal in minutes. One simple package, everything included.
          </p>
          <div className="max-w-md mx-auto p-8 rounded-2xl bg-card border-2 border-primary/30 shadow-lg text-center">
            <p className="text-3xl font-display font-bold text-primary mb-6">$150</p>
            <ul className="space-y-2 text-left mb-5">
              {["Temp Plate", "Temporary Registration", "Insurance Card", "30-Day Validity"].map((item) => (
                <li key={item} className="flex items-center gap-2 text-muted-foreground">
                  <Check className="h-5 w-5 text-primary shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
            <a
              href="/checkout"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-8 py-4 font-bold text-primary-foreground hover:bg-primary/90 transition-all w-full justify-center"
            >
              BUY IT NOW
              <ArrowRight className="h-5 w-5" />
            </a>
          </div>
        </div>
      </section>

      {/* Services */}
      <section id="services" className="py-16 md:py-24">
        <div className="container">
          <h2 className="font-display text-2xl md:text-3xl font-bold text-center text-foreground mb-4">
            Choose Your Service
          </h2>
          <p className="text-muted-foreground text-center max-w-xl mx-auto mb-12">
            Select the temporary tag that fits your needs. Quick checkout, instant confirmation.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {services.map((s) => (
              <ServiceCard key={s.id} service={s} />
            ))}
          </div>
          <div className="text-center mt-12">
            <a
              href="/checkout"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-8 py-3 font-bold text-primary-foreground hover:bg-primary/90 transition-all"
            >
              INSTANT DELIVERY
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="container py-16 md:py-20">
        <h2 className="font-display text-2xl md:text-3xl font-bold text-center text-foreground mb-12">
          Frequently Asked Questions
        </h2>
        <div className="max-w-2xl mx-auto space-y-2">
          {faqs.map((faq, i) => (
            <div key={i} className="border border-border rounded-lg overflow-hidden">
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full flex items-center justify-between p-4 text-left font-medium text-foreground hover:bg-muted/50 transition-colors"
              >
                {faq.q}
                {openFaq === i ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              {openFaq === i && (
                <div className="px-4 pb-4 text-muted-foreground text-sm border-t border-border">
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-primary text-primary-foreground py-12">
        <div className="container text-center">
          <h2 className="font-display text-2xl font-bold mb-2">Need plates today?</h2>
          <p className="text-primary-foreground/90 mb-6">Get road legal in minutes.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href="/checkout"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-8 py-3 font-bold text-primary hover:bg-white/90 transition-all"
            >
              BUY IT NOW
              <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href="/checkout"
              className="inline-flex items-center justify-center gap-2 rounded-lg border-2 border-white px-8 py-3 font-bold text-white hover:bg-white/10 transition-all"
            >
              GET MY TEMP TAG
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-foreground text-white py-12">
        <div className="container">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            <div>
              <h4 className="font-display font-bold text-lg mb-3">TriStateTags</h4>
              <p className="text-white/80 text-sm">NJ licensed dealer. Same day temp tags, DMV verified.</p>
              <p className="text-xs text-white/60 mt-2">Dealer Info · Compliance</p>
            </div>
            <div>
              <h4 className="font-semibold mb-3">Company</h4>
              <ul className="space-y-2 text-sm text-white/80">
                <li><a href="/" className="hover:text-white">Home</a></li>
                <li><a href="#services" className="hover:text-white">Services</a></li>
                <li><a href="#pricing" className="hover:text-white">Pricing</a></li>
                <li><a href="#faq" className="hover:text-white">FAQ</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-3">Legal</h4>
              <ul className="space-y-2 text-sm text-white/80">
                <li><a href="/terms" className="hover:text-white">Terms</a></li>
                <li><a href="/privacy" className="hover:text-white">Privacy</a></li>
                <li><a href="#faq" className="hover:text-white">FAQs</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-3">Support</h4>
              <p className="text-sm text-white/80">Orders processed 7 days a week.</p>
            </div>
          </div>
          <div className="pt-8 border-t border-white/20 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-white/70">© {new Date().getFullYear()} TriStateTags. All rights reserved.</p>
            <p className="text-xs text-white/60">Licensed NJ dealer. Not affiliated with NJ MVC or government agencies.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
