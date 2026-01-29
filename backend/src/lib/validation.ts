import { z } from 'zod';

/**
 * JSONB validation constraints for security
 */
const JSONB_CONSTRAINTS = {
  maxKeys: 50,
  maxValueSize: 1024, // 1KB per value
  maxDepth: 5,
};

/**
 * Calculate the depth of a nested object
 */
function getObjectDepth(obj: unknown, currentDepth = 1): number {
  if (typeof obj !== 'object' || obj === null) {
    return currentDepth;
  }

  if (Array.isArray(obj)) {
    if (obj.length === 0) return currentDepth;
    return Math.max(...obj.map((item) => getObjectDepth(item, currentDepth + 1)));
  }

  const depths = Object.values(obj).map((value) =>
    getObjectDepth(value, currentDepth + 1)
  );

  return depths.length > 0 ? Math.max(...depths) : currentDepth;
}

/**
 * Count total number of keys in a nested object
 */
function countKeys(obj: unknown): number {
  if (typeof obj !== 'object' || obj === null) {
    return 0;
  }

  if (Array.isArray(obj)) {
    return obj.reduce((count, item) => count + countKeys(item), 0);
  }

  const ownKeys = Object.keys(obj).length;
  const nestedKeys = Object.values(obj).reduce(
    (count, value) => count + countKeys(value),
    0
  );

  return ownKeys + nestedKeys;
}

/**
 * Get the size of a JSON value in bytes
 */
function getValueSize(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

/**
 * Validate all values in an object are within size limit
 */
function validateValueSizes(obj: unknown, maxSize: number): boolean {
  if (typeof obj !== 'object' || obj === null) {
    return getValueSize(obj) <= maxSize;
  }

  if (Array.isArray(obj)) {
    return obj.every((item) => validateValueSizes(item, maxSize));
  }

  return Object.values(obj).every((value) => {
    if (typeof value === 'object' && value !== null) {
      return validateValueSizes(value, maxSize);
    }
    return getValueSize(value) <= maxSize;
  });
}

/**
 * Zod schema for JSONB validation
 * Enforces max keys, max depth, and max value size
 */
export const jsonbSchema = z.unknown().superRefine((val, ctx) => {
  if (typeof val !== 'object' || val === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'JSONB value must be an object',
    });
    return;
  }

  // Check max keys
  const keyCount = countKeys(val);
  if (keyCount > JSONB_CONSTRAINTS.maxKeys) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `JSONB exceeds maximum keys limit (${JSONB_CONSTRAINTS.maxKeys})`,
      params: { keyCount, maxKeys: JSONB_CONSTRAINTS.maxKeys },
    });
  }

  // Check max depth
  const depth = getObjectDepth(val);
  if (depth > JSONB_CONSTRAINTS.maxDepth) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `JSONB exceeds maximum depth limit (${JSONB_CONSTRAINTS.maxDepth})`,
      params: { depth, maxDepth: JSONB_CONSTRAINTS.maxDepth },
    });
  }

  // Check value sizes
  if (!validateValueSizes(val, JSONB_CONSTRAINTS.maxValueSize)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `JSONB contains values exceeding size limit (${JSONB_CONSTRAINTS.maxValueSize} bytes)`,
      params: { maxValueSize: JSONB_CONSTRAINTS.maxValueSize },
    });
  }
});

/**
 * Validate JSONB input
 * @throws {z.ZodError} if validation fails
 */
export function validateJsonb(value: unknown): void {
  jsonbSchema.parse(value);
}

/**
 * Safe JSONB validation that returns validation result
 */
export function safeValidateJsonb(value: unknown): {
  success: boolean;
  error?: z.ZodError;
} {
  const result = jsonbSchema.safeParse(value);
  return {
    success: result.success,
    error: result.success ? undefined : result.error,
  };
}
