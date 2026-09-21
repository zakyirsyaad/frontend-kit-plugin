"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm } from "react-hook-form"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

import { CONTACT_TOPICS, contactSchema, type ContactValues } from "./contact-schema"

export function ContactForm({
  onSubmit,
}: {
  /** Receives validated values. Throw to show a form-level error. */
  onSubmit: (values: ContactValues) => Promise<void> | void
}) {
  const form = useForm<ContactValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: { name: "", email: "", topic: undefined, message: "" },
    mode: "onTouched",
  })
  const { isSubmitting, isSubmitSuccessful, errors } = form.formState

  async function submit(values: ContactValues) {
    try {
      await onSubmit(values)
    } catch (error) {
      form.setError("root", {
        message: error instanceof Error ? error.message : "Could not send the message.",
      })
    }
  }

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle>Contact us</CardTitle>
        <CardDescription>We usually reply within one working day.</CardDescription>
      </CardHeader>
      <form noValidate onSubmit={form.handleSubmit(submit)}>
        <CardContent>
          <FieldGroup>
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>Name</FieldLabel>
                  <Input {...field} id={field.name} autoComplete="name" aria-invalid={fieldState.invalid} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            <Controller
              name="email"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>Email</FieldLabel>
                  <Input
                    {...field}
                    id={field.name}
                    type="email"
                    autoComplete="email"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            <Controller
              name="topic"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>Topic</FieldLabel>
                  <Select name={field.name} value={field.value ?? ""} onValueChange={field.onChange}>
                    <SelectTrigger id={field.name} onBlur={field.onBlur} aria-invalid={fieldState.invalid}>
                      <SelectValue placeholder="Choose a topic" />
                    </SelectTrigger>
                    <SelectContent>
                      {CONTACT_TOPICS.map((topic) => (
                        <SelectItem key={topic.value} value={topic.value}>
                          {topic.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            <Controller
              name="message"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>Message</FieldLabel>
                  <Textarea {...field} id={field.name} rows={5} aria-invalid={fieldState.invalid} />
                  <FieldDescription>{field.value.length}/1000 characters</FieldDescription>
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
          </FieldGroup>
        </CardContent>
        <CardFooter className="mt-6 flex-col items-stretch gap-3">
          {errors.root && <FieldError>{errors.root.message}</FieldError>}
          {isSubmitSuccessful && !errors.root && (
            <p role="status" className="text-sm text-muted-foreground">
              Thanks — your message was sent.
            </p>
          )}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Sending…" : "Send message"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}
