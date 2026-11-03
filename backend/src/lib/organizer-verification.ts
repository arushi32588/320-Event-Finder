import type { SupabaseClient } from '@supabase/supabase-js';

export type VerificationStatus = 'pending' | 'approved' | 'rejected';

export type VerificationRequest = {
  id: string;
  organizationName: string | null;
  description: string | null;
  address: string | null;
  website: string | null;
  contactEmail: string | null;
  documentUrl: string | null;
  status: VerificationStatus;
  rejectionReason: string | null;
  submittedAt: string;
  reviewedAt: string | null;
};

export type VerificationApplication = {
  organizationName: string;
  description: string | null;
  address: string | null;
  website: string | null;
  contactEmail: string | null;
  documentUrl: string | null;
};

type FieldErrors = Record<string, string>;
type Result<T> = { value: T } | { errors: FieldErrors };

type RequestRow = {
  id: number;
  organization_name: string | null;
  description: string | null;
  address: string | null;
  website: string | null;
  contact_email: string | null;
  document_url: string | null;
  status: VerificationStatus;
  rejection_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
};

// Limits match the organizer_profiles / organizer_verification_requests columns.
const MAX_ORGANIZATION_NAME = 255;
const MAX_DESCRIPTION = 5000;
const MAX_ADDRESS = 255;
const MAX_WEBSITE = 2048;
const MAX_CONTACT_EMAIL = 255;
const MAX_DOCUMENT_URL = 255;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The custom error codes raised by the database functions, as HTTP statuses.
const SUBMIT_ERROR_STATUS: Record<string, number> = { EF401: 401, EF409: 409 };

function isWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

// Reads an optional text field: trimmed, null when blank, with a length limit.
function optionalText(body: Record<string, unknown>, field: string, label: string, max: number, errors: FieldErrors): string | null {
  const value = body[field];
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    errors[field] = `${label} must be text.`;
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    errors[field] = `${label} must be ${max} characters or fewer.`;
    return null;
  }
  return trimmed || null;
}

export function validateVerificationApplication(body: Record<string, unknown>): Result<VerificationApplication> {
  const errors: FieldErrors = {};

  let organizationName = '';
  if (body.organizationName === undefined || body.organizationName === null) {
    errors.organizationName = 'Organization name is required.';
  } else if (typeof body.organizationName !== 'string') {
    errors.organizationName = 'Organization name must be text.';
  } else {
    organizationName = body.organizationName.trim();
    if (!organizationName) errors.organizationName = 'Organization name is required.';
    else if (organizationName.length > MAX_ORGANIZATION_NAME) {
      errors.organizationName = `Organization name must be ${MAX_ORGANIZATION_NAME} characters or fewer.`;
    }
  }

  const description = optionalText(body, 'description', 'Description', MAX_DESCRIPTION, errors);
  const address = optionalText(body, 'address', 'Address', MAX_ADDRESS, errors);

  const website = optionalText(body, 'website', 'Website', MAX_WEBSITE, errors);
  if (website && !errors.website && !isWebUrl(website)) errors.website = 'Website must start with http:// or https://.';

  const contactEmail = optionalText(body, 'contactEmail', 'Contact email', MAX_CONTACT_EMAIL, errors);
  if (contactEmail && !errors.contactEmail && !EMAIL_PATTERN.test(contactEmail)) {
    errors.contactEmail = 'Enter a valid contact email address.';
  }

  const documentUrl = optionalText(body, 'documentUrl', 'Document URL', MAX_DOCUMENT_URL, errors);
  if (documentUrl && !errors.documentUrl && !isWebUrl(documentUrl)) {
    errors.documentUrl = 'Document URL must start with http:// or https://.';
  }

  if (Object.keys(errors).length > 0) return { errors };
  return { value: { organizationName, description, address, website, contactEmail: contactEmail?.toLowerCase() ?? null, documentUrl } };
}

export function toVerificationRequest(row: RequestRow): VerificationRequest {
  return {
    id: String(row.id),
    organizationName: row.organization_name,
    description: row.description,
    address: row.address,
    website: row.website,
    contactEmail: row.contact_email,
    documentUrl: row.document_url,
    status: row.status,
    rejectionReason: row.rejection_reason,
    submittedAt: row.created_at,
    reviewedAt: row.reviewed_at,
  };
}

// The user's most recent verification request, or null if they never applied.
export async function getLatestVerificationRequest(supabase: SupabaseClient): Promise<VerificationRequest | null> {
  const { data, error } = await supabase.rpc('get_my_verification_request');
  if (error) throw new Error(`Failed to load verification request: ${error.message}`);
  const rows = (data ?? []) as RequestRow[];
  return rows.length > 0 ? toVerificationRequest(rows[0]) : null;
}

// Returns the new request, or the HTTP status for an expected refusal (not
// logged in, already approved, already pending). Anything else throws.
export async function submitVerificationRequest(
  supabase: SupabaseClient,
  input: VerificationApplication,
): Promise<{ request: VerificationRequest } | { status: number; error: string }> {
  const { data, error } = await supabase
    .rpc('submit_verification_request', {
      p_organization_name: input.organizationName,
      p_description: input.description,
      p_address: input.address,
      p_website: input.website,
      p_contact_email: input.contactEmail,
      p_document_url: input.documentUrl,
    })
    .single();

  if (error) {
    const status = error.code ? SUBMIT_ERROR_STATUS[error.code] : undefined;
    if (status) return { status, error: error.message };
    throw new Error(`Failed to submit verification request: ${error.message}`);
  }
  return { request: toVerificationRequest(data as RequestRow) };
}
