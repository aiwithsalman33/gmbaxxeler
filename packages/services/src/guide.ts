export function guideMessage(input: { businessName: string; agencyEmail: string | null; reminder?: boolean }): { subject: string; text: string } {
  const email = input.agencyEmail ?? "[connect your agency Google account first]";
  const lead = input.reminder
    ? `Quick reminder: we still need access to manage ${input.businessName} on Google.`
    : `To start managing ${input.businessName} on Google, we need Manager access to your Business Profile.`;
  return {
    subject: `Give us access to ${input.businessName} on Google`,
    text: [
      "Hi,",
      "",
      lead,
      "",
      "1. Open https://business.google.com and sign in",
      "2. Open your Business Profile, then Menu > Business Profile settings",
      "3. Choose People and access > Add",
      `4. Enter ${email}`,
      "5. Set the role to Manager and tap Invite",
      "",
      "That's it. We'll accept automatically and let you know once it's connected.",
    ].join("\n"),
  };
}

export function whatsappLink(phone: string | null | undefined, text: string): string | null {
  if (!phone) return null;
  return `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}
