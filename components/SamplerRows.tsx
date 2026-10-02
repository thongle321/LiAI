/** Sampling rows for the Generation settings sheet (ADR-0013).
 *
 * Labels, order, ranges and control types mirror PocketPal's
 * CompletionSettings, which is where all of them came from. The rows are
 * rendered DIRECTLY into the sheet's plain card (no `.row` wrappers): the
 * `.row` class draws the hairline dividers PocketPal's param card does not
 * have, and `.rows--plain` carries the 16px/24px rhythm instead.
 *
 * INCLUDE THINKING IN CONTEXT is PocketPal's own row (Q7=B), second
 * after N PREDICT: it gates whether prior reasoning travels back to the
 * model as `reasoning_content`. The enable-thinking control has no row
 * here — PocketPal keeps it as a chat-input pill, which LiAI has not
 * built yet; `thinkingEnabled` still threads through untouched.
 *
 * JINJA is built (grilling Q5): a per-turn llama.rn completion flag that
 * defaults to on; the switch pins it either way, threaded through
 * store → turn → engine like enableThinking.
 *
 * N PREDICT and SEED are text fields, not steppers: their ranges are wide
 * enough that a stepper is unusable, and a specific seed is meant to be
 * typed.
 */

import {
  Segmented,
  SliderRow,
  TextFieldRow,
  ToggleRow,
} from "./SettingsRows.tsx";
import type { MirostatMode, SamplerParams } from "../lib/inference/sampler.ts";

const MIROSTAT_OPTIONS: MirostatMode[] = [0, 1, 2];
const MIROSTAT_LABELS = ["Off", "v1", "v2"] as const;
const UNLIMITED = "unlimited";
const CUSTOM = "custom";

function fixed(value: number, places = 2): string {
  return value.toFixed(places);
}

