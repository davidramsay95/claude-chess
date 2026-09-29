export interface AccountMenuOptions {
  fetcher?: typeof fetch;
  /** Performs the full-page redirect to the sign-in provider. */
  navigate?: (url: string) => void;
}

interface SessionUser {
  name: string;
}

type Provider = "google" | "github";

const PROVIDERS: ReadonlyArray<{ id: Provider; label: string }> = [
  { id: "google", label: "Continue with Google" },
  { id: "github", label: "Continue with GitHub" },
];

const button = (label: string, onClick: () => void): HTMLButtonElement => {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = label;
  element.addEventListener("click", onClick);
  return element;
};

/** Renders sign-in or the signed-in user into the container, backed by the Better Auth endpoints. */
export const mountAccountMenu = (
  container: HTMLElement,
  { fetcher = fetch.bind(globalThis), navigate = (url) => window.location.assign(url) }: AccountMenuOptions = {},
): void => {
  let user: SessionUser | null = null;
  let pickerOpen = false;
  let errorMessage: string | null = null;

  const loadSession = async (): Promise<void> => {
    try {
      const response = await fetcher("/api/auth/get-session", { credentials: "same-origin" });
      const session = (await response.json()) as { user: SessionUser } | null;
      user = session?.user ?? null;
    } catch (error) {
      console.error("Could not check the sign-in session", error);
      user = null;
    }
    render();
  };

  const signIn = async (provider: Provider): Promise<void> => {
    errorMessage = null;
    try {
      const response = await fetcher("/api/auth/sign-in/social", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider, callbackURL: window.location.href }),
      });
      const body = (await response.json()) as { url?: string };
      if (!response.ok || body.url === undefined) {
        throw new Error(`Sign-in responded with ${response.status}`);
      }
      navigate(body.url);
      return;
    } catch (error) {
      console.error("Could not start sign-in", error);
      errorMessage = "Could not start sign-in. Please try again.";
    }
    render();
  };

  const signOut = async (): Promise<void> => {
    errorMessage = null;
    try {
      const response = await fetcher("/api/auth/sign-out", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (!response.ok) {
        throw new Error(`Sign-out responded with ${response.status}`);
      }
      user = null;
      pickerOpen = false;
    } catch (error) {
      console.error("Could not sign out", error);
      errorMessage = "Could not sign out. Please try again.";
    }
    render();
  };

  const createErrorAlert = (): HTMLElement => {
    const alert = document.createElement("p");
    alert.setAttribute("role", "alert");
    alert.className = "account-error";
    alert.textContent = errorMessage;
    return alert;
  };

  const render = (): void => {
    const children: HTMLElement[] = [];
    // The error joins the open picker so the two never overlap.
    let errorPlacedInPicker = false;

    if (user !== null) {
      const name = document.createElement("span");
      name.className = "account-name";
      name.textContent = user.name;
      children.push(name, button("Sign out", () => void signOut()));
    } else {
      children.push(
        button("Sign in", () => {
          pickerOpen = !pickerOpen;
          render();
        }),
      );
      if (pickerOpen) {
        const picker = document.createElement("div");
        picker.className = "account-picker";
        picker.append(...PROVIDERS.map(({ id, label }) => button(label, () => void signIn(id))));
        if (errorMessage !== null) {
          picker.append(createErrorAlert());
          errorPlacedInPicker = true;
        }
        children.push(picker);
      }
    }

    if (errorMessage !== null && !errorPlacedInPicker) {
      children.push(createErrorAlert());
    }

    container.replaceChildren(...children);
  };

  void loadSession();
};
