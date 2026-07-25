import { NumberInput } from "@astryxdesign/core/NumberInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import type { FocusEvent, ReactElement } from "react";
import { useController, type Control, type FieldPath, type RegisterOptions } from "react-hook-form";

import { validateBottleQuantity } from "../shared/quantity.ts";
import type { FormState } from "./inventory-model.ts";

export type BottleFormFieldProps = {
  readonly control: Control<FormState>;
  readonly label: string;
  readonly name: FieldPath<FormState>;
  readonly placeholder?: string;
  readonly required?: boolean;
};

function rulesFor({
  label,
  required,
}: Pick<BottleFormFieldProps, "label" | "required">): RegisterOptions<FormState> {
  return required === true
    ? {
        validate: (value) =>
          typeof value === "string" && value.trim() !== "" ? true : `${label} is required.`,
      }
    : {};
}

export function BottleTextInput({
  control,
  label,
  name,
  placeholder,
  required = false,
}: BottleFormFieldProps): ReactElement {
  const { field, fieldState } = useController({
    control,
    name,
    rules: rulesFor({ label, required }),
  });

  return (
    <TextInput
      ref={field.ref}
      autoComplete="off"
      htmlName={field.name}
      isRequired={required}
      label={label}
      placeholder={placeholder}
      status={
        fieldState.error === undefined
          ? undefined
          : { message: fieldState.error.message, type: "error" }
      }
      value={field.value}
      onBlur={field.onBlur}
      onChange={field.onChange}
    />
  );
}

export function BottleTextArea({
  control,
  label,
  name,
  placeholder,
  required = false,
}: BottleFormFieldProps): ReactElement {
  const { field, fieldState } = useController({
    control,
    name,
    rules: rulesFor({ label, required }),
  });

  return (
    <TextArea
      ref={field.ref}
      htmlName={field.name}
      isRequired={required}
      label={label}
      placeholder={placeholder}
      status={
        fieldState.error === undefined
          ? undefined
          : { message: fieldState.error.message, type: "error" }
      }
      value={field.value}
      onBlur={field.onBlur}
      onChange={field.onChange}
    />
  );
}

export function BottleQuantityInput({
  control,
}: {
  readonly control: Control<FormState>;
}): ReactElement {
  const { field, fieldState } = useController({
    control,
    name: "quantity",
    rules: {
      validate: (value) => {
        const result = validateBottleQuantity(value);
        return result.ok ? true : result.message;
      },
    },
  });
  const numericQuantity = Number(field.value);

  return (
    <NumberInput
      ref={field.ref}
      hasClear
      isIntegerOnly
      isRequired
      htmlName={field.name}
      description="Between 1 and 24 bottles."
      label="Quantity"
      status={
        fieldState.error === undefined
          ? undefined
          : { message: fieldState.error.message, type: "error" }
      }
      value={field.value.trim() !== "" && Number.isFinite(numericQuantity) ? numericQuantity : null}
      onBlur={(event: FocusEvent<HTMLInputElement>) => {
        field.onChange(event.currentTarget.value);
        field.onBlur();
      }}
      onChange={(value: number | null) => {
        field.onChange(value === null ? "" : String(value));
      }}
    />
  );
}
