const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const PHONE_PATTERN = /^\d{10}$/;
const USERNAME_PATTERN = /^[A-Za-z ]+$/;
const INVITATION_PATTERN = /^INV-[A-F0-9]{8}$/;
const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8}$/;

function validateUserName(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "User Name field is Empty";
  if (!USERNAME_PATTERN.test(trimmed)) return "Invalid user name";
  if (trimmed.length < 2) return "User name must be at least 2 characters long.";
  return null;
}

function validatePhoneNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "Phone Number field is Empty";
  if (!PHONE_PATTERN.test(trimmed)) return "Invalid Phone Number";
  return null;
}

function validateEmail(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "Email field is Empty";
  if (!EMAIL_PATTERN.test(trimmed)) return "Invalid Email";
  return null;
}

function validatePassword(value: string) {
  if (!value || !value.trim()) return "Password field is Empty";
  if (!PASSWORD_PATTERN.test(value)) return "Invalid Password";
  return null;
}

function validateConfirmPassword(value: string) {
  if (!value || !value.trim()) return "Confirm Password field is Empty";
  return null;
}

function validateInvitationCode(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "Invitation Code field is Empty";
  if (!INVITATION_PATTERN.test(trimmed)) return "Invalid Invitation Code";
  return null;
}

export function validateCommonUserFields(input: {
  userName: string;
  phoneNumber: string;
  email: string;
  password: string;
}) {
  return (
    validateUserName(input.userName) ||
    validatePhoneNumber(input.phoneNumber) ||
    validateEmail(input.email) ||
    validatePassword(input.password)
  );
}

export function validateSignupFields(input: {
  userName: string;
  phoneNumber: string;
  email: string;
  password: string;
  confirmPassword: string;
  invitationCode: string;
}) {
  return (
    validateUserName(input.userName) ||
    validatePhoneNumber(input.phoneNumber) ||
    validateEmail(input.email) ||
    validatePassword(input.password) ||
    validateConfirmPassword(input.confirmPassword) ||
    validateInvitationCode(input.invitationCode) ||
    (input.password !== input.confirmPassword ? "Passwords do not match." : null)
  );
}

export function validateAdminFields(input: {
  userName: string;
  phoneNumber: string;
  email: string;
  password: string;
}) {
  return validateCommonUserFields(input);
}

export function validateLoginFields(input: { email: string; password: string }) {
  return validateEmail(input.email) || validatePassword(input.password);
}

export function validateInvitationCodeField(value: string) {
  return validateInvitationCode(value);
}

export function validateEmailField(value: string) {
  return validateEmail(value);
}
