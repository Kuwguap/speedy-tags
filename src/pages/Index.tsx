import { useState, useEffect, useRef } from "react";
import { useHorizontalSwipe } from "@/hooks/use-horizontal-swipe";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { ServiceCard } from "@/components/ServiceCard";
import { useCheckout } from "@/context/CheckoutContext";
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
  Package,
  ChevronDown,
  ChevronUp,
  Star,
  Check,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import heroBg from "@/assets/hero-bg.jpg";

const benefits = [
  { icon: Clock, title: "Same Day Processing", desc: "Get your temp tags the same day—no waiting." },
  { icon: ShieldCheck, title: "Official NJ MVC System", desc: "Processed through the official New Jersey Motor Vehicle Commission." },
  { icon: FileCheck, title: "DMV Verified Records", desc: "Your registration is verified and visible in DMV systems." },
  { icon: Zap, title: "Legal Temporary Registration", desc: "Compliant and enforceable temp plates." },
  { icon: ShieldCheck, title: "Police & DMV Verified", desc: "Verified in police and DMV systems when pulled over." },
];

const steps = [
  { num: "1", title: "Submit Info", desc: "Fill out our quick online form with vehicle details and contact info." },
  { num: "2", title: "NJ MVC Processing", desc: "We process your order through the official NJ MVC system." },
  { num: "3", title: "Receive Your Temp Tags", desc: "Get your temp plate and registration via email, 1-hour delivery, or FedEx delivery." },
];

const testimonials = [
  { quote: "Pulled over → Verified → Cleared → On the road. Cops ran my plate and everything checked out.", stars: 5, author: "Carlos L." },
  { quote: "Same day delivery is no joke. Had my temp tag in my hand within 2 hours. Stress-free.", stars: 5, author: "Ava R." },
  { quote: "Bought a car privately, needed plates ASAP. DMV verified, no issues. Highly recommend.", stars: 5, author: "Sandra M." },
];

const reviewImages = [
  "/reviews/photo_2026-05-14_21-16-01.jpg",
  "/reviews/photo_2026-05-14_21-16-04.jpg",
  "/reviews/photo_2026-05-14_21-16-06.jpg",
  "/reviews/photo_2026-05-14_21-16-08.jpg",
  "/reviews/photo_2026-05-14_21-16-10.jpg",
  "/reviews/photo_2026-05-14_21-16-11.jpg",
  "/reviews/photo_2026-05-14_21-16-13.jpg",
  "/reviews/photo_2026-05-14_21-16-15.jpg",
];

const faqs = [
  { q: "Are these official?", a: "Yes. We are an NJ licensed dealer. All temp tags are processed through the official NJ MVC system and appear in DMV records." },
  { q: "Will police see them?", a: "Yes. When police run your plate, our temp tags show up as valid, DMV-verified registration." },
  { q: "How fast can I get them?", a: "Same day processing. Instant email, 1-hour local delivery, or FedEx delivery—your choice." },
  { q: "How long are they valid?", a: "Our standard temp tags are valid for 30 days, giving you time to complete permanent registration." },
  { q: "Do I need to visit in person?", a: "No. 100% online—submit your info, pay securely, and receive delivery via email, same-day driver, or FedEx delivery." },
];

type ReviewCarouselVariant = "compact" | "featured";

