import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";
import "../theme.css";
import "./Login.css";

export default function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setSubmitting(true);
    setErrors({});
    setMessage("");
    try {
      const { session } = await api("/api/auth/login", {
        method: "POST",
        body: { email: form.get("email"), password: form.get("password") },
      });
      await signIn(session, form.get("remember") === "on");
      navigate(location.state?.from ?? "/", { replace: true });
    } catch (err) {
      setErrors(err.fields ?? {});
      setMessage(err.message);
      setSubmitting(false);
    }
  }

  return (
    <form className="login-card" onSubmit={handleSubmit}>
      <h1 className="login-title">Welcome back</h1>
      <p className="login-subtitle">Log in to discover and save events.</p>

      {message && <p className="app-error" role="alert">{message}</p>}

      <div className="login-field">
        <label htmlFor="login-email">Email</label>
        <input
          id="login-email"
          name="email"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          aria-invalid={errors.email ? "true" : undefined}
        />
      </div>

      <div className="login-field">
        <label htmlFor="login-password">Password</label>
        <input
          id="login-password"
          name="password"
          type="password"
          placeholder="••••••••"
          autoComplete="current-password"
          aria-invalid={errors.password ? "true" : undefined}
        />
      </div>

      <div className="login-row">
        <label className="login-remember">
          <input type="checkbox" name="remember" />
          Remember me
        </label>
        {/* Needs a password reset page; not built yet. */}
        <span className="login-link" aria-disabled="true" title="Coming soon">
          Forgot password?
        </span>
      </div>

      <button type="submit" className="login-submit" disabled={submitting}>
        {submitting ? "Logging in…" : "Log In"}
      </button>

      <div className="login-divider">
        <span>or</span>
      </div>

      {/* Needs Google sign-in set up in Supabase first. */}
      <button type="button" className="login-google" disabled title="Coming soon">
        Continue with Google
      </button>

      <p className="login-signup">
        Don't have an account?{" "}
        <Link to="/signup" className="login-link">
          Create account
        </Link>
      </p>
    </form>
  );
}
