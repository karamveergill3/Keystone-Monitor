import { buttonClass } from "@/lib/ui";
import { APP_NAME } from "@/lib/site";

export const metadata = { title: "Continue" };

const TYPES = new Set(["invite", "recovery"]);

// Where an invite or password link lands. It only shows a button.
//
// OPENING THE LINK MUST NOT USE IT. The token is single-use, and WhatsApp,
// Telegram and iMessage all fetch a link to build its preview the moment
// it is pasted. If this page spent the token on a GET, the preview would
// use it up (and be handed the session) before the partner ever tapped
// it. Previewers do not submit forms, so the token is spent only by the
// POST behind this button.
export default async function ConfirmPage({ searchParams }) {
  const params = await searchParams;
  const tokenHash = typeof params?.token_hash === "string" ? params.token_hash : "";
  const type = typeof params?.type === "string" ? params.type : "";
  const valid = TYPES.has(type) && /^[A-Za-z0-9_-]{8,200}$/.test(tokenHash);

  if (!valid) {
    return (
      <div className="space-y-3">
        <h1 className="text-lg font-semibold">Link not recognised</h1>
        <p className="text-sm text-muted">Ask an admin for a new link.</p>
      </div>
    );
  }

  return (
    <form action="/auth/confirm" method="post" className="space-y-4">
      <input type="hidden" name="token_hash" value={tokenHash} />
      <input type="hidden" name="type" value={type} />
      <h1 className="text-lg font-semibold">
        {type === "invite" ? `You're invited to ${APP_NAME}` : "Reset your password"}
      </h1>
      <p className="text-sm text-muted">
        {type === "invite"
          ? "Next you choose a password and set up an authenticator app."
          : "Next you choose a new password."}
      </p>
      <button type="submit" className={`${buttonClass} w-full`}>Continue</button>
    </form>
  );
}
