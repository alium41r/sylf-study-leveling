// Sequential quest timeline: completion checkmarks beside each quest, filled and ticked when done, connected by lines showing order,
// with breathing room and a content-side hairline between rows. Reads only Aloft semantic tokens so every theme personality adapts.
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { Button, Icon, Press, Text, move, useTheme } from "@sylf/design-system";

const NODE_SIZE = 22;
const RAIL_WIDTH = 26;
const NODE_TOP_OFFSET = 2;
const LINE_GAP = 3;

export interface QuestStep {
  id: string;
  title: string;
  meta: string;
  subjectColour?: string | null;
  done: boolean;
  /** Highlights the next open quest to work on. */
  active?: boolean;
  /** Future scheduled quest: hollow node on the timeline without a completion toggle. */
  upcoming?: boolean;
  disabled?: boolean;
  testID?: string;
  onToggle?: () => void;
  onOpen?: () => void;
  actionLabel?: string;
  actionTestID?: string;
  onAction?: () => void;
}

function nodePalette(step: QuestStep, color: ReturnType<typeof useTheme>["color"]) {
  return {
    borderColor: step.done ? color.accent.fill : step.active ? color.accent.mote : color.lineStrong,
    backgroundColor: step.done ? color.accent.fill : step.active ? color.accent.wash : color.ground,
  };
}

function StaticQuestNode({
  step,
  nodeRadius,
  borderWidth,
}: {
  step: QuestStep;
  nodeRadius: number;
  borderWidth: number;
}) {
  const { color } = useTheme();
  const { borderColor, backgroundColor } = nodePalette(step, color);

  return (
    <View
      style={{
        width: NODE_SIZE,
        height: NODE_SIZE,
        borderRadius: nodeRadius,
        borderWidth,
        borderColor,
        backgroundColor,
        alignItems: "center",
        justifyContent: "center",
        opacity: step.upcoming ? 0.75 : 1,
      }}
    >
      {step.done ? <Icon name="check" size={13} color={color.accent.on} /> : null}
    </View>
  );
}

