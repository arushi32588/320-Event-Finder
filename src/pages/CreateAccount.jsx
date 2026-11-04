import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import '../theme.css';
import './CreateAccount.css';

const fields = [
  { id: 'full-name', name: 'name', label: 'Full Name', type: 'text', placeholder: 'User Full Name', autoComplete: 'name' },
  { id: 'email', name: 'email', label: 'Email', type: 'email', placeholder: 'you@example.com', autoComplete: 'email' },
  { id: 'date-of-birth', name: 'dateOfBirth', label: 'Date of Birth', type: 'text', placeholder: 'MM / DD / YYYY', autoComplete: 'bday' },
  { id: 'password', name: 'password', label: 'Password', type: 'password', placeholder: '••••••••', autoComplete: 'new-password' },
  { id: 'confirm-password', name: 'confirmPassword', label: 'Confirm Password', type: 'password', placeholder: '••••••••', autoComplete: 'new-password' },
];

export default function CreateAccount() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setSubmitting(true);
    setErrors({});
    setMessage('');
    try {
      const { session, needsEmailConfirmation } = await api('/api/auth/signup', {
        method: 'POST',
        body: {
          name: form.get('name'),
          email: form.get('email'),
          dateOfBirth: form.get('dateOfBirth'),
          password: form.get('password'),
          confirmPassword: form.get('confirmPassword'),
          acceptedTerms: form.get('terms') === 'on',
        },
      });
      if (needsEmailConfirmation || !session) {
        setCheckEmail(true);
        return;
      }
      await signIn(session);
      navigate('/', { replace: true });
    } catch (err) {
      setErrors(err.fields ?? {});
      setMessage(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (checkEmail) {
    return (
      <div className="ca-card" role="status">
        <h1 className="ca-title">Check your email</h1>
        <p>We sent you a link to confirm your account. After that, you can log in.</p>
        <p className="ca-login"><Link to="/login">Go to log in</Link></p>
      </div>
    );
  }

  return (
    <form className="ca-card" onSubmit={handleSubmit}>
      <h1 className="ca-title">Create your account</h1>

      {message && <p className="app-error" role="alert">{message}</p>}

      {fields.map((field) => (
        <div className="ca-field" key={field.id}>
          <label htmlFor={field.id}>{field.label}</label>
          <input
            id={field.id}
            name={field.name}
            type={field.type}
            placeholder={field.placeholder}
            autoComplete={field.autoComplete}
            aria-invalid={errors[field.name] ? 'true' : undefined}
            aria-describedby={errors[field.name] ? `${field.id}-error` : undefined}
          />
          {errors[field.name] && (
            <p className="app-error" id={`${field.id}-error`}>{errors[field.name]}</p>
          )}
        </div>
      ))}

      <label className="ca-terms">
        <input type="checkbox" name="terms" />
        I agree to the Terms of Service and Privacy Policy
      </label>
      {errors.acceptedTerms && <p className="app-error">{errors.acceptedTerms}</p>}

      <button type="submit" className="ca-submit" disabled={submitting}>
        {submitting ? 'Creating account…' : 'Create Account'}
      </button>

      <p className="ca-login">
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </form>
  );
}