function ReviewCarouselBlock(props: {
  variant: ReviewCarouselVariant;
  reviewImages: string[];
  reviewIndex: number;
  setReviewsPaused: (paused: boolean) => void;
  prevReview: () => void;
  nextReview: () => void;
  onJumpTo: (i: number) => void;
}) {
  const { variant, reviewImages, reviewIndex, setReviewsPaused, prevReview, nextReview, onJumpTo } = props;
  const frameRef = useRef<HTMLDivElement>(null);
  const swipe = useHorizontalSwipe(frameRef, {
    onSwipeLeft: nextReview,
    onSwipeRight: prevReview,
    onInteractionStart: () => setReviewsPaused(true),
    onInteractionEnd: () => setReviewsPaused(false),
  });

  const compact = variant === "compact";

  const outerClass = compact
    ? "relative mx-auto flex w-full max-w-[280px] flex-col items-center"
    : "relative mx-auto max-w-3xl";

  const frameClass = compact
    ? "relative mx-auto aspect-[4/5] w-full max-h-[120px] max-w-[168px] sm:max-h-[200px] sm:max-w-[240px] rounded-xl overflow-hidden bg-card border border-border shadow-md cursor-grab active:cursor-grabbing select-none touch-pan-y"
    : "relative aspect-[3/4] sm:aspect-[4/3] md:aspect-[16/10] rounded-2xl overflow-hidden bg-card border border-border shadow-lg cursor-grab active:cursor-grabbing select-none touch-pan-y";

  const btnClass = compact
    ? "absolute left-1 top-1/2 -translate-y-1/2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-foreground shadow hover:bg-white transition"
    : "absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-foreground shadow hover:bg-white transition";

  const btnRightClass = compact
    ? "absolute right-1 top-1/2 -translate-y-1/2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-foreground shadow hover:bg-white transition"
    : "absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-foreground shadow hover:bg-white transition";

  const iconClass = compact ? "h-4 w-4" : "h-5 w-5";

  const counterClass = compact
    ? "absolute bottom-1.5 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white"
    : "absolute bottom-2 right-3 rounded-full bg-black/60 px-2.5 py-0.5 text-xs font-medium text-white";

  const dotsWrapClass = compact ? "flex justify-center gap-1.5 mt-1 sm:mt-2" : "flex justify-center gap-2 mt-4";

  const dotActiveClass = compact ? "w-5 bg-primary" : "w-6 bg-primary";
  const dotIdleClass = compact ? "w-1.5 bg-border hover:bg-muted-foreground/50" : "w-2 bg-border hover:bg-muted-foreground/50";
  const dotBaseClass = compact ? "h-1.5 rounded-full transition-all" : "h-2 rounded-full transition-all";

  return (
    <div
      className={outerClass}
      onMouseEnter={() => setReviewsPaused(true)}
      onMouseLeave={() => setReviewsPaused(false)}
    >
      <div
        ref={frameRef}
        className={frameClass}
        role="region"
        aria-roledescription="carousel"
        aria-label="Customer review photos"
        {...swipe}
      >
        {reviewImages.map((src, i) => (
          <img
            key={src}
            src={src}
            alt={`Customer review ${i + 1}`}
            draggable={false}
            loading={i === 0 ? "eager" : "lazy"}
            className={`absolute inset-0 w-full h-full object-contain object-center bg-card transition-opacity duration-700 ease-in-out pointer-events-none ${
              i === reviewIndex ? "opacity-100" : "opacity-0"
            }`}
            aria-hidden={i === reviewIndex ? "false" : "true"}
          />
        ))}

        <button
          type="button"
          onClick={prevReview}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          aria-label="Previous review"
          className={btnClass}
        >
          <ChevronLeft className={iconClass} />
        </button>
        <button
          type="button"
          onClick={nextReview}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          aria-label="Next review"
          className={btnRightClass}
        >
          <ChevronRight className={iconClass} />
        </button>

        <div className={counterClass}>
          {reviewIndex + 1} / {reviewImages.length}
        </div>
      </div>

      <div className={dotsWrapClass}>
        {reviewImages.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onJumpTo(i)}
            aria-label={`Show review ${i + 1}`}
            className={`${dotBaseClass} ${i === reviewIndex ? dotActiveClass : dotIdleClass}`}
          />
        ))}
      </div>
    </div>
  );
}

