import { Link } from "react-router";
import "../theme.css";
import "./Login.css";

export default function Login() {
  // Login is not connected to Supabase yet
  function handleSubmit(e) {
    e.preventDefault();
  }

  return (
    <form className="login-card" onSubmit={handleSubmit}>
      <h1 className="login-title">Welcome back</h1>
      <p className="login-subtitle">Log in to discover and save events.</p>

      <div className="login-field">
        <label htmlFor="login-email">Email</label>
        <input
          id="login-email"
          name="email"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
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
        />
      </div>

      <div className="login-row">
        <label className="login-remember">
          <input type="checkbox" name="remember" />
          Remember me
        </label>
        <a href="#" className="login-link">
          Forgot password?
        </a>
      </div>

      <button type="submit" className="login-submit">
        Log In
      </button>

      <div className="login-divider">
        <span>or</span>
      </div>

      <button type="button" className="login-google">
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
