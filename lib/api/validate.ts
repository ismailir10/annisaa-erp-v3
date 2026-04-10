import { NextResponse } from "next/server";
import { ZodSchema, ZodError } from "zod";

/**
 * Validate request body against a Zod schema.
 * Returns { data } on success, or a NextResponse with validation errors.
 *
 * Usage:
 *   const result = await validateBody(createStudentSchema, await req.json());
 *   if (result.error) return result.error;
 *   const { name, dateOfBirth } = result.data;
 */
export async function validateBody<T>(
  schema: ZodSchema<T>,
  body: unknown
): Promise<{ data: T; error?: never } | { data?: never; error: NextResponse }> {
  try {
    const data = schema.parse(body);
    return { data };
  } catch (e) {
    if (e instanceof ZodError) {
      const errors = e.issues.map((err) => ({
        field: err.path.join("."),
        message: err.message,
      }));
      return {
        error: NextResponse.json(
          { error: "Validasi gagal", errors },
          { status: 400 }
        ),
      };
    }
    return {
      error: NextResponse.json(
        { error: "Data tidak valid" },
        { status: 400 }
      ),
    };
  }
}
