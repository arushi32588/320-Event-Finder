import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import Login from "./Login.jsx";

// 9 tests and 3 edge cases total

// These tests check the Login page (src/pages/Login.jsx) the way a user would use it
// Login is a static form for now (not connected to Supabase), so these tests cover what it does today: render, typing, submit behavior, links, keyboard
// Add error-message / real-login tests once auth is built

// Draws the Login page for a test
// Login uses <Link>, which only works inside a router, so we wrap it in MemoryRouter (a router that lives in memory instead of the browser's address bar)
// Also add a fake /signup route with a simple heading, so we can check that the "Create account" link really navigates somewhere
function renderLogin() {
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<h1>Signup page</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

// Small helpers so the tests below are shorter and easier to read
// emailField() -> finds the input labelled "Email"
// passwordField() -> finds the input labelled "Password"
// Finding them by their label (like a real user would) also proves each label is connected to its input
const emailField = () => screen.getByLabelText("Email");
const passwordField = () => screen.getByLabelText("Password");

describe("Login: page content", () => {
  // Checks the basics are there: the "Welcome back" heading and the subtitle
  // If the page fails to load properly, these are the first things to go
  it("shows the heading and subtitle", () => {
    renderLogin();
    expect(
      screen.getByRole("heading", { level: 1, name: "Welcome back" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Log in to discover and save events."),
    ).toBeInTheDocument();
  });

  // Checks the email field is a real email input, has its placeholder, and the password field is masked (type="password")
  // A password field that isn't masked would show passwords on screen, which is a security problem
  // Find both fields by their labels, which also proves the labels are linked to the inputs
  it("has an email field and a masked password field, each linked to its label", () => {
    renderLogin();
    expect(emailField()).toHaveAttribute("type", "email");
    expect(emailField()).toHaveAttribute("placeholder", "you@example.com");
    expect(passwordField()).toHaveAttribute("type", "password");
  });

  // Checks all the other controls on the page exist: Log In, Continue with Google, Forgot password? and Create account
  // If one of these goes missing, users lose a way to log in or recover their account
  it("shows the Log In, Google, forgot-password and sign-up controls", () => {
    renderLogin();
    expect(screen.getByRole("button", { name: "Log In" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Continue with Google" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Forgot password?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Create account" }),
    ).toBeInTheDocument();
  });
});

describe("Login: typing", () => {
  // Checks that what you type shows up in the email and password fields
  // This is the most basic thing a login form has to do
  it("shows what you type in the email and password fields", async () => {
    const user = userEvent.setup();
    renderLogin();
    await user.type(emailField(), "mariia@umass.edu");
    await user.type(passwordField(), "hunter2");
    expect(emailField()).toHaveValue("mariia@umass.edu");
    expect(passwordField()).toHaveValue("hunter2");
  });
});

describe("Login: remember me", () => {
  // The "Remember me" checkbox starts unchecked, turns on when clicked and off when clicked again
  // Checked by default would quietly keep people logged in, so we make sure it starts off
  it("starts unchecked and toggles on and off", async () => {
    const user = userEvent.setup();
    renderLogin();
    const remember = screen.getByRole("checkbox", { name: /remember me/i });
    expect(remember).not.toBeChecked();
    await user.click(remember);
    expect(remember).toBeChecked();
    await user.click(remember);
    expect(remember).not.toBeChecked();
  });
});

describe("Login: submitting", () => {
  // Submitting the form must not reload the page
  // The page calls preventDefault() on submit, and without it the browser would refresh and wipe what the user typed
  // fireEvent.submit returns false when preventDefault() was called, which is how we check it
  it("doesn't reload the page on submit (preventDefault)", () => {
    const { container } = renderLogin();
    const form = container.querySelector("form");
    // fireEvent returns false when the handler called preventDefault()
    expect(fireEvent.submit(form)).toBe(false);
  });

  // Edge Case: clicking Log In with both fields empty
  // Real users do this all the time, and the page must not crash or break
  it("clicking Log In with empty fields doesn't crash", async () => {
    const user = userEvent.setup();
    renderLogin();
    await user.click(screen.getByRole("button", { name: "Log In" }));
    expect(
      screen.getByRole("heading", { name: "Welcome back" }),
    ).toBeInTheDocument();
  });

  // Clicking Log In with filled fields should stay on the page and keep what was typed
  // Login isn't connected to Supabase yet, so nothing happens on submit, but the form shouldn't wipe the fields or send the user somewhere else
  it("clicking Log In with filled fields stays on the page and keeps the values", async () => {
    const user = userEvent.setup();
    renderLogin();
    await user.type(emailField(), "mariia@umass.edu");
    await user.type(passwordField(), "hunter2");
    await user.click(screen.getByRole("button", { name: "Log In" }));
    expect(
      screen.getByRole("heading", { name: "Welcome back" }),
    ).toBeInTheDocument();
    expect(emailField()).toHaveValue("mariia@umass.edu");
    expect(passwordField()).toHaveValue("hunter2");
  });

  // Edge Case: pressing Enter in the password field should submit the form
  // Many people log in this way instead of clicking the button
  // We listen for the form's submit event to prove the Enter key triggered it
  it("pressing Enter in the password field submits the form", async () => {
    const user = userEvent.setup();
    const { container } = renderLogin();
    const onSubmit = vi.fn((e) => e.preventDefault());
    container.querySelector("form").addEventListener("submit", onSubmit);
    await user.type(passwordField(), "hunter2{Enter}");
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  // Edge Case: the "Continue with Google" button must NOT submit the login form, but "Log In" must
  // A button inside a form submits it by default, so a Google button written wrong would act like Log In
  // We watch the form's submit event: clicking Google should not trigger it, clicking Log In should (once)
  it("the Google button does not submit the form, but Log In does", async () => {
    const user = userEvent.setup();
    const { container } = renderLogin();
    const onSubmit = vi.fn((e) => e.preventDefault());
    container.querySelector("form").addEventListener("submit", onSubmit);

    await user.click(
      screen.getByRole("button", { name: "Continue with Google" }),
    );
    expect(onSubmit).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Log In" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

describe("Login: links and keyboard", () => {
  // Clicking "Create account" should take the user to the signup page
  // This is how new users get to Create Account, and the fake /signup route in renderLogin proves the link goes to the right place
  it("clicking 'Create account' navigates to the signup route", async () => {
    const user = userEvent.setup();
    renderLogin();
    await user.click(screen.getByRole("link", { name: "Create account" }));
    expect(screen.getByText("Signup page")).toBeInTheDocument();
    expect(screen.queryByText("Welcome back")).not.toBeInTheDocument();
  });

  // Pressing Tab should move through the form in a sensible order: email, password, Remember me, Forgot password?, then Log In
  // People who use only a keyboard (or a screen reader) rely on this order, so it has to make sense
  it("Tab moves through the form in a sensible order", async () => {
    const user = userEvent.setup();
    renderLogin();
    await user.click(emailField());
    await user.tab();
    expect(passwordField()).toHaveFocus();
    await user.tab();
    expect(
      screen.getByRole("checkbox", { name: /remember me/i }),
    ).toHaveFocus();
    await user.tab();
    expect(
      screen.getByRole("link", { name: "Forgot password?" }),
    ).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Log In" })).toHaveFocus();
  });
});