/** Sampling rows for the Generation settings sheet (ADR-0013).
 *
 * Labels, order, ranges and control types mirror PocketPal's
 * CompletionSettings, which is where all of them came from. Two deliberate
 * departures, both ours and both agreed:
 *
 * - The thinking row is NOT "INCLUDE THINKING IN CONTEXT". That setting
 *   keeps reasoning text in the context for the next turn; ours turns
 *   reasoning generation on and off (`enable_thinking`), so the label says
 *   what it does rather than what PocketPal's does.
 * - JINJA (the chat-template switch) is not built: it is llama.cpp template
 *   plumbing with no equivalent here, and a switch nobody can explain is
 *   worse than no switch.
 *
 * N PREDICT and SEED are text fields, not steppers: their ranges are wide
 * enough that a stepper is unusable, and a specific seed is meant to be
 * typed.
 */

import { View } from "react-native";

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
  thinkingEnabled,
  showThinking,
  onChange,
  onThinkingChange,
}: {
  sampler: SamplerParams;
  thinkingEnabled: boolean;
  /** The thinking switch is one global, not per conversation, so it belongs
   *  to the Preset sheet only. */
  showThinking: boolean;
  onChange: (patch: Partial<SamplerParams>) => void;
  onThinkingChange: (on: boolean) => void;
}) {
  return (
    <>
      <View className="row">
        <Segmented<string>
          label="N PREDICT"
          description="Hard cap on generated tokens. Unlimited lets the model stop itself."
          value={sampler.nPredict === -1 ? UNLIMITED : CUSTOM}
          options={[UNLIMITED, CUSTOM]}
          displayFor={(v) => (v === UNLIMITED ? "Unlimited" : "Custom")}
          onPick={(v) => onChange({ nPredict: v === UNLIMITED ? -1 : 512 })}
        />
      </View>
      {sampler.nPredict !== -1 ? (
        <View className="row">
          <TextFieldRow
            label="Custom length"
            description="Tokens the model may generate before it is cut off."
            value={sampler.nPredict}
            min={1}
            placeholder="Enter a token count"
            invalidMessage="Please enter a valid number (minimum 1)"
            onCommit={(nPredict) => onChange({ nPredict })}
          />
        </View>
      ) : null}
      {showThinking ? (
        <View className="row">
          <ToggleRow
            label="Show thinking"
            description="Reasoning models show their working before the answer. Off skips the reasoning pass — faster, and the model answers directly."
            on={thinkingEnabled}
            onPress={() => onThinkingChange(!thinkingEnabled)}
          />
        </View>
      ) : null}
      <View className="row">
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
      </View>
      <View className="row">
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
      </View>
      <View className="row">
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
      </View>
      <View className="row">
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
      </View>
      <View className="row">
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
      </View>
      <View className="row">
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
      </View>
      <View className="row">
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
      </View>
      <View className="row">
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
      </View>
      <View className="row">
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
      </View>
      <View className="row">
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
      </View>
      <View className="row">
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
      </View>
      <View className="row">
        <Segmented<MirostatMode>
          label="Mirostat"
          description="Hold a target entropy instead of sampling freely. V2 is the better one."
          value={sampler.mirostat}
          options={MIROSTAT_OPTIONS}
          displayFor={(m) => MIROSTAT_LABELS[m]}
          onPick={(mirostat) => onChange({ mirostat })}
        />
      </View>
      {sampler.mirostat !== 0 ? (
        <>
          <View className="row">
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
          </View>
          <View className="row">
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
          </View>
        </>
      ) : null}
      <View className="row">
        <TextFieldRow
          label="SEED"
          description="A fixed seed reproduces a reply exactly. Leave random unless you are checking one."
          value={sampler.seed}
          placeholder="Random"
          onCommit={(seed) => onChange({ seed })}
        />
      </View>
    </>
  );
}
