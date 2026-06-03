import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Clock, CreditCard, Home, MessageCircle, Shield, Smartphone, UserCheck } from "lucide-react";
import { InterviewLayout, InterviewPillButton } from "@/components/interview/InterviewLayout";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useSeo } from "@/hooks/useSeo";

const requirements = [
  { icon: Shield, title: "Valid driver's license", desc: "Current license in good standing; number + photo on the application." },
  { icon: Smartphone, title: "Reliable smartphone", desc: "Phone and email for scheduling and onboarding." },
  { icon: MessageCircle, title: "Telegram with @username", desc: "All hire communication runs through Telegram.", link: "/interview/telegram" },
  { icon: Clock, title: "Work commitment", desc: "Honest availability — hours, days, and schedule." },
  { icon: Home, title: "Mailing address", desc: "For paperwork and shipments after you're hired." },
  { icon: CreditCard, title: "Payment method", desc: "CashApp, Venmo, Zelle, or similar on your application." },
  { icon: UserCheck, title: "Emergency contact", desc: "Name and phone of someone we can reach if needed." },
  { icon: Shield, title: "Professional conduct", desc: "One application per person; accurate info; no duplicate Telegram usernames." },
];

export default function InterviewRequirements() {
  const [confirmed, setConfirmed] = useState(false);

  useSeo({
    title: "Driver Requirements — TriStateTags",
    description: "Requirements to apply as a TriStateTags driver.",
  });

  return (
    <InterviewLayout>
      <div className="mx-auto max-w-2xl">
        <h1 className="font-display text-4xl md:text-5xl font-bold tracking-tight text-center">
          Driver requirements
        </h1>
        <p className="mt-4 text-center text-muted-foreground text-lg">
          Confirm you meet each item. Supervisors review every application on Telegram.
        </p>

        <div className="mt-12 rounded-3xl border border-black/5 bg-white shadow-sm overflow-hidden">
          <ul className="divide-y divide-black/5">
            {requirements.map((r) => (
              <li key={r.title} className="flex gap-5 p-6 md:p-7">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
                  <r.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">{r.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                    {r.desc}
                    {r.link && (
                      <>
                        {" "}
                        <Link to={r.link} className="text-violet-600 font-medium hover:underline">
                          Setup guide →
                        </Link>
                      </>
                    )}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-8 flex items-start gap-4 rounded-2xl border border-black/5 bg-white p-6">
          <Checkbox
            id="req-confirm"
            checked={confirmed}
            onCheckedChange={(v) => setConfirmed(v === true)}
            className="mt-0.5"
          />
          <Label htmlFor="req-confirm" className="text-sm leading-relaxed cursor-pointer font-normal">
            I have read the requirements, I have (or will set up) Telegram with an @username, and I am ready to
            complete the application honestly.
          </Label>
        </div>

        <div className="mt-10 flex flex-col items-center gap-4">
          {confirmed ? (
            <InterviewPillButton to="/interview/apply">
              Continue to application
              <ArrowRight className="h-4 w-4" />
            </InterviewPillButton>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-full bg-black/5 px-8 py-3.5 text-sm font-semibold text-muted-foreground cursor-not-allowed">
              Check the box above to continue
            </span>
          )}
          <Link to="/interview" className="text-sm text-muted-foreground hover:text-foreground">
            ← Back to overview
          </Link>
        </div>
      </div>
    </InterviewLayout>
  );
}