export function SamplerRows({
  sampler,
  jinjaEnabled,
  errors,
  onChange,
  onJinjaChange,
}: {
  sampler: SamplerParams;
  jinjaEnabled: boolean;
  /** Save-time validation marks (Q6=C) for the typed fields. */
  errors?: Partial<Record<"seed" | "nPredict", string>>;
  onChange: (patch: Partial<SamplerParams>) => void;
  onJinjaChange: (on: boolean) => void;
}) {
  return (
    <>
      <Segmented<string>
        label="N PREDICT"
        description="Hard cap on generated tokens. Unlimited lets the model stop itself."
        value={sampler.nPredict === -1 ? UNLIMITED : CUSTOM}
        options={[UNLIMITED, CUSTOM]}
        displayFor={(v) => (v === UNLIMITED ? "Unlimited" : "Custom")}
        onPick={(v) => onChange({ nPredict: v === UNLIMITED ? -1 : 1024 })}
      />
      {sampler.nPredict !== -1 ? (
        <TextFieldRow
          label="Custom length"
          description="Tokens the model may generate before it is cut off."
          value={sampler.nPredict}
          min={1}
          placeholder="Enter a token count"
          invalidMessage="Please enter a valid number (minimum 1)"
          error={errors?.nPredict}
          onCommit={(nPredict) => onChange({ nPredict })}
        />
      ) : null}
      <ToggleRow
        label="INCLUDE THINKING IN CONTEXT"
        description="Include AI thinking/reasoning parts in the context sent to the model. Disabling this can save context space. It might impact performance."
        on={sampler.includeThinkingInContext ?? true}
        onPress={() =>
          onChange({
            includeThinkingInContext: !(sampler.includeThinkingInContext ?? true),
          })
        }
      />
      <SliderRow
        label="TEMPERATURE"
        description="Lower is more focused and repeatable, higher is more varied."
        display={fixed(sampler.temperature)}
        value={sampler.temperature}
        min={0}
        max={2}
        step={0.01}
        onChange={(temperature) => onChange({ temperature })}
      />
      <SliderRow
        label="TOP K"
        description="How many tokens may be considered at all."
        display={`${sampler.topK}`}
        value={sampler.topK}
        min={1}
        max={128}
        step={1}
        onChange={(topK) => onChange({ topK })}
      />
      <SliderRow
        label="TOP P"
        description="Narrow the field to the most likely share of probability."
        display={fixed(sampler.topP)}
        value={sampler.topP}
        min={0}
        max={1}
        step={0.01}
        onChange={(topP) => onChange({ topP })}
      />
      <SliderRow
        label="MIN P"
        description="Drop tokens far less likely than the best one, however unlikely."
        display={fixed(sampler.minP)}
        value={sampler.minP}
        min={0}
        max={1}
        step={0.01}
        onChange={(minP) => onChange({ minP })}
      />
      <SliderRow
        label="XTC THRESHOLD"
        description="How far below the top token a token must be to be dropped."
        display={fixed(sampler.xtcThreshold)}
        value={sampler.xtcThreshold}
        min={0}
        max={1}
        step={0.01}
        onChange={(xtcThreshold) => onChange({ xtcThreshold })}
      />
      <SliderRow
        label="XTC PROBABILITY"
        description="Chance of removing the least likely token. Removes repetition loops."
        display={fixed(sampler.xtcProbability)}
        value={sampler.xtcProbability}
        min={0}
        max={1}
        step={0.01}
        onChange={(xtcProbability) => onChange({ xtcProbability })}
      />
      <SliderRow
        label="TYPICAL P"
        description="Favour tokens near the distribution's own entropy."
        display={fixed(sampler.typicalP)}
        value={sampler.typicalP}
        min={0}
        max={2}
        step={0.01}
        onChange={(typicalP) => onChange({ typicalP })}
      />
      <SliderRow
        label="PENALTY LAST N"
        description="How many recent tokens the penalties look back over."
        display={`${sampler.penaltyLastN}`}
        value={sampler.penaltyLastN}
        min={0}
        max={256}
        step={1}
        onChange={(penaltyLastN) => onChange({ penaltyLastN })}
      />
      <SliderRow
        label="PENALTY REPEAT"
        description="Pushes the model off text it has already used."
        display={fixed(sampler.penaltyRepeat)}
        value={sampler.penaltyRepeat}
        min={0}
        max={2}
        step={0.01}
        onChange={(penaltyRepeat) => onChange({ penaltyRepeat })}
      />
      <SliderRow
        label="PENALTY FREQ"
        description="Scales the penalty by how often a token has appeared."
        display={fixed(sampler.penaltyFrequency)}
        value={sampler.penaltyFrequency}
        min={0}
        max={2}
        step={0.01}
        onChange={(penaltyFrequency) => onChange({ penaltyFrequency })}
      />
      <SliderRow
        label="PENALTY PRESENT"
        description="Flat penalty for any token already present."
        display={fixed(sampler.penaltyPresence)}
        value={sampler.penaltyPresence}
        min={0}
        max={2}
        step={0.01}
        onChange={(penaltyPresence) => onChange({ penaltyPresence })}
      />
      <Segmented<MirostatMode>
        label="Mirostat"
        description="Hold a target entropy instead of sampling freely. V2 is the better one."
        value={sampler.mirostat}
        options={MIROSTAT_OPTIONS}
        displayFor={(m) => MIROSTAT_LABELS[m]}
        onPick={(mirostat) => onChange({ mirostat })}
      />
      {sampler.mirostat !== 0 ? (
        <>
          <SliderRow
            label="MIROSTAT TAU"
            description="The entropy to hold. Lower is more literal, higher looser."
            display={fixed(sampler.mirostatTau, 1)}
            value={sampler.mirostatTau}
            min={0}
            max={10}
            step={1}
            onChange={(mirostatTau) => onChange({ mirostatTau })}
          />
          <SliderRow
            label="MIROSTAT ETA"
            description="How fast it corrects toward that entropy."
            display={fixed(sampler.mirostatEta)}
            value={sampler.mirostatEta}
            min={0}
            max={1}
            step={0.01}
            onChange={(mirostatEta) => onChange({ mirostatEta })}
          />
        </>
      ) : null}
      <TextFieldRow
        label="SEED"
        description="A fixed seed reproduces a reply exactly. Leave random unless you are checking one."
        value={sampler.seed}
        placeholder="Random"
        error={errors?.seed}
        onCommit={(seed) => onChange({ seed })}
      />
      <ToggleRow
        label="JINJA"
        description="Use the model's built-in Jinja chat template when it ships one. Off falls back to llama.cpp's plain template."
        on={jinjaEnabled}
        onPress={() => onJinjaChange(!jinjaEnabled)}
      />
    </>
  );
}
