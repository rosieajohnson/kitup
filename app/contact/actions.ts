"use server";

// Server-only: the support inbox is never sent to the browser.
const SUPPORT_RECIPIENT = "rosieajohnson@gmail.com";

export interface ContactInput {
  name: string;
  email: string;
  subject: string;
  message: string;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Send a contact-form message to the support inbox via Resend. The
 * sender's address is set as reply-to so replies go straight back to
 * them. The support address stays server-side and is never exposed.
 */
export async function sendContactMessage(
  input: ContactInput,
): Promise<{ ok?: boolean; error?: string }> {
  const name = input.name?.trim() ?? "";
  const email = input.email?.trim() ?? "";
  const subject = input.subject?.trim() ?? "";
  const message = input.message?.trim() ?? "";

  if (!name || !email || !subject || !message) {
    return { error: "Please fill in every field." };
  }
  if (!EMAIL_RE.test(email)) {
    return { error: "Please enter a valid email address." };
  }
  if (message.length > 5000) {
    return { error: "That message is a bit long — please keep it under 5000 characters." };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return {
      error:
        "Messaging isn't set up yet. Please try again later.",
    };
  }

  const from = process.env.CONTACT_FROM_EMAIL || "Kit Up <onboarding@resend.dev>";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [SUPPORT_RECIPIENT],
        reply_to: email,
        subject: `[Kit Up] ${subject}`,
        text: `New contact message from the Kit Up website.\n\nName: ${name}\nEmail: ${email}\n\n${message}`,
      }),
    });

    if (!res.ok) {
      console.error(
        "sendContactMessage: Resend failed",
        res.status,
        await res.text(),
      );
      return { error: "Sorry, we couldn't send your message. Please try again." };
    }
    return { ok: true };
  } catch (err) {
    console.error("sendContactMessage: error", err);
    return { error: "Sorry, we couldn't send your message. Please try again." };
  }
}
