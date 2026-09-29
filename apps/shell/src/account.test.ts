import { beforeEach, describe, expect, it, vi } from "vitest";
import { mountAccountMenu } from "./account.ts";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const flush = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const signedInSession = { user: { id: "u1", name: "Ada Lovelace", email: "ada@example.com" } };

let container: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = '<div id="account"></div>';
  container = document.getElementById("account") as HTMLElement; // Created on the line above.
});

const buttonLabelled = (label: string): HTMLButtonElement => {
  const match = [...container.querySelectorAll("button")].find((button) => button.textContent === label);
  if (match === undefined) {
    throw new Error(`No button labelled "${label}"; found: ${container.textContent}`);
  }
  return match;
};

describe("mountAccountMenu when signed out", () => {
  it("offers a sign-in button and hides the providers until it is clicked", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse(null));
    mountAccountMenu(container, { fetcher, navigate: vi.fn() });
    await flush();

    expect(buttonLabelled("Sign in")).toBeTruthy();
    expect(container.textContent).not.toContain("Google");

    buttonLabelled("Sign in").click();
    expect(buttonLabelled("Continue with Google")).toBeTruthy();
    expect(buttonLabelled("Continue with GitHub")).toBeTruthy();
  });

  it("starts the provider flow and navigates to the URL the server returns", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(null))
      .mockResolvedValueOnce(jsonResponse({ url: "https://accounts.google.com/auth?x=1", redirect: true }));
    const navigate = vi.fn();
    mountAccountMenu(container, { fetcher, navigate });
    await flush();

    buttonLabelled("Sign in").click();
    buttonLabelled("Continue with Google").click();
    await flush();

    const [url, init] = fetcher.mock.calls[1] as [string, RequestInit];
    expect(url).toBe("/api/auth/sign-in/social");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ provider: "google", callbackURL: window.location.href });
    expect(navigate).toHaveBeenCalledWith("https://accounts.google.com/auth?x=1");
  });

  it("shows an error message when starting sign-in fails", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(jsonResponse(null)).mockResolvedValueOnce(jsonResponse({}, 500));
    const navigate = vi.fn();
    mountAccountMenu(container, { fetcher, navigate });
    await flush();

    buttonLabelled("Sign in").click();
    buttonLabelled("Continue with GitHub").click();
    await flush();

    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Could not start sign-in");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("falls back to the signed-out state and reports the error when the session check fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetcher = vi.fn().mockRejectedValue(new Error("network down"));
    mountAccountMenu(container, { fetcher, navigate: vi.fn() });
    await flush();

    expect(buttonLabelled("Sign in")).toBeTruthy();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe("mountAccountMenu when signed in", () => {
  it("shows the user's name and a sign-out button", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse(signedInSession));
    mountAccountMenu(container, { fetcher, navigate: vi.fn() });
    await flush();

    expect(container.textContent).toContain("Ada Lovelace");
    expect(buttonLabelled("Sign out")).toBeTruthy();
    expect(container.textContent).not.toContain("Sign in");
  });

  it("signs out and returns to the signed-out state", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(signedInSession))
      .mockResolvedValueOnce(jsonResponse({ success: true }));
    mountAccountMenu(container, { fetcher, navigate: vi.fn() });
    await flush();

    buttonLabelled("Sign out").click();
    await flush();

    const [url, init] = fetcher.mock.calls[1] as [string, RequestInit];
    expect(url).toBe("/api/auth/sign-out");
    expect(init.method).toBe("POST");
    expect(buttonLabelled("Sign in")).toBeTruthy();
  });
});
