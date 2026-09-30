import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import config from "../vite.config.ts";

const shellRoot = resolve(import.meta.dirname, "..");

const loadPage = (fileName: string): Document =>
  new DOMParser().parseFromString(readFileSync(resolve(shellRoot, fileName), "utf8"), "text/html");

const pages = [
  { route: "terms-of-service", title: "Terms of Service", otherRoute: "/privacy-policy" },
  { route: "privacy-policy", title: "Privacy Policy", otherRoute: "/terms-of-service" },
];

describe.each(pages)("$route page", ({ route, title, otherRoute }) => {
  const page = loadPage(`${route}.html`);

  it("has a matching document title and heading", () => {
    expect(page.title).toBe(`${title} | Claude Chess`);
    expect(page.querySelector("h1")?.textContent).toBe(title);
  });

  it("states when it was last updated", () => {
    expect(page.querySelector("time[datetime]")).not.toBeNull();
  });

  it("links home and to the other legal page", () => {
    const hrefs = [...page.querySelectorAll("a")].map((anchor) => anchor.getAttribute("href"));
    expect(hrefs).toContain("/");
    expect(hrefs).toContain(otherRoute);
  });

  it("is built as its own entry so it is served at /<route>", () => {
    const input = config.build?.rollupOptions?.input as Record<string, string>;
    expect(input[route]).toBe(resolve(shellRoot, `${route}.html`));
  });
});

describe("privacy policy content", () => {
  const text = loadPage("privacy-policy.html").body.textContent ?? "";

  it.each([
    "email address",
    "IP address",
    "user agent",
    "saved games",
    "Google",
    "GitHub",
    "Cloudflare",
    "session cookie",
    "delete",
  ])("covers %s", (topic) => {
    expect(text.toLowerCase()).toContain(topic.toLowerCase());
  });
});

describe("terms of service content", () => {
  const text = loadPage("terms-of-service.html").body.textContent ?? "";

  it.each(["Acceptable use", "Your content", "Termination", "Disclaimer", "Limitation of liability", "Changes"])(
    "has a %s section",
    (section) => {
      expect(text).toContain(section);
    },
  );
});
