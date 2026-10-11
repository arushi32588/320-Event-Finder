import { Link } from 'react-router';
import './CreateAccount.css';

const fields = [
  { id: 'full-name', label: 'Full Name', type: 'text', placeholder: 'User Full Name', autoComplete: 'name' },
  { id: 'email', label: 'Email', type: 'email', placeholder: 'you@example.com', autoComplete: 'email' },
  { id: 'date-of-birth', label: 'Date of Birth', type: 'text', placeholder: 'MM / DD / YYYY', autoComplete: 'bday' },
  { id: 'password', label: 'Password', type: 'password', placeholder: '••••••••', autoComplete: 'new-password' },
  { id: 'confirm-password', label: 'Confirm Password', type: 'password', placeholder: '••••••••', autoComplete: 'new-password' },
];

export default function CreateAccount() {
  // Account creation is not implemented yet; the form only renders the wireframe.
  function handleSubmit(e) {
    e.preventDefault();
  }

  return (
    <form className="ca-card" onSubmit={handleSubmit}>
      <h1 className="ca-title">Create your account</h1>

      {fields.map((field) => (
        <div className="ca-field" key={field.id}>
          <label htmlFor={field.id}>{field.label}</label>
          <input
            id={field.id}
            name={field.id}
            type={field.type}
            placeholder={field.placeholder}
            autoComplete={field.autoComplete}
          />
        </div>
      ))}

      <label className="ca-terms">
        <input type="checkbox" name="terms" />
        I agree to the Terms of Service and Privacy Policy
      </label>

      <button type="submit" className="ca-submit">Create Account</button>

      <p className="ca-login">
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </form>
  );
}
