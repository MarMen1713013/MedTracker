import React, { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface DoseInputProps {
  value: number;
  onChange: (value: number) => void;
  label?: string;
}

const FRACTIONS = [
  { label: "—", value: 0 },
  { label: "¼", value: 0.25 },
  { label: "⅓", value: 1 / 3 },
  { label: "½", value: 0.5 },
  { label: "⅔", value: 2 / 3 },
  { label: "¾", value: 0.75 },
];

function decimalToWholeFraction(decimal: number): { whole: number; fractionValue: number } {
  const whole = Math.floor(decimal);
  const frac = decimal - whole;

  // Find closest fraction
  let closest = FRACTIONS[0];
  let minDiff = Math.abs(frac - closest.value);
  for (const f of FRACTIONS) {
    const diff = Math.abs(frac - f.value);
    if (diff < minDiff) {
      minDiff = diff;
      closest = f;
    }
  }
  return { whole, fractionValue: closest.value };
}

export function DoseInput({ value, onChange }: DoseInputProps) {
  const { whole: initWhole, fractionValue: initFrac } = decimalToWholeFraction(value);
  const [whole, setWhole] = useState(initWhole);
  const [fractionValue, setFractionValue] = useState(initFrac);

  useEffect(() => {
    const { whole: w, fractionValue: f } = decimalToWholeFraction(value);
    setWhole(w);
    setFractionValue(f);
  }, [value]);

  const handleWholeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const w = Math.max(0, parseInt(e.target.value) || 0);
    setWhole(w);
    onChange(w + fractionValue);
  };

  const handleFractionChange = (v: string) => {
    const f = parseFloat(v);
    setFractionValue(f);
    onChange(whole + f);
  };

  const selectedFractionLabel =
    FRACTIONS.find((f) => Math.abs(f.value - fractionValue) < 0.001)?.label ?? "—";

  return (
    <div className="flex items-center gap-2">
      <Input
        type="number"
        min="0"
        step="1"
        value={whole}
        onChange={handleWholeChange}
        className="w-20"
      />
      <Select
        value={String(fractionValue)}
        onValueChange={handleFractionChange}
      >
        <SelectTrigger className="w-20">
          <SelectValue>{selectedFractionLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {FRACTIONS.map((f) => (
            <SelectItem key={f.label} value={String(f.value)}>
              {f.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-sm text-muted-foreground tabular-nums">
        = {(whole + fractionValue).toFixed(fractionValue === 0 ? 0 : 2)}
      </span>
    </div>
  );
}
