// Skills answers how my ability is growing: five attributes, each with its tier and what the next one is. Raising one costs skill points or Sylph and
// cannot be undone, so it asks first, in the server's own price. The server decides what can be afforded and answers a refusal in words. Skill nodes
// are not here yet: the node catalog is still a generic frame with no names or perks, so there is nothing a student could usefully choose.
import { useState } from "react";
import { View } from "react-native";
import { Button, Callout, Dialog, Progress, Stack, Text, useNotice, useTheme } from "@sylf/design-system";
import type { Ability, InvestCurrency } from "@sylf/backend";
import { useLiveBackend } from "../../../shell/backend";
import { describeFailureText } from "../../../shell/account/failure";
import { HomeColumns, Section } from "../HomePage";
import { mentionsHp } from "./shared";
import { refreshProgress, useAttributes } from "./useProgress";

interface Purchase { ability: Ability; currency: InvestCurrency }

function AbilityRow({ ability, skillPoints, sylph, busy, onBuy }: { ability: Ability; skillPoints: number; sylph: number; busy: boolean; onBuy: (currency: InvestCurrency) => void }) {
  const { space } = useTheme();
  const canSp = ability.investable && skillPoints >= ability.costSp;
  const canSylph = ability.investable && sylph >= ability.costSylph;
  return (
    <Stack gap="sm" testID={`progress-attribute-${ability.key}`}>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.md }}>
        <Text variant="subheading" style={{ flex: 1 }}>{ability.label}</Text>
        <Text variant="value" tone="soft">{`${ability.value} of ${ability.cap}`}</Text>
      </View>
      <Progress value={Math.min(1, ability.value / Math.max(1, ability.cap))} label={`${ability.label}, tier ${ability.tier} of ${ability.maxTier}`} />
      <Text variant="caption" tone="soft">{ability.description}</Text>
      {ability.perkName && ability.perkLadder && !mentionsHp(ability.perkLadder) ? <Text variant="caption" tone="soft">{`${ability.perkName}. ${ability.perkLadder}`}</Text> : null}
      <Text variant="caption" tone="soft">{ability.nextTierAt === null ? `Tier ${ability.tier}, the highest.` : `Tier ${ability.tier} of ${ability.maxTier}. The next tier is at ${ability.nextTierAt}.`}</Text>
      {ability.investable ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          <Button title={`Raise for ${ability.costSp} skill ${ability.costSp === 1 ? "point" : "points"}`} size="small" disabled={!canSp || busy} testID={`progress-invest-sp-${ability.key}`} onPress={() => onBuy("sp")} />
          <Button title={`Raise for ${ability.costSylph.toLocaleString()} Sylph`} size="small" variant="ghost" disabled={!canSylph || busy} testID={`progress-invest-sylph-${ability.key}`} onPress={() => onBuy("sylph")} />
        </View>
      ) : <Text variant="caption" tone="soft">{ability.value >= ability.cap ? "At the limit for your level. Levelling up raises it." : "Fully raised."}</Text>}
    </Stack>
  );
}

export function SkillsView() {
  const backend = useLiveBackend();
  const notice = useNotice();
  const result = useAttributes();
  const [buying, setBuying] = useState<Purchase | null>(null);
  const [busy, setBusy] = useState(false);
  const data = result?.data;
  const confirm = async () => {
    if (!backend || !buying || busy) return;
    const { ability, currency } = buying;
    setBusy(true);
    setBuying(null);
    try { await backend.reads.progress.invest(ability.key, currency); notice(`${ability.label} raised.`); }
    catch (error) { notice(describeFailureText(error)); }
    refreshProgress(backend);
    setBusy(false);
  };
  if (!result) return <View testID="progress-skills"><Text tone="soft">Loading your attributes.</Text></View>;
  if (!data) return <View testID="progress-skills"><Callout tone="caution" title="Attributes didn't load" message={result.live.failure ?? "Try again in a moment."} /></View>;
  const cost = buying ? (buying.currency === "sp" ? `${buying.ability.costSp} skill ${buying.ability.costSp === 1 ? "point" : "points"}` : `${buying.ability.costSylph.toLocaleString()} Sylph`) : "";
  return (
    <View testID="progress-skills">
      <HomeColumns
        primary={<Section title="Attributes"><Stack gap="xl">{data.abilities.map((ability) => <AbilityRow key={ability.key} ability={ability} skillPoints={data.skillPoints} sylph={data.sylph} busy={busy} onBuy={(currency) => setBuying({ ability, currency })} />)}</Stack></Section>}
        secondary={[
          <Section key="balance" title="To spend">
            <Stack gap="xs">
              <Text variant="small" testID="progress-skill-points">{`${data.skillPoints} skill ${data.skillPoints === 1 ? "point" : "points"}`}</Text>
              <Text variant="small" tone="soft" testID="progress-sylph-balance">{`${data.sylph.toLocaleString()} Sylph`}</Text>
              <Text variant="caption" tone="soft">Each raise adds five. Skill nodes arrive later.</Text>
            </Stack>
          </Section>,
        ]}
      />
      <Dialog open={buying !== null} onClose={() => setBuying(null)} title={buying ? `Raise ${buying.ability.label}?` : ""} message={buying ? `It goes up by 5, to ${buying.ability.value + 5}, and costs ${cost}. This can't be undone.` : undefined} actions={[{ label: "Not now", onPress: () => setBuying(null) }, { label: "Raise", variant: "emphasis", onPress: () => void confirm() }]} />
    </View>
  );
}
