import { z } from 'zod';

export function formatZodIssues(error) {
  if (!(error instanceof z.ZodError)) return [];
  return error.issues.map(issue => ({
    path: issue.path.join('.'),
    message: issue.message,
    code: issue.code
  }));
}

export function contractValidationError(message, error) {
  const wrapped = new Error(message);
  wrapped.statusCode = 400;
  wrapped.code = 'contract_validation_failed';
  wrapped.issues = formatZodIssues(error);
  return wrapped;
}

export function responseValidationError(message, error) {
  const wrapped = new Error(message);
  wrapped.statusCode = 500;
  wrapped.code = 'contract_response_validation_failed';
  wrapped.issues = formatZodIssues(error);
  return wrapped;
}

export function validateRequestBody(schema, body) {
  if (!schema) return body;
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw contractValidationError('Request body did not match contract', parsed.error);
  }
  return parsed.data;
}

export function shouldValidateResponses() {
  return process.env.CONTRACT_VALIDATE_RESPONSES === '1' ||
    process.env.CONTRACT_VALIDATE_RESPONSES === 'true';
}

export function validateResponseBody(schema, body) {
  if (!schema || !shouldValidateResponses()) return body;
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw responseValidationError('Response body did not match contract', parsed.error);
  }
  return body;
}

