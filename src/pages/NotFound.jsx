import { Link } from 'react-router';
import '../theme.css';
import './NotFound.css';

export default function NotFound() {
  return (
    <div className="nf-page">
      <p className="sticker">Whoops</p>
      <h1>404</h1>
      <p className="nf-text">This page left the party early.</p>
      <Link to="/" className="ov-submit">Back to Home</Link>
    </div>
  );
}
