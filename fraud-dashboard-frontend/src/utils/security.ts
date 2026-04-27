export function maskAccount(value?: string | null) {
  if (!value) return "—";
  const clean = String(value).trim();
  if (clean.length <= 4) return clean;
  return `${"*".repeat(Math.max(clean.length - 4, 2))}${clean.slice(-4)}`;
}

export function maskEmail(value?: string | null) {
  if (!value) return "—";
  const [localPart, domain] = String(value).split("@");
  if (!localPart || !domain) return value;
  const visible = localPart.slice(0, Math.min(2, localPart.length));
  return `${visible}${"*".repeat(Math.max(localPart.length - visible.length, 2))}@${domain}`;
}

export function maskPhone(value?: string | null) {
  if (!value) return "—";
  const digits = String(value).replace(/\D/g, "");
  if (digits.length <= 4) return digits;
  return `${"*".repeat(Math.max(digits.length - 4, 2))}${digits.slice(-4)}`;
}

export function formatCurrency(amount?: number | null) {
  if (amount == null) return "—";
  return `INR ${Number(amount).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}
