import "../theme.css";
import "./ReviewGuidelines.css";

// What admins should check before approving or rejecting. These are a first
// draft — the exact wording/criteria should be confirmed with the customer.
// Kept as plain data so it's easy to edit without touching the markup.
const guidelines = {
  organizer: {
    summary: "Guidelines for reviewing organizer requests",
    approve: [
      "The organization name matches its website or verification document.",
      "The verification document is real, readable and current (for example a registration certificate, an official letter or a student-org listing).",
      "The contact email works, and ideally uses the organization's own domain.",
      "The description sounds like a real group that runs local events.",
    ],
    reject: [
      "The proof is missing, unreadable, or doesn't match the organization.",
      "It looks like a person pretending to be an organization they don't represent.",
      "The organization is already verified under another account.",
    ],
    tip: "Always write a reason when rejecting. The applicant sees it on their profile and can fix it before applying again.",
  },
  event: {
    summary: "Guidelines for reviewing events",
    approve: [
      "It has a clear title, a date in the future and a real location.",
      "The description explains what the event is and who it's for.",
      "Price, ages and accessibility details look accurate and complete.",
      "It's a public event that fits the community.",
    ],
    reject: [
      "Spam, ads, or anything that's really a sales pitch rather than an event.",
      "A duplicate of an event that's already listed.",
      "The date has already passed, or key details (time, place) are missing.",
      "Unsafe, illegal, hateful or otherwise inappropriate content.",
    ],
    tip: "When in doubt, check the organizer's website or ask them before deciding.",
  },
};

// Collapsed by default so it doesn't push the review list down every time.
export default function ReviewGuidelines({ kind }) {
  const g = guidelines[kind];
  return (
    <details className="rg-guidelines">
      <summary className="rg-summary">{g.summary}</summary>
      <div className="rg-columns">
        <div>
          <h3 className="rg-heading rg-approve">Approve when…</h3>
          <ul>
            {g.approve.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
        <div>
          <h3 className="rg-heading rg-reject">Reject when…</h3>
          <ul>
            {g.reject.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      </div>
      <p className="rg-tip">{g.tip}</p>
    </details>
  );
}
