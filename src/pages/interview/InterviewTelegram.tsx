import { Link } from "react-router-dom";
import { ArrowRight, ExternalLink, MessageCircle } from "lucide-react";
import { InterviewLayout, InterviewOutlineButton, InterviewPillButton } from "@/components/interview/InterviewLayout";
import { useSeo } from "@/hooks/useSeo";

const downloads = [
  { label: "iPhone / iPad", href: "https://apps.apple.com/app/telegram-messenger/id686449807" },
  { label: "Android", href: "https://play.google.com/store/apps/details?id=org.telegram.messenger" },
  { label: "Desktop / Web", href: "https://web.telegram.org" },
];

export default function InterviewTelegram() {
  useSeo({
    title: "Telegram Setup — TriStateTags",
    description: "Install Telegram and set your @username before applying.",
  });

  return (
    <InterviewLayout>
      <div className="mx-auto max-w-2xl">
        <div className="flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
            <MessageCircle className="h-7 w-7" />
          </div>
        </div>
        <h1 className="mt-6 text-center font-display text-4xl md:text-5xl font-bold tracking-tight">
          Why we need Telegram
        </h1>
        <p className="mt-4 text-center text-muted-foreground text-lg leading-relaxed">
          Supervisors and dispatch contact drivers through Telegram after hire.
          Install the app and set a public <strong className="text-foreground">@username</strong> before you apply.
        </p>

        <div className="mt-12 rounded-3xl border border-black/5 bg-white p-8 shadow-sm">
          <h2 className="font-display text-xl font-bold">Download</h2>
          <ul className="mt-4 space-y-3">
            {downloads.map((d) => (
              <li key={d.label}>
                <a
                  href={d.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-violet-600 font-medium hover:underline"
                >
                  {d.label}
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-6 rounded-3xl border border-violet-100 bg-violet-50/50 p-8 shadow-sm">
          <h2 className="font-display text-xl font-bold">Link Telegram to the application</h2>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            The form needs your numeric Telegram ID for hire. Open our bot once, tap Start, then use Verify on the application.
          </p>
          <a
            href="https://t.me/krabinterviewerbot?start=web_apply"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background hover:bg-foreground/90"
          >
            Open @krabinterviewerbot
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>

        <div className="mt-6 rounded-3xl border border-black/5 bg-white p-8 shadow-sm">
          <h2 className="font-display text-xl font-bold">Set your @username</h2>
          <ol className="mt-4 space-y-3 text-muted-foreground list-decimal list-inside text-sm leading-relaxed">
            <li>Open Telegram and sign in with your phone number.</li>
            <li>Go to <strong className="text-foreground">Settings</strong>.</li>
            <li>Tap <strong className="text-foreground">Username</strong> and choose a unique name.</li>
            <li>On the application, enter <code className="rounded bg-black/5 px-1.5 py-0.5 text-foreground">@yourname</code> and tap Verify.</li>
          </ol>
        </div>

        <div className="mt-12 flex flex-wrap justify-center gap-4">
          <InterviewPillButton to="/interview/requirements">
            Requirements
            <ArrowRight className="h-4 w-4" />
          </InterviewPillButton>
          <InterviewOutlineButton to="/interview/apply">Go to application</InterviewOutlineButton>
        </div>
      </div>
    </InterviewLayout>
  );
}
