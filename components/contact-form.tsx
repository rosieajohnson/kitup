"use client";

import { useState, useTransition } from "react";
import { Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sendContactMessage } from "@/app/contact/actions";

export function ContactForm() {
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const input = {
      name: String(fd.get("name") ?? ""),
      email: String(fd.get("email") ?? ""),
      subject: String(fd.get("subject") ?? ""),
      message: String(fd.get("message") ?? ""),
    };

    startTransition(async () => {
      const result = await sendContactMessage(input);
      if (result.error) setError(result.error);
      else {
        setSent(true);
        form.reset();
      }
    });
  }

  if (sent) {
    return (
      <div className="rounded-xl border border-line bg-surface p-8 text-center shadow-card">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-turf/15 text-turf-dark">
          <MailCheck className="h-6 w-6" aria-hidden />
        </div>
        <h2 className="font-display text-xl font-bold text-ink">
          Message sent
        </h2>
        <p className="mt-2 text-ink-soft">
          Thanks for getting in touch — we&apos;ll reply to the email you gave.
        </p>
        <div className="mt-6">
          <Button variant="outline" onClick={() => setSent(false)}>
            Send another
          </Button>
        </div>
      </div>
    );
  }

  const labelCls = "mb-1.5 block text-sm font-semibold text-ink";
  const inputCls =
    "w-full rounded-lg border border-line-strong bg-canvas px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30";

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-xl border border-line bg-surface p-6 shadow-card"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className={labelCls}>
            Your name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            autoComplete="name"
            placeholder="Alex Smith"
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="email" className={labelCls}>
            Your email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@email.com"
            className={inputCls}
          />
        </div>
      </div>

      <div>
        <label htmlFor="subject" className={labelCls}>
          Subject
        </label>
        <input
          id="subject"
          name="subject"
          type="text"
          required
          placeholder="What's this about?"
          className={inputCls}
        />
      </div>

      <div>
        <label htmlFor="message" className={labelCls}>
          Message
        </label>
        <textarea
          id="message"
          name="message"
          required
          rows={6}
          placeholder="How can we help?"
          className={`${inputCls} resize-y`}
        />
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-coral/10 px-3 py-2 text-sm font-medium text-coral-dark"
        >
          {error}
        </p>
      )}

      <Button type="submit" size="lg" disabled={pending}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {pending ? "Sending…" : "Send message"}
      </Button>
    </form>
  );
}
