import { useEffect, useId, useState } from "react";
import QRCode from "qrcode";
import "../theme.css";
import "./RegistrationLink.css";

// Only plain web links reach an href or a QR code (never javascript:, data:, …).
export function safeWebUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

// Where an event's registration or payment happens: a button to the organizer's
// link and a QR code so someone can open it on their phone.
export default function RegistrationLink({ url, price }) {
  const headingId = useId();
  const link = safeWebUrl(url);
  const href = link?.href ?? null;
  const [qr, setQr] = useState({ href: null, src: null, failed: false });

  useEffect(() => {
    if (!href) return undefined;
    let current = true;
    QRCode.toString(href, { type: "svg", margin: 1, errorCorrectionLevel: "M" })
      .then((svg) => {
        if (current) setQr({ href, src: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`, failed: false });
      })
      .catch(() => {
        if (current) setQr({ href, src: null, failed: true });
      });
    return () => {
      current = false;
    };
  }, [href]);

  if (!link) return null;

  const paid = Boolean(price) && price !== "Free";
  const site = link.hostname.replace(/^www\./, "");
  const ready = qr.href === href;

  return (
    <section className="ed-card rl-card" aria-labelledby={headingId}>
      <h2 className="rl-title" id={headingId}>{paid ? "Tickets & payment" : "Register"}</h2>
      <p className="rl-site">via {site}</p>
      <a className="rl-register" href={href} target="_blank" rel="noopener noreferrer">
        {paid ? "Register & pay " : "Register "}
        <span className="visually-hidden">(opens in a new tab)</span>
      </a>
      {!(ready && qr.failed) && (
        <figure className="rl-qr">
          <div className="rl-qr-tile">
            {ready && qr.src && <img src={qr.src} alt="QR code for the registration link" width="160" height="160" />}
          </div>
          <figcaption className="rl-qr-caption">Scan to open on your phone</figcaption>
        </figure>
      )}
    </section>
  );
}