function InteractiveQuestNode({
  step,
  nodeRadius,
  borderWidth,
}: {
  step: QuestStep;
  nodeRadius: number;
  borderWidth: number;
}) {
  const { color, motion } = useTheme();
  const [hovered, setHovered] = useState(false);
  const progress = useSharedValue(step.done ? 1 : 0);
  const prevDone = useRef(step.done);

  useEffect(() => {
    if (prevDone.current === step.done) return;
    prevDone.current = step.done;
    progress.value = move(step.done ? 1 : 0, motion);
  }, [step.done, motion, progress]);

  const tickStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.7 + 0.3 * progress.value }],
  }));

  const { borderColor, backgroundColor } = nodePalette(step, color);

  const box = (
    <View
      style={{
        width: NODE_SIZE,
        height: NODE_SIZE,
        borderRadius: nodeRadius,
        borderWidth,
        borderColor,
        backgroundColor,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Animated.View style={[{ position: "absolute" }, tickStyle]}>
        <Icon name="check" size={13} color={color.accent.on} />
      </Animated.View>
      {!step.done && hovered ? (
        <View style={{ opacity: 0.45 }}>
          <Icon name="check" size={12} color={step.active ? color.accent.ink : color.inkSoft} />
        </View>
      ) : null}
    </View>
  );

  if (step.done) {
    return (
      <View role="checkbox" aria-checked={true} aria-label={`${step.title}, completed`}>
        {box}
      </View>
    );
  }

  return (
    <Press
      role="checkbox"
      checked={step.done}
      disabled={step.disabled}
      label={`Complete ${step.title}`}
      feedback="none"
      radius={nodeRadius}
      hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
      onHover={setHovered}
      onPress={step.onToggle!}
    >
      {box}
    </Press>
  );
}

function QuestNode({
  step,
  nodeRadius,
  borderWidth,
}: {
  step: QuestStep;
  nodeRadius: number;
  borderWidth: number;
}) {
  if (!step.onToggle) {
    return <StaticQuestNode step={step} nodeRadius={nodeRadius} borderWidth={borderWidth} />;
  }
  return <InteractiveQuestNode step={step} nodeRadius={nodeRadius} borderWidth={borderWidth} />;
}

function QuestStepRow({
  step,
  first,
  last,
  prevDone,
  nextDone,
}: {
  step: QuestStep;
  first: boolean;
  last: boolean;
  prevDone: boolean;
  nextDone: boolean;
}) {
  const { color, icon, material, shape, space } = useTheme();
  const nodeRadius = Math.min(shape.radius.sm, NODE_SIZE / 2);
  const lineWidth = Math.max(1.5, Math.min(2.5, icon.stroke));
  const nodeBorderWidth = Math.max(1.5, Math.min(2, material.border.float || 1.5));
  const rowTop = first ? 0 : space.md;
  const topLineHeight = Math.max(0, rowTop + NODE_TOP_OFFSET - LINE_GAP);
  const topLineColour = prevDone && step.done ? color.accent.line : color.lineStrong;
  const bottomLineColour = step.done && nextDone ? color.accent.line : color.lineStrong;
  const dotRadius = Math.min(shape.radius.xs, space.sm / 2);

  const textBlock = (
    <View style={{ gap: space.hair }}>
      <Text variant="body" tone={step.done ? "soft" : "ink"} numberOfLines={2}>
        {step.title}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs + 2 }}>
        {step.subjectColour ? (
          <View
            aria-hidden
            style={{
              width: space.sm,
              height: space.sm,
              borderRadius: dotRadius,
              backgroundColor: step.subjectColour,
              opacity: step.done ? 0.5 : 1,
            }}
          />
        ) : null}
        <Text variant="caption" tone="soft" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
          {step.meta}
        </Text>
      </View>
    </View>
  );

  return (
    <View testID={step.testID} style={{ flexDirection: "row", alignItems: "stretch" }}>
      <View style={{ width: RAIL_WIDTH, alignItems: "center" }}>
        {first ? (
          <View style={{ height: NODE_TOP_OFFSET }} />
        ) : (
          <View
            aria-hidden
            style={{
              width: lineWidth,
              height: topLineHeight,
              marginBottom: LINE_GAP,
              backgroundColor: topLineColour,
            }}
          />
        )}
        <QuestNode step={step} nodeRadius={nodeRadius} borderWidth={nodeBorderWidth} />
        {last ? null : (
          <View
            aria-hidden
            style={{
              width: lineWidth,
              flex: 1,
              marginTop: LINE_GAP,
              backgroundColor: bottomLineColour,
            }}
          />
        )}
      </View>

      <View
        style={{
          flex: 1,
          minWidth: 0,
          marginLeft: space.sm,
          paddingTop: rowTop,
          paddingBottom: last ? 0 : space.md,
          borderBottomWidth: last ? 0 : 1,
          borderBottomColor: color.line,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
          {step.onOpen ? (
            <Press
              role="button"
              label={`${step.title}. ${step.meta}`}
              onPress={step.onOpen}
              radius={shape.radius.sm}
              style={{ flex: 1, minWidth: 0 }}
              bodyStyle={{ paddingHorizontal: space.xs, marginHorizontal: -space.xs }}
            >
              {textBlock}
            </Press>
          ) : (
            <View style={{ flex: 1, minWidth: 0 }}>{textBlock}</View>
          )}
          {step.actionLabel && step.onAction ? (
            <Button
              title={step.actionLabel}
              size="small"
              variant="ghost"
              icon="play"
              testID={step.actionTestID}
              onPress={step.onAction}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

export function QuestPath({ steps }: { steps: QuestStep[] }) {
  return (
    <View>
      {steps.map((step, index) => (
        <QuestStepRow
          key={step.id}
          step={step}
          first={index === 0}
          last={index === steps.length - 1}
          prevDone={index > 0 ? steps[index - 1]!.done : false}
          nextDone={index < steps.length - 1 ? steps[index + 1]!.done : false}
        />
      ))}
    </View>
  );
}
