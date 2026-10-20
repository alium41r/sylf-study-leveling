import { Type, type Schema } from "@google/genai";

/** Translate normalized JSON Schema into the installed Gemini SDK's schema.
 * Nullable recurrence objects must not degrade to strings or crash fallback. */
export function geminiToolSchema(value: unknown): Schema {
  if (!value || typeof value !== "object") return { type: Type.STRING };
  const input = value as Record<string, unknown>;
  if (Array.isArray(input.anyOf)) {
    const choices = input.anyOf.filter(
      (v) => !(v && typeof v === "object" && v.type === "null")
    );
    const nullable = choices.length !== input.anyOf.length;
    if (choices.length === 1)
      return {
        ...geminiToolSchema(choices[0]),
        ...(nullable ? { nullable: true } : {}),
      };
    return {
      anyOf: choices.map(geminiToolSchema),
      ...(nullable ? { nullable: true } : {}),
    };
  }
  const types: Record<string, Type> = {
    string: Type.STRING,
    number: Type.NUMBER,
    integer: Type.INTEGER,
    boolean: Type.BOOLEAN,
    array: Type.ARRAY,
    object: Type.OBJECT,
  };
  const type = Array.isArray(input.type)
    ? input.type.find((t) => t !== "null")
    : input.type;
  const result: Schema = { type: types[String(type)] ?? Type.STRING };
  if (
    (Array.isArray(input.type) && input.type.includes("null")) ||
    input.nullable === true
  )
    result.nullable = true;
  if (input.properties && typeof input.properties === "object")
    result.properties = Object.fromEntries(
      Object.entries(input.properties).map(([k, v]) => [k, geminiToolSchema(v)])
    );
  if (input.items) result.items = geminiToolSchema(input.items);
  if (Array.isArray(input.required))
    result.required = input.required.filter(
      (v): v is string => typeof v === "string"
    );
  if (typeof input.description === "string")
    result.description = input.description;
  if (
    Array.isArray(input.enum) &&
    input.enum.every((v) => typeof v === "string")
  )
    result.enum = input.enum;
  if (typeof input.pattern === "string") result.pattern = input.pattern;
  for (const key of ["minimum", "maximum"] as const)
    if (typeof input[key] === "number") result[key] = input[key];
  for (const key of ["minItems", "maxItems", "minLength", "maxLength"] as const)
    if (typeof input[key] === "number") result[key] = String(input[key]);
  return result;
}
