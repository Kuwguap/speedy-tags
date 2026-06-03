import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, ClipboardList, MessageCircle, Sparkles } from "lucide-react";
import { InterviewLayout, InterviewOutlineButton, InterviewPillButton } from "@/components/interview/InterviewLayout";
import { useSeo } from "@/hooks/useSeo";

const steps = [
  {
    icon: ClipboardList,
    title: "Check requirements",
    desc: "License, phone, Telegram @username, and honest availability.",
  },
  {
    icon: Sparkles,
    title: "Submit application",
    desc: "Auto-saving form with license upload — about 10 minutes.",
  },
  {
    icon: CheckCircle2,
    title: "Supervisor review",
    desc: "We reach out on Telegram. Hired drivers get dispatch onboarding.",
  },
];

const prep = [
  { title: "Phone & email", desc: "Active contact info for scheduling." },
  { title: "Driver's license", desc: "Number + clear photo upload." },
  { title: "Telegram @username", desc: "Required for all hire communication." },
  { title: "Payment method", desc: "CashApp, Venmo, Zelle, or similar." },
];

export default function InterviewLanding() {
  useSeo({
    title: "Become a Driver — TriStateTags",
    description: "Join our driver team. Review requirements and apply online.",
  });

  return (
    <InterviewLayout>
      <section className="relative mx-auto max-w-5xl overflow-hidden rounded-[2rem] md:rounded-[2.5rem] bg-gradient-to-br from-violet-600 via-purple-500 to-amber-300 px-6 py-16 md:px-14 md:py-24 text-center shadow-2xl shadow-violet-500/20">
        <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-white/95 backdrop-blur-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
          Now hiring — independent drivers
        </p>
        <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold text-white tracking-tight leading-[1.1] max-w-3xl mx-auto">
          Where your next driving opportunity takes shape
        </h1>
        <p className="mt-6 text-lg md:text-xl text-white/85 max-w-2xl mx-auto leading-relaxed">
          TriStateTags connects you with dispatch and leads after a quick interview.
          Review requirements first, then complete your application.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <InterviewPillButton to="/interview/requirements">
            View requirements
            <ArrowRight className="h-4 w-4" />
          </InterviewPillButton>
          <InterviewOutlineButton
            to="/interview/telegram"
            className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
          >
            <MessageCircle className="h-4 w-4" />
            Set up Telegram
          </InterviewOutlineButton>
        </div>
      </section>

      <section className="mx-auto max-w-5xl mt-20 md:mt-28">
        <h2 className="text-center font-display text-3xl md:text-4xl font-bold tracking-tight">How hiring works</h2>
        <p className="text-center text-muted-foreground mt-3 max-w-xl mx-auto">
          Three focused steps from interest to onboarding with our supervisors.
        </p>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {steps.map((s) => (
            <div
              key={s.title}
              className="rounded-3xl border border-black/5 bg-white p-8 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
                <s.icon className="h-6 w-6" />
              </div>
              <h3 className="mt-5 font-display text-xl font-bold">{s.title}</h3>
              <p className="mt-2 text-muted-foreground text-sm leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl mt-20">
        <h2 className="text-center font-display text-2xl md:text-3xl font-bold">Have these ready</h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {prep.map((item) => (
            <div
              key={item.title}
              className="flex gap-4 rounded-2xl border border-black/5 bg-white p-6"
            >
              <div className="h-2 w-2 mt-2 rounded-full bg-violet-500 shrink-0" />
              <div>
                <h3 className="font-semibold">{item.title}</h3>
                <p className="text-sm text-muted-foreground mt-1">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-3xl mt-20 text-center rounded-3xl border border-violet-200/60 bg-gradient-to-b from-violet-50 to-white px-8 py-14">
        <h2 className="font-display text-2xl md:text-3xl font-bold">Ready to see if you qualify?</h2>
        <p className="mt-3 text-muted-foreground">Read the checklist, then open the application.</p>
        <InterviewPillButton to="/interview/requirements" className="mt-8">
          Continue to requirements
          <ArrowRight className="h-4 w-4" />
        </InterviewPillButton>
      </section>
    </InterviewLayout>
  );
}
