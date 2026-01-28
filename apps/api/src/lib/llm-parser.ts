import { logger } from './logger.js';

/**
 * Result type for LLM JSON parsing
 */
export type ParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: Error; raw: string };

/**
 * Regex patterns for extracting JSON from LLM responses
 */
const JSON_EXTRACTION_PATTERNS = {
  // Match JSON code blocks with optional language specifier
  CODE_BLOCK: /```(?:json)?\s*([\s\S]*?)```/,
  // Check if content starts with JSON object or array
  STARTS_WITH_OBJECT: /^\s*\{/,
  STARTS_WITH_ARRAY: /^\s*\[/,
} as const;

/**
 * Options for LLM JSON parsing
 */
export interface LLMParseOptions {
  /** Expected type: 'object' (default) or 'array' */
  expectedType?: 'object' | 'array';
  /** Whether to log parsing failures (default: true) */
  logErrors?: boolean;
  /** Context for error logging */
  context?: string;
}

/**
 * Extracts JSON string from LLM response that may contain markdown code blocks
 * or other surrounding text.
 */
export function extractJsonString(content: string, expectedType: 'object' | 'array' = 'object'): string {
  const trimmed = content.trim();
  
  // Check if content already starts with expected JSON
  const startsCorrectly = expectedType === 'array' 
    ? JSON_EXTRACTION_PATTERNS.STARTS_WITH_ARRAY.test(trimmed)
    : JSON_EXTRACTION_PATTERNS.STARTS_WITH_OBJECT.test(trimmed);
  
  if (startsCorrectly) {
    return trimmed;
  }
  
  // Try to extract from markdown code block
  const codeBlockMatch = trimmed.match(JSON_EXTRACTION_PATTERNS.CODE_BLOCK);
  if (codeBlockMatch?.[1]) {
    return codeBlockMatch[1].trim();
  }
  
  // Return original content as fallback
  return trimmed;
}

/**
 * Parses JSON from an LLM response, handling common formatting issues like
 * markdown code blocks and extra text.
 * 
 * @param content - Raw LLM response content
 * @param options - Parsing options
 * @returns ParseResult with typed data on success, or error details on failure
 * 
 * @example
 * ```typescript
 * // Parse object response
 * const result = parseLLMJsonResponse<AnalysisResult>(response.content);
 * if (result.success) {
 *   console.log(result.data.summary);
 * }
 * 
 * // Parse array response
 * const issues = parseLLMJsonResponse<Issue[]>(response.content, { expectedType: 'array' });
 * ```
 */
export function parseLLMJsonResponse<T>(
  content: string,
  options: LLMParseOptions = {}
): ParseResult<T> {
  const { 
    expectedType = 'object', 
    logErrors = true, 
    context = 'LLM response' 
  } = options;
  
  try {
    const jsonStr = extractJsonString(content, expectedType);
    const parsed = JSON.parse(jsonStr) as T;
    
    // Validate that we got the expected type
    const isArray = Array.isArray(parsed);
    if (expectedType === 'array' && !isArray) {
      throw new Error(`Expected array but got ${typeof parsed}`);
    }
    if (expectedType === 'object' && (isArray || typeof parsed !== 'object' || parsed === null)) {
      throw new Error(`Expected object but got ${isArray ? 'array' : typeof parsed}`);
    }
    
    return { success: true, data: parsed };
  } catch (error) {
    const parseError = error instanceof Error ? error : new Error(String(error));
    
    if (logErrors) {
      logger.warn(
        { 
          error: parseError.message, 
          context,
          responsePreview: content.substring(0, 200) 
        }, 
        `Failed to parse ${context} as JSON`
      );
    }
    
    return { 
      success: false, 
      error: parseError,
      raw: content 
    };
  }
}

/**
 * Parses JSON from LLM response with a fallback value on failure.
 * Useful when you want to continue execution even if parsing fails.
 * 
 * @param content - Raw LLM response content  
 * @param fallback - Value to return if parsing fails
 * @param options - Parsing options
 * @returns Parsed data or fallback value
 * 
 * @example
 * ```typescript
 * const issues = parseLLMJsonOrDefault<Issue[]>(response.content, [], { expectedType: 'array' });
 * // Always returns an array, even if parsing fails
 * ```
 */
export function parseLLMJsonOrDefault<T>(
  content: string,
  fallback: T,
  options: LLMParseOptions = {}
): T {
  const result = parseLLMJsonResponse<T>(content, options);
  return result.success ? result.data : fallback;
}

/**
 * Parses JSON from LLM response and throws on failure.
 * Use when parsing failure should stop execution.
 * 
 * @param content - Raw LLM response content
 * @param options - Parsing options  
 * @returns Parsed data
 * @throws Error if parsing fails
 * 
 * @example
 * ```typescript
 * try {
 *   const analysis = parseLLMJsonOrThrow<Analysis>(response.content);
 *   // Use analysis...
 * } catch (error) {
 *   // Handle parsing failure
 * }
 * ```
 */
export function parseLLMJsonOrThrow<T>(
  content: string,
  options: LLMParseOptions = {}
): T {
  const result = parseLLMJsonResponse<T>(content, options);
  
  if (!result.success) {
    throw result.error;
  }
  
  return result.data;
}
