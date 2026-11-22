import { afterEach, describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";
import OrganizerVerification from "./OrganizerVerification.jsx";
import { RequireAuth } from "../lib/auth.jsx";
import {
  fail,
  loggedInRoutes,
  mockApi,
  renderPage,
  resetApi,
} from "../test/api.jsx";

const show = () =>
  renderPage(
    <Routes>
      <Route
        path="/"
        element={
          <RequireAuth>
            <OrganizerVerification />
          </RequireAuth>
        }
      />
      <Route path="/login" element={<h1>Login page</h1>} />
    </Routes>,
  );

async function fillRequired(user, email = "team@hackclub.org") {
  await user.type(
    await screen.findByLabelText(/Organization Name/),
    "Hack Club",
  );
  await user.type(
    screen.getByLabelText(/Organization Description/),
    "We run hackathons.",
  );
  await user.type(screen.getByLabelText(/Contact Email/), email);
}

afterEach(resetApi);

describe("Organizer verification: rendering", () => {
  it("shows every field, marking the required ones", async () => {
    mockApi(loggedInRoutes());
    show();
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Become a Verified Organizer",
      }),
    ).toBeInTheDocument();
    for (const label of [
      /Organization Name/,
      /Organization Description/,
      /Organization Address/,
      /Website/,
      /Contact Email/,
      /Supporting Proof/,
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.getByText("File upload coming soon")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Submit Request" }),
    ).toBeEnabled();
  });

  it("sends logged-out visitors to log in", async () => {
    mockApi({});
    show();
    expect(
      await screen.findByRole("heading", { name: "Login page" }),
    ).toBeInTheDocument();
  });
});

describe("Organizer verification: validation", () => {
  it("lists every missing required field at once", async () => {
    mockApi(loggedInRoutes());
    const user = userEvent.setup();
    show();
    await user.click(
      await screen.findByRole("button", { name: "Submit Request" }),
    );
    expect(
      screen.getByText("Organization Name is required."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Organization Description is required."),
    ).toBeInTheDocument();
    expect(screen.getByText("Contact Email is required.")).toBeInTheDocument();
  });

  it("treats a name of only spaces as missing", async () => {
    const { callsTo } = mockApi(loggedInRoutes());
    const user = userEvent.setup();
    show();
    await user.type(await screen.findByLabelText(/Organization Name/), "   ");
    await user.type(
      screen.getByLabelText(/Organization Description/),
      "We run hackathons.",
    );
    await user.type(
      screen.getByLabelText(/Contact Email/),
      "team@hackclub.org",
    );
    await user.click(screen.getByRole("button", { name: "Submit Request" }));
    expect(
      screen.getByText("Organization Name is required."),
    ).toBeInTheDocument();
    expect(callsTo("POST", "/api/organizer/verification-request")).toHaveLength(
      0,
    );
  });

  it("rejects an invalid contact email before calling the backend", async () => {
    const { callsTo } = mockApi(loggedInRoutes());
    const user = userEvent.setup();
    show();
    await fillRequired(user, "not-an-email");
    await user.click(screen.getByRole("button", { name: "Submit Request" }));
    expect(
      screen.getByText("Enter a valid email address."),
    ).toBeInTheDocument();
    expect(callsTo("POST", "/api/organizer/verification-request")).toHaveLength(
      0,
    );
  });

  it("marks invalid fields for screen readers", async () => {
    mockApi(loggedInRoutes());
    const user = userEvent.setup();
    show();
    await user.click(
      await screen.findByRole("button", { name: "Submit Request" }),
    );
    expect(screen.getByLabelText(/Organization Name/)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(
      screen.getByLabelText(/Organization Name/),
    ).toHaveAccessibleDescription("Organization Name is required.");
  });

  it("clears old errors once the form is fixed and sent", async () => {
    mockApi({
      ...loggedInRoutes(),
      "POST /api/organizer/verification-request": {
        request: { id: "1", status: "pending" },
      },
    });
    const user = userEvent.setup();
    show();
    await user.click(
      await screen.findByRole("button", { name: "Submit Request" }),
    );
    expect(
      screen.getByText("Organization Name is required."),
    ).toBeInTheDocument();
    await fillRequired(user);
    await user.click(screen.getByRole("button", { name: "Submit Request" }));
    expect(
      await screen.findByRole("heading", { name: "Request sent!" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Organization Name is required."),
    ).not.toBeInTheDocument();
  });
});

describe("Organizer verification: submitting", () => {
  it("shows the success page with a way back to the profile", async () => {
    mockApi({
      ...loggedInRoutes(),
      "POST /api/organizer/verification-request": {
        request: { id: "1", status: "pending" },
      },
    });
    const user = userEvent.setup();
    show();
    await fillRequired(user);
    await user.click(screen.getByRole("button", { name: "Submit Request" }));
    expect(
      await screen.findByRole("heading", { name: "Request sent!" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to Profile" }),
    ).toHaveAttribute("href", "/profile");
    expect(
      screen.queryByRole("button", { name: "Submit Request" }),
    ).not.toBeInTheDocument();
  });

  it("still shows success if refreshing the profile afterwards fails", async () => {
    const login = loggedInRoutes();
    let calls = 0;
    mockApi({
      "GET /api/me/profile": () => {
        calls += 1;
        return calls === 1
          ? login["GET /api/me/profile"]
          : fail(500, "Server is down.");
      },
      "POST /api/organizer/verification-request": {
        request: { id: "1", status: "pending" },
      },
    });
    const user = userEvent.setup();
    show();
    await fillRequired(user);
    await user.click(screen.getByRole("button", { name: "Submit Request" }));
    expect(
      await screen.findByRole("heading", { name: "Request sent!" }),
    ).toBeInTheDocument();
  });

  it("shows a general backend error and keeps what was typed", async () => {
    mockApi({
      ...loggedInRoutes(),
      "POST /api/organizer/verification-request": fail(
        500,
        "Something went wrong. Please try again.",
      ),
    });
    const user = userEvent.setup();
    show();
    await fillRequired(user);
    await user.click(screen.getByRole("button", { name: "Submit Request" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Something went wrong",
    );
    expect(screen.getByLabelText(/Organization Name/)).toHaveValue("Hack Club");
    expect(
      screen.getByRole("button", { name: "Submit Request" }),
    ).toBeEnabled();
  });

  it("shows the proof-link error next to the proof field", async () => {
    mockApi({
      ...loggedInRoutes(),
      "POST /api/organizer/verification-request": fail(
        400,
        "Please fix the highlighted fields.",
        { documentUrl: "Enter a valid link to your document." },
      ),
    });
    const user = userEvent.setup();
    show();
    await fillRequired(user);
    await user.type(
      screen.getByLabelText(/Supporting Proof/),
      "https://x.example.com",
    );
    await user.click(screen.getByRole("button", { name: "Submit Request" }));
    expect(
      await screen.findByText("Enter a valid link to your document."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Supporting Proof/)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });
});
