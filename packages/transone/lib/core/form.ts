import { getModelValue } from './model';

export type ValidationResult = boolean | string;

export type ValidationRule<T = unknown> = (
  value: T,
  model: object
) => ValidationResult;

export type ValidationRules<TModel extends object> = {
  [TPath in keyof TModel & string]?: readonly ValidationRule[];
} & Record<string, readonly ValidationRule[] | undefined>;

export interface FieldValidationResult {
  valid: boolean;
  errors: string[];
}

export interface FormValidationResult {
  valid: boolean;
  errors: Record<string, string[]>;
}

export interface FormController<TModel extends object> {
  readonly model: TModel;
  readonly errors: Record<string, string[]>;
  validate(): FormValidationResult;
  validateField(path: string): FieldValidationResult;
  resetErrors(): void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function runRule(
  rule: ValidationRule,
  value: unknown,
  model: object
): string | undefined {
  try {
    const result = rule(value, model);
    if (result === true) {
      return undefined;
    }
    return result === false ? 'Validation failed' : result;
  } catch (error) {
    return errorMessage(error);
  }
}

export function required(message = 'This field is required'): ValidationRule {
  return (value) => {
    if (value === null || value === undefined) {
      return message;
    }
    if (typeof value === 'string' && value.trim().length === 0) {
      return message;
    }
    if (Array.isArray(value) && value.length === 0) {
      return message;
    }
    return true;
  };
}

export function minLength(
  length: number,
  message = `Must be at least ${length} characters`
): ValidationRule {
  return (value) =>
    typeof value === 'string' && value.length >= length ? true : message;
}

export function validate(rule: ValidationRule): ValidationRule {
  return rule;
}

export function createForm<TModel extends object>(
  model: TModel,
  rules: ValidationRules<TModel>
): FormController<TModel> {
  const errors: Record<string, string[]> = {};

  const validateField = (path: string): FieldValidationResult => {
    const fieldRules = rules[path] ?? [];
    const value = getModelValue(model as Record<string, unknown>, path);
    const fieldErrors = fieldRules
      .map((rule) => runRule(rule, value, model))
      .filter((message): message is string => message !== undefined);

    if (fieldErrors.length === 0) {
      delete errors[path];
    } else {
      errors[path] = fieldErrors;
    }

    return { valid: fieldErrors.length === 0, errors: fieldErrors };
  };

  return {
    model,
    errors,
    validate(): FormValidationResult {
      const allErrors: Record<string, string[]> = {};
      Object.keys(rules).forEach((path) => {
        const result = validateField(path);
        if (!result.valid) {
          allErrors[path] = result.errors;
        }
      });
      return { valid: Object.keys(allErrors).length === 0, errors: allErrors };
    },
    validateField,
    resetErrors(): void {
      Object.keys(errors).forEach((path) => delete errors[path]);
    },
  };
}
