import { describe, expect, it } from "vitest";
import { EMAIL_TEMPLATES, renderEmail } from "./templates";

const data = { link: "https://gmb.axxeler.in/x?token=abc", agencyName: "Axxeler", businessName: "Sunrise Dental", agencyEmail: "agency@gmail.com", title: "Title", body: "Body" };

describe("renderEmail", () => {
  it.each(EMAIL_TEMPLATES)("renders %s with HTML and a plain-text fallback", (template) => {
    const email = renderEmail(template, data);
    expect(email.subject.length).toBeGreaterThan(0);
    expect(email.text.length).toBeGreaterThan(0);
    expect(email.html).toContain("#7c3aed");
  });

  it("puts the link in both formats", () => {
    const email = renderEmail("reset_password", data);
    expect(email.text).toContain(data.link);
    expect(email.html).toContain(data.link);
  });

  it("tells the client to add the agency Gmail as Manager", () => {
    const { text } = renderEmail("client_invite", data);
    expect(text).toContain("People and access");
    expect(text).toContain("agency@gmail.com");
    expect(text).toContain("Manager");
  });

  it("escapes customer text in the HTML", () => {
    const { html } = renderEmail("negative_review", { ...data, body: '<script>alert(1)</script><a href="x">' });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("keeps line breaks out of subjects", () => {
    expect(renderEmail("failed_job", { ...data, title: "One\r\nBcc: x@y.com" }).subject).toBe("One Bcc: x@y.com");
  });
});