export default function Index() {
  const navigate = useNavigate();
  const { update } = useCheckout();
  const [services, setServices] = useState<ServiceRecord[]>([]);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewsPaused, setReviewsPaused] = useState(false);

  useEffect(() => {
    api.getServices()
      .then(setServices)
      .catch(() => {
        setServices(getServices() as ServiceRecord[]);
      });
  }, []);

  useEffect(() => {
    if (reviewsPaused || reviewImages.length <= 1) return;
    const id = window.setInterval(() => {
      setReviewIndex((i) => (i + 1) % reviewImages.length);
    }, 4500);
    return () => window.clearInterval(id);
  }, [reviewsPaused]);

  const prevReview = () =>
    setReviewIndex((i) => (i - 1 + reviewImages.length) % reviewImages.length);
  const nextReview = () =>
    setReviewIndex((i) => (i + 1) % reviewImages.length);

  const handleHeroBuy = () => {
    const first = services[0];
    if (first) {
      const price = typeof first.price === "number" ? first.price : parseFloat(String(first.price)) || 0;
      update({ selectedService: { id: first.id, title: first.title, price } });
    }
    navigate("/checkout");
  };

  const firstBenefit = benefits[0];
  const FirstBenefitIcon = firstBenefit.icon;

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Trust bar */}
      <div className="bg-primary text-primary-foreground py-1.5 sm:py-2.5 text-center text-xs sm:text-sm font-medium flex flex-wrap items-center justify-center gap-2 sm:gap-4 md:gap-8">
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="h-4 w-4 inline" />
          NJ Licensed Dealer
        </span>
        <span>NJ MVC Official Processing</span>
        <span>DMV Verified</span>
        <span>Temporary Tags</span>
        <span>Secure Payments</span>
      </div>

      {/* Hero */}
      <section className="relative overflow-hidden bg-foreground">
        <img src={heroBg} alt="" className="absolute inset-0 w-full h-full object-cover object-center opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-b from-foreground/90 to-foreground" />
        <div className="relative container py-6 sm:py-10 md:py-20 text-center">
          <h1 className="font-display text-xl sm:text-2xl md:text-4xl lg:text-5xl font-extrabold text-white mb-2 sm:mb-4 leading-tight">
            New Jersey Temporary Tags —<br />
            <span className="text-primary">Same Day • DMV Verified</span>
          </h1>
          <p className="text-sm sm:text-lg text-white/90 max-w-2xl mx-auto mb-3 sm:mb-6">
            Get legal NJ temporary plates + registration.<br className="hidden sm:block" />
            Instant email, 1-hour local delivery, or FedEx delivery.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 justify-center mb-4 sm:mb-8">
            <button
              type="button"
              onClick={handleHeroBuy}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 sm:px-8 py-3 sm:py-4 font-bold text-primary-foreground hover:bg-primary/90 transition-all text-base sm:text-lg"
            >
              BUY IT NOW
              <ArrowRight className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={handleHeroBuy}
              className="inline-flex items-center justify-center gap-2 rounded-lg border-2 border-white px-6 sm:px-8 py-3 sm:py-4 font-bold text-white hover:bg-white/10 transition-all text-base sm:text-lg"
            >
              GET MY TEMP TAG
            </button>
          </div>
          <div className="hidden sm:flex flex-wrap items-center justify-center gap-6 text-sm text-white/80">
            <span>✔ Licensed Dealer</span>
            <span>✔ Official NJ MVC Processing</span>
            <span>✔ Temp Plates</span>
            <span>✔ 30-Day Validity</span>
          </div>
        </div>
      </section>

      {/* Benefits grid — compact review slideshow sits above Same Day Processing */}
      <section className="container pt-2 pb-6 sm:py-8 md:py-12 -mt-6 sm:-mt-2 md:-mt-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          <div className="flex flex-col gap-2 sm:gap-4 min-w-0 -mt-1 sm:mt-0">
            <div className="rounded-xl border border-border bg-muted/40 p-2 sm:p-3 shadow-sm flex flex-col items-center">
              <p className="text-[10px] sm:text-[11px] font-semibold text-center text-muted-foreground uppercase tracking-wide mb-1 sm:mb-2">
                Real customer reviews
              </p>
              <ReviewCarouselBlock
                variant="compact"
                reviewImages={reviewImages}
                reviewIndex={reviewIndex}
                setReviewsPaused={setReviewsPaused}
                prevReview={prevReview}
                nextReview={nextReview}
                onJumpTo={setReviewIndex}
              />
            </div>
            <div className="flex gap-4 p-4 sm:p-6 rounded-xl bg-card border border-border shadow-sm hover:shadow-md transition-shadow">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <FirstBenefitIcon className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-display font-semibold text-foreground mb-1">{firstBenefit.title}</h3>
                <p className="text-sm text-muted-foreground">{firstBenefit.desc}</p>
              </div>
            </div>
          </div>
          {benefits.slice(1).map((b) => (
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl mx-auto">
            <div className="flex gap-4 p-6 rounded-xl bg-card border border-border shadow-sm">
              <Mail className="h-10 w-10 text-primary shrink-0" />
              <div>
                <h3 className="font-display font-semibold text-foreground mb-1">Instant Email Delivery</h3>
                <p className="text-sm text-muted-foreground">Receive your temp tag and registration via email. Print and go.</p>
              </div>
            </div>
            <div className="flex gap-4 p-6 rounded-xl bg-card border border-border shadow-sm">
              <Truck className="h-10 w-10 text-primary shrink-0" />
              <div>
                <h3 className="font-display font-semibold text-foreground mb-1">1-Hour Local Car Delivery</h3>
                <p className="text-sm text-muted-foreground">Same-day driver delivery in select NJ areas. Get your physical temp tag in hand.</p>
              </div>
            </div>
            <div className="flex gap-4 p-6 rounded-xl bg-card border border-border shadow-sm">
              <Package className="h-10 w-10 text-primary shrink-0" />
              <div>
                <h3 className="font-display font-semibold text-foreground mb-1">FedEx Delivery</h3>
                <p className="text-sm text-muted-foreground">Next business day delivery anywhere. Add $50 at checkout.</p>
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

      {/* Review screenshots slideshow */}
      <section className="py-12 md:py-16 bg-muted/40">
        <div className="container">
          <h2 className="font-display text-2xl md:text-3xl font-bold text-center text-foreground mb-3">
            Real Customer Reviews
          </h2>
          <p className="text-muted-foreground text-center mb-8">
            Screenshots from actual customers after they got their plates.
          </p>
          <ReviewCarouselBlock
            variant="featured"
            reviewImages={reviewImages}
            reviewIndex={reviewIndex}
            setReviewsPaused={setReviewsPaused}
            prevReview={prevReview}
            nextReview={nextReview}
            onJumpTo={setReviewIndex}
          />
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
              {["Temp Plate", "Temporary Registration", "30-Day Validity"].map((item) => (
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
