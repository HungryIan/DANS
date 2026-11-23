/** Philippine mobile number: 09XX XXX XXXX, 09XX-XXX-XXXX or +639XXXXXXXXX. */
export const PHONE_PATTERN = /^(\+63|0)9\d{2}[\s-]?\d{3}[\s-]?\d{4}$/;

/** Same rule as the API's PasswordPolicy: 8+ characters with an uppercase letter, a lowercase letter and a number. */
export const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,128}$/;

export const PASSWORD_HINT = 'At least 8 characters, with an uppercase letter, a lowercase letter and a number.';

/** Same rule as the API's Text.ContactNumberPattern: hotlines (911), landlines ((082) 123-4567) or mobiles. */
export const CONTACT_NUMBER_PATTERN = /^(?=(?:\D*\d){3})[0-9+()\-\s]{3,50}$/;

export const CONTACT_NUMBER_HINT = 'Digits, spaces, +, - or parentheses only, e.g. 911 or 0917 123 4567.';
