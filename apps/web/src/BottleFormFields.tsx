import { NumberInput } from "@astryxdesign/core/NumberInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import type { FocusEvent, ReactElement } from "react";
import { useController, type Control, type FieldPath, type RegisterOptions } from "react-hook-form";

import { validateBottleQuantity } from "../shared/quantity.ts";
import {
  parseOptionalDecimal,
  parseOptionalVolumeMl,
  parseOptionalYear,
  type FormState,
} from "./inventory-model.ts";

export type BottleFormFieldProps = {
  readonly control: Control<FormState>;
  readonly label: string;
  readonly name: FieldPath<FormState>;
  readonly placeholder?: string;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly description?: string | undefined;
};

function rulesFor({
  label,
  name,
  required,
}: {
  readonly label: string;
  readonly name: FieldPath<FormState>;
  readonly required: boolean | undefined;
}): RegisterOptions<FormState> {
  return {
    validate: (value) => {
      if (typeof value !== "string" || value.trim() === "") {
        return required === true ? `${label} is required.` : true;
      }
      if (name === "vintageYear" || name === "drinkFromYear" || name === "drinkToYear") {
        const year = parseOptionalYear(value);
        return year !== undefined && year >= 1800 && year <= 2200
          ? true
          : `${label} must be a whole year from 1800 to 2200.`;
      }
      if (name === "alcoholPercent") {
        const alcohol = parseOptionalDecimal(value);
        return alcohol !== undefined && alcohol >= 0 && alcohol <= 100
          ? true
          : "Alcohol must be a percentage from 0 to 100.";
      }
      if (name === "bottleVolumeMl") {
        const volume = parseOptionalVolumeMl(value);
        return volume !== undefined && volume >= 1 && volume <= 30_000
          ? true
          : "Bottle size must be a whole number from 1 to 30000 ml.";
      }
      return true;
    },
  };
}

export function BottleTextInput({
  control,
  label,
  name,
  placeholder,
  required = false,
  disabled = false,
  description,
}: BottleFormFieldProps): ReactElement {
  const { field, status } = useBottleField({ control, label, name, required });

  return (
    <TextInput
      ref={field.ref}
      autoComplete="off"
      htmlName={field.name}
      isDisabled={disabled}
      description={description}
      isRequired={required}
      label={label}
      placeholder={placeholder}
      status={status}
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
  const { field, status } = useBottleField({ control, label, name, required });

  return (
    <TextArea
      ref={field.ref}
      htmlName={field.name}
      isRequired={required}
      label={label}
      placeholder={placeholder}
      status={status}
      value={field.value}
      onBlur={field.onBlur}
      onChange={field.onChange}
    />
  );
}

function useBottleField({ control, label, name, required }: BottleFormFieldProps) {
  const { field, fieldState } = useController({
    control,
    name,
    rules: rulesFor({ label, name, required }),
  });
  return {
    field,
    status:
      fieldState.error === undefined
        ? undefined
        : { message: fieldState.error.message, type: "error" as const },
  };
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
