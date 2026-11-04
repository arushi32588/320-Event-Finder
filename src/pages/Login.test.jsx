import { afterEach, describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Routes, Route } from "react-router";
import Login from "./Login.jsx";
import { getSession } from "../lib/api.js";
import { fail, mockApi, profile, renderPage, resetApi } from "../test/api.jsx";

const session = { accessToken: "token-1", refreshToken: "refresh-1", expiresAt: 1 };
const success = {
  "POST /api/auth/login": { user: { id: "user-1" }, session },
  "GET /api/me/profile": { profile: profile() },
};

function renderLogin(initial = "/login") {
  return renderPage(
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<h1>Home page</h1>} />
      <Route path="/saved" element={<h1>Saved page</h1>} />
      <Route path="/signup" element={<h1>Signup page</h1>} />
    </Routes>,
    { route: initial },
  );
}

const emailField = () => screen.getByLabelText("Email");
const passwordField = () => screen.getByLabelText("Password");
const submit = () => screen.getByRole("button", { name: "Log In" });

afterEach(resetApi);

describe("Login: page content", () => {
  it("shows the heading and subtitle", () => {
    renderLogin();
    expect(screen.getByRole("heading", { level: 1, name: "Welcome back" })).toBeInTheDocument();
    expect(screen.getByText("Log in to discover and save events.")).toBeInTheDocument();
  });

  it("has an email field and a masked password field, each linked to its label", () => {
    renderLogin();
    expect(emailField()).toHaveAttribute("type", "email");
    expect(passwordField()).toHaveAttribute("type", "password");
  });

  it("shows Google and forgot-password as not available yet", () => {
    renderLogin();
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeDisabled();
    expect(screen.getByText("Forgot password?")).toHaveAttribute("title", "Coming soon");
  });

  it("the remember-me box starts unchecked and toggles", async () => {
    const user = userEvent.setup();
    renderLogin();
    const box = screen.getByRole("checkbox", { name: "Remember me" });
    expect(box).not.toBeChecked();
    await user.click(box);
    expect(box).toBeChecked();
  });
});

describe("Login: logging in", () => {
  async function logIn(user, { email = "maya@example.org", password = "secret-pass" } = {}) {
    await user.type(emailField(), email);
    await user.type(passwordField(), password);
    await user.click(submit());
  }

  it("sends the email and password, stores the login and goes home", async () => {
    const { callsTo } = mockApi(success);
    const user = userEvent.setup();
    renderLogin();
    await logIn(user);
    expect(await screen.findByRole("heading", { name: "Home page" })).toBeInTheDocument();
    expect(callsTo("POST", "/api/auth/login")[0].body).toEqual({ email: "maya@example.org", password: "secret-pass" });
    expect(getSession().accessToken).toBe("token-1");
  });

  it("goes back to the page that asked for a login", async () => {
    mockApi(success);
    const user = userEvent.setup();
    renderLogin({ pathname: "/login", state: { from: "/saved" } });
    await logIn(user);
    expect(await screen.findByRole("heading", { name: "Saved page" })).toBeInTheDocument();
  });

  it("pressing Enter in the password field submits", async () => {
    const { callsTo } = mockApi(success);
    const user = userEvent.setup();
    renderLogin();
    await user.type(emailField(), "maya@example.org");
    await user.type(passwordField(), "secret-pass{Enter}");
    await screen.findByRole("heading", { name: "Home page" });
    expect(callsTo("POST", "/api/auth/login")).toHaveLength(1);
  });

  it("keeps the login after closing the browser only with remember me", async () => {
    mockApi(success);
    const user = userEvent.setup();
    renderLogin();
    await user.click(screen.getByRole("checkbox", { name: "Remember me" }));
    await logIn(user);
    await screen.findByRole("heading", { name: "Home page" });
    expect(localStorage.getItem("event-finder-session")).toContain("token-1");
    expect(sessionStorage.getItem("event-finder-session")).toBeNull();
  });

  it("shows the error for a wrong password, stays on the page and keeps the email", async () => {
    mockApi({ "POST /api/auth/login": fail(401, "Incorrect email or password.") });
    const user = userEvent.setup();
    renderLogin();
    await logIn(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect email or password.");
    expect(emailField()).toHaveValue("maya@example.org");
    expect(submit()).toBeEnabled();
    expect(getSession()).toBeNull();
  });

  it("marks the fields the backend says are invalid", async () => {
    mockApi({
      "POST /api/auth/login": fail(400, "Please fix the highlighted fields.", {
        email: "Email is required.",
        password: "Password is required.",
      }),
    });
    const user = userEvent.setup();
    renderLogin();
    await user.click(submit());
    await screen.findByRole("alert");
    expect(emailField()).toHaveAttribute("aria-invalid", "true");
    expect(passwordField()).toHaveAttribute("aria-invalid", "true");
  });

  it("shows a message when the backend isn't set up yet", async () => {
    mockApi({ "POST /api/auth/login": fail(503, "Accounts are not available yet: Supabase is not configured.") });
    const user = userEvent.setup();
    renderLogin();
    await logIn(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("Accounts are not available yet");
  });
});

describe("Login: links and keyboard", () => {
  it("clicking 'Create account' navigates to the signup route", async () => {
    const user = userEvent.setup();
    renderLogin();
    await user.click(screen.getByRole("link", { name: "Create account" }));
    expect(screen.getByRole("heading", { name: "Signup page" })).toBeInTheDocument();
  });

  it("Tab moves through the form in a sensible order", async () => {
    const user = userEvent.setup();
    renderLogin();
    await user.tab();
    expect(emailField()).toHaveFocus();
    await user.tab();
    expect(passwordField()).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("checkbox", { name: "Remember me" })).toHaveFocus();
    await user.tab();
    expect(submit()).toHaveFocus();
  });
});
