// What a signed-in member must do before seeing anything, given the
// session's assurance level and the user as the Auth server returned it.
//
// The factor list comes from that fresh user, never from the copy in the
// cookie: after an admin resets someone's two-factor, the cookie still
// lists the old factor until the token refreshes, and trusting it sent the
// partner back and forth between "enter your code" and "set up two-factor".
export function authStep(currentLevel, user) {
  if (currentLevel === "aal2") return "ok";
  const enrolled = (user?.factors ?? []).some((f) => f.status === "verified");
  return enrolled ? "needs-code" : "needs-2fa-setup";
}
