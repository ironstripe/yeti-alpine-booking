import { z } from 'zod';

// Custom German error messages
const customErrorMap: z.ZodErrorMap = (issue, ctx) => {
  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      if (issue.expected === 'string') {
        return { message: 'Bitte geben Sie einen Text ein.' };
      }
      if (issue.expected === 'number') {
        return { message: 'Bitte geben Sie eine Zahl ein.' };
      }
      if (issue.received === 'undefined' || issue.received === 'null') {
        return { message: 'Dieses Feld ist erforderlich.' };
      }
      break;
    case z.ZodIssueCode.too_small:
      if (issue.type === 'string') {
        if (issue.minimum === 1) {
          return { message: 'Dieses Feld ist erforderlich.' };
        }
        return { message: `Mindestens ${issue.minimum} Zeichen erforderlich.` };
      }
      if (issue.type === 'number') {
        return { message: `Der Wert muss mindestens ${issue.minimum} sein.` };
      }
      if (issue.type === 'array') {
        return { message: `Mindestens ${issue.minimum} Eintrag erforderlich.` };
      }
      break;
    case z.ZodIssueCode.too_big:
      if (issue.type === 'string') {
        return { message: `Maximal ${issue.maximum} Zeichen erlaubt.` };
      }
      if (issue.type === 'number') {
        return { message: `Der Wert darf maximal ${issue.maximum} sein.` };
      }
      break;
    case z.ZodIssueCode.invalid_string:
      if (issue.validation === 'email') {
        return { message: 'Bitte geben Sie eine gültige E-Mail-Adresse ein.' };
      }
      if (issue.validation === 'url') {
        return { message: 'Bitte geben Sie eine gültige URL ein.' };
      }
      break;
    case z.ZodIssueCode.invalid_date:
      return { message: 'Bitte geben Sie ein gültiges Datum ein.' };
    case z.ZodIssueCode.invalid_enum_value:
      return { message: 'Bitte wählen Sie eine gültige Option.' };
  }
  return { message: ctx.defaultError };
};

z.setErrorMap(customErrorMap);

// Common validation schemas
export const emailSchema = z.string().email().min(1);

export const phoneSchema = z.string().regex(
  /^(\+41|0041|0|\+423|00423)?[1-9]\d{7,9}$/,
  'Bitte geben Sie eine gültige Telefonnummer ein.'
).optional().or(z.literal(''));

export const requiredString = z.string().min(1, 'Dieses Feld ist erforderlich.');
export const optionalString = z.string().optional().or(z.literal(''));

export const positiveNumber = z.number().positive('Der Wert muss grösser als 0 sein.');
export const nonNegativeNumber = z.number().min(0, 'Der Wert darf nicht negativ sein.');

export const dateSchema = z.coerce.date();

export const futureDateSchema = z.coerce.date().refine(
  (date) => date >= new Date(new Date().setHours(0, 0, 0, 0)),
  'Das Datum muss in der Zukunft liegen.'
);

// Customer schema
export const customerSchema = z.object({
  first_name: optionalString,
  last_name: requiredString,
  email: emailSchema,
  phone: phoneSchema,
  street: optionalString,
  zip: optionalString,
  city: optionalString,
  country: z.string().default('CH'),
  holiday_address: optionalString,
  notes: optionalString,
});

// Participant schema
export const participantSchema = z.object({
  first_name: requiredString,
  last_name: optionalString,
  birth_date: dateSchema,
  level_current_season: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
  sport: z.enum(['ski', 'snowboard']).default('ski'),
  notes: optionalString,
});

export { z };
