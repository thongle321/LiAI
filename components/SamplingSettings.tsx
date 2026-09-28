/** Sampling rows: what the model is allowed to do next (ADR-0013).
 *
 * One list, two hosts — the global section in Settings and the per-model
 * Generation sheet both render `SamplerRows` from a resolved view, so a
 * control can never exist in one place and not the other.
 *
 * Sentinels are reachable on purpose: seed -1 ("Random") and nPredict -1
 * ("Unlimited") sit at the bottom of their stepper range, so a user can walk
 * back to them instead of only away from them.
 */

import { Pressable, Text, View } from "react-native";

import {
  SettingsSection,
  Segmented,
  SliderRow,
  StepperRow,
  ToggleRow,
} from "./SettingsRows.tsx";
import { DEFAULT_SAMPLER, type MirostatMode, type SamplerParams } from "../lib/inference/sampler.ts";
import { useInference } from "../store/inference.ts";

const MIROSTAT_OPTIONS: MirostatMode[] = [0, 1, 2];
const MIROSTAT_LABELS = ["Off", "v1", "v2"] as const;

/** The UI ceiling for Seed, deliberately far below the store's: it is a
 *  stepper, not a field, and stepping to a nine-digit seed is not a thing
 *  anyone does. Random (-1) is the state that matters; a specific seed is
 *  for reproducing one reply. */
const SEED_UI_MAX = 1024;

function fixed(value: number, places = 2): string {
  return value.toFixed(places);
}

/** The rows themselves. `sampler` is a resolved view; `onChange` takes a
 *  patch so the host decides whether that means global or per-model. */
export function SamplerRows({
  sampler,
  onChange,
}: {
  sampler: SamplerParams;
  onChange: (patch: Partial<SamplerParams>) => void;
}) {
  return (
    <>
      <View className="row">
        <SliderRow
          label="Temperature"
          description="Lower is more focused and repeatable, higher is more varied."
          display={fixed(sampler.temperature)}
          value={sampler.temperature}
          min={0}
          max={2}
          step={0.05}
          onChange={(temperature) => onChange({ temperature })}
        />
      </View>
      <View className="row">
        <SliderRow
          label="Top K"
          description="How many tokens may be considered at all."
          display={`${sampler.topK}`}
          value={sampler.topK}
          min={0}
          max={1000}
          step={1}
          onChange={(topK) => onChange({ topK })}
        />
      </View>
      <View className="row">
        <SliderRow
          label="Top P"
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
          label="Min P"
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
          label="Typical P"
          description="Favour tokens near the distribution's own entropy."
          display={fixed(sampler.typicalP)}
          value={sampler.typicalP}
          min={0}
          max={1}
          step={0.01}
          onChange={(typicalP) => onChange({ typicalP })}
        />
      </View>
      <View className="row">
        <SliderRow
          label="XTC probability"
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
          label="XTC threshold"
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
          label="Repeat penalty"
          description="Pushes the model off text it has already used."
          display={fixed(sampler.penaltyRepeat)}
          value={sampler.penaltyRepeat}
          min={0}
          max={2}
          step={0.05}
          onChange={(penaltyRepeat) => onChange({ penaltyRepeat })}
        />
      </View>
      <View className="row">
        <SliderRow
          label="Frequency penalty"
          description="Scales the penalty by how often a token has appeared."
          display={fixed(sampler.penaltyFrequency)}
          value={sampler.penaltyFrequency}
          min={0}
          max={2}
          step={0.05}
          onChange={(penaltyFrequency) => onChange({ penaltyFrequency })}
        />
      </View>
      <View className="row">
        <SliderRow
          label="Presence penalty"
          description="Flat penalty for any token already present."
          display={fixed(sampler.penaltyPresence)}
          value={sampler.penaltyPresence}
          min={0}
          max={2}
          step={0.05}
          onChange={(penaltyPresence) => onChange({ penaltyPresence })}
        />
      </View>
      <View className="row">
        <StepperRow
          label="Penalty window"
          description="How many recent tokens the penalties look back over."
          display={`${sampler.penaltyLastN}`}
          onMinus={() => onChange({ penaltyLastN: sampler.penaltyLastN - 16 })}
          onPlus={() => onChange({ penaltyLastN: sampler.penaltyLastN + 16 })}
          minusDisabled={sampler.penaltyLastN <= 0}
          plusDisabled={sampler.penaltyLastN >= 65536}
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
              label="Mirostat target entropy"
              description="Lower is more literal, higher is looser."
              display={fixed(sampler.mirostatTau, 1)}
              value={sampler.mirostatTau}
              min={0}
              max={10}
              step={0.1}
              onChange={(mirostatTau) => onChange({ mirostatTau })}
            />
          </View>
          <View className="row">
            <SliderRow
              label="Mirostat learning rate"
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
        <StepperRow
          label="Reply length"
          description="Hard cap on generated tokens. Unlimited lets the model stop itself."
          display={sampler.nPredict === -1 ? "Unlimited" : `${sampler.nPredict}`}
          onMinus={() =>
            onChange({
              nPredict: sampler.nPredict === -1 ? -1 : sampler.nPredict - 64,
            })
          }
          onPlus={() =>
            onChange({
              nPredict: sampler.nPredict === -1 ? 64 : sampler.nPredict + 64,
            })
          }
          minusDisabled={sampler.nPredict === -1}
          plusDisabled={sampler.nPredict >= 8192}
        />
      </View>
      <View className="row">
        <StepperRow
          label="Seed"
          description="A fixed seed reproduces a reply exactly. Random varies every turn."
          display={sampler.seed === -1 ? "Random" : `${sampler.seed}`}
          onMinus={() => onChange({ seed: sampler.seed === -1 ? -1 : sampler.seed - 1 })}
          onPlus={() => onChange({ seed: sampler.seed === -1 ? 0 : sampler.seed + 1 })}
          minusDisabled={sampler.seed === -1}
          plusDisabled={sampler.seed >= SEED_UI_MAX}
        />
      </View>
    </>
  );
}

/** The global section in Settings: the whole sampler, nothing overridden. */
export function SamplingSettings() {
  const { sampler, setSampler } = useInference();
  return (
    <SettingsSection
      title="Sampling"
      description="How the model chooses each word. Defaults are tuned for conversation; a model can override them from its own settings."
    >
      <SamplerRows sampler={sampler} onChange={setSampler} />
      <View className="row">
        <Pressable
          onPress={() => setSampler(DEFAULT_SAMPLER)}
          className="btn btn--secondary"
          accessibilityRole="button"
          accessibilityLabel="Reset sampling settings to defaults"
        >
          <Text className="font-sans text-body-md text-primary">
            Reset to defaults
          </Text>
        </Pressable>
      </View>
    </SettingsSection>
  );
}
