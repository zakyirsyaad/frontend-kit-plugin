import { z } from "zod"

// One schema for the client form and the server action that receives it.
export const contactSchema = z.object({
  name: z.string().trim().min(2, "Enter at least 2 characters."),
  email: z.email("Enter a valid email address."),
  topic: z.enum(["sales", "support", "billing"], { error: "Choose a topic." }),
  message: z
    .string()
    .trim()
    .min(10, "Tell us a bit more (at least 10 characters).")
    .max(1000, "Keep it under 1000 characters."),
})

export type ContactValues = z.infer<typeof contactSchema>

export const CONTACT_TOPICS: { value: ContactValues["topic"]; label: string }[] = [
  { value: "sales", label: "Sales" },
  { value: "support", label: "Support" },
  { value: "billing", label: "Billing" },
]
