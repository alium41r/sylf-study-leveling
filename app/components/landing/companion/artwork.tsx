import { ORIGINAL as p, type Action, type Expression } from "./model";
import s from "./Companion.module.css";
import MagicalEyes, {
  eyeExpressionFor,
  type EyeExpression,
} from "./MagicalEyes";

export const CANONICAL_ART = "/landing/companion/original-rig.webp";
// Registered mattes in the painting's 1000 × 1000 coordinate space.
// Every moving part samples this one painting, without state-specific character images.
const HOOD =
  "M490 168C409 169 337 230 287 312L235 407C218 434 207 471 236 505C256 539 287 552 349 552L435 546Q463 551 490 563Q518 548 551 548C612 556 682 555 710 535C746 515 771 490 755 455L721 391C681 293 592 174 490 168Z";
const LEFT_RIBBON =
  "M417 550C362 579 270 567 218 622C184 656 186 703 216 720C255 744 317 710 354 672L395 614L430 562Z";
const RIGHT_RIBBON =
  "M565 550C621 579 713 568 764 622C798 656 796 703 766 720C727 744 665 710 628 672L587 614L552 562Z";
const LEFT_CLOAK =
  "M402 599L472 629C467 702 405 773 258 832C264 754 323 669 402 599Z";
const RIGHT_CLOAK =
  "M580 599L510 629C515 702 577 773 724 832C718 754 659 669 580 599Z";
// The journey mattes include the painting's full gold/antialias hems. The
// legacy mattes ended above those hems, leaving their outlines in the torso.
const JOURNEY_LEFT_CLOAK =
  "M402 599L479 629C481 713 408 793 263 850C256 775 324 661 402 599Z";
const JOURNEY_RIGHT_CLOAK =
  "M580 599L503 629C509 713 576 793 732 850C726 775 657 661 580 599Z";
const JOURNEY_LEFT_RIBBON =
  "M417 550C362 579 270 567 218 622C184 656 184 708 216 730C255 759 319 720 357 675L395 614L430 562Z";
const JOURNEY_RIGHT_RIBBON =
  "M565 550C621 579 713 568 764 622C798 656 800 708 766 730C727 759 663 720 625 675L587 614L552 562Z";
const STAR = "M490 48L507 88L540 105L508 119L490 159L473 119L439 105L472 89Z";
// Centroids retained for consumers outside the landing journey.
const LEFT_CLOAK_CENTROID = [377.3, 686.7] as const;
const RIGHT_CLOAK_CENTROID = [604.7, 686.7] as const;
/**
 * Legacy seam support for other consumers. The journey uses only attachment
 * bands, since stationary full panels become spare silhouettes when they sway.
 */
const insetAbout = (cx: number, cy: number, scale: number) =>
  `translate(${cx} ${cy}) scale(${scale}) translate(${-cx} ${-cy})`;

type ArmPose = {
  side: "left" | "right";
  x: number;
  y: number;
  angle: number;
  scale: number;
  wrist?: number;
};
const ARMS: Partial<Record<Action, ArmPose[]>> = {
  HELLO: [{ side: "right", x: 591, y: 651, angle: 58, scale: 1.3, wrist: -8 }],
  CELEBRATING: [
    { side: "right", x: 591, y: 650, angle: 54, scale: 1.22, wrist: -8 },
  ],
  READING: [
    { side: "left", x: 401, y: 676, angle: -158, scale: 0.8, wrist: 16 },
    { side: "right", x: 569, y: 674, angle: 158, scale: 0.8, wrist: -16 },
  ],
  USING_TABLET: [
    { side: "left", x: 401, y: 674, angle: -156, scale: 0.78, wrist: 12 },
    { side: "right", x: 565, y: 664, angle: 156, scale: 0.78, wrist: -12 },
  ],
  TIMER_MODE: [
    { side: "right", x: 591, y: 651, angle: 56, scale: 0.84, wrist: -5 },
  ],
};

/** Shared geometry: shoulder behind robe, cuff behind prop, mitten around prop edge. */
function CompanionArm({
  pose,
  layer,
  sleeveFill,
}: {
  pose: ArmPose;
  layer: "sleeve" | "cuff" | "hand";
  sleeveFill: string;
}) {
  return (
    <g
      className={s.armEntrance}
      transform={`translate(${pose.x} ${pose.y}) rotate(${pose.angle}) scale(${pose.scale})`}
    >
      <g className={pose.side === "left" ? s.armLeft : s.armRight}>
        {layer === "sleeve" ? (
          <g data-part={`sleeve-${pose.side}`}>
            <path
              d="M-28 12Q-34-31-19-98Q0-110 19-98Q34-31 28 12Z"
              fill={sleeveFill}
              stroke={p.gold}
              strokeWidth="2"
            />
            <path
              d="M-24-6Q-9-40-14-80Q-1-55 10-34"
              fill={p.fold}
              opacity=".55"
            />
          </g>
        ) : layer === "cuff" ? (
          <g data-part={`cuff-${pose.side}`}>
            {/* Only the distal cuff emerges in front; the shoulder stays behind the robe. */}
            <path
              d="M-25-42Q0-52 25-42L19-109Q0-117-19-109Z"
              fill={sleeveFill}
              stroke={p.gold}
              strokeWidth="3"
            />
            <path
              d="M-19-104Q0-110 19-104"
              stroke={p.goldLight}
              strokeWidth="5"
            />
          </g>
        ) : (
          <g data-part={`hand-${pose.side}`}>
            <g
              className={s.wrist}
              transform={`rotate(${pose.wrist ?? 0} 0 -109)`}
            >
              <path
                d="M-18-108C-24-125-22-145-10-153C3-162 20-149 22-135C32-137 35-125 27-119L18-107Q0-112-18-108Z"
                fill={p.body}
                stroke={p.cream}
                strokeWidth="4"
                strokeLinejoin="round"
              />
              <path
                d="M-10-140Q-8-149-1-146"
                stroke={p.bodyLight}
                strokeWidth="6"
                strokeLinecap="round"
              />
            </g>
          </g>
        )}
      </g>
    </g>
  );
}

export function CompanionArt({
  id,
  expression,
  action,
  eyeExpression,
  blink,
  jointSeams = false,
}: {
  id: string;
  expression: Expression;
  action: Action;
  eyeExpression?: EyeExpression;
  blink?: boolean;
  /** Landing only: support attachments without a stationary copy of the tails. */
  jointSeams?: boolean;
}) {
  const url = (name: string) => `url(#${id}-${name})`;
  const source = `#${id}-painting`;
  const leftCloak = jointSeams ? JOURNEY_LEFT_CLOAK : LEFT_CLOAK;
  const rightCloak = jointSeams ? JOURNEY_RIGHT_CLOAK : RIGHT_CLOAK;
  const leftRibbon = jointSeams ? JOURNEY_LEFT_RIBBON : LEFT_RIBBON;
  const rightRibbon = jointSeams ? JOURNEY_RIGHT_RIBBON : RIGHT_RIBBON;
  const prop = action === "READING" || action === "USING_TABLET";
  const arms = ARMS[action] ?? [];
  return (
    <svg
      viewBox="180 28 630 865"
      fill="none"
      focusable="false"
      aria-hidden="true"
      className={s.art}
    >
      <defs>
        <image
          id={`${id}-painting`}
          href={CANONICAL_ART}
          width="1000"
          height="1000"
        />
        {Object.entries({
          hood: HOOD,
          leftRibbon,
          rightRibbon,
          leftCloak,
          rightCloak,
          star: STAR,
        }).map(([name, d]) => (
          <clipPath id={`${id}-${name}`} key={name}>
            <path d={d} />
          </clipPath>
        ))}
        {jointSeams &&
          Object.entries({
            leftRibbon,
            rightRibbon,
            leftCloak,
            rightCloak,
          }).map(([name, d]) => (
            <mask
              id={`${id}-${name}-paint`}
              key={name}
              maskUnits="userSpaceOnUse"
              x="180"
              y="548"
              width="630"
              height="320"
              style={{ maskType: "luminance" }}
            >
              {/* Include the painted antialias edge in the moving layer. */}
              <path d={d} fill="white" stroke="white" strokeWidth="8" />
            </mask>
          ))}
        <clipPath id={`${id}-leftLeg`}>
          <path d="M398 708H491V865H398Z" />
        </clipPath>
        <clipPath id={`${id}-rightLeg`}>
          <path d="M491 708H584V865H491Z" />
        </clipPath>
        <clipPath id={`${id}-clasp`}>
          <path d="M490 558L537 602L490 648L444 603Z" />
        </clipPath>
        {jointSeams && (
          <clipPath id={`${id}-cape-joints`}>
            <rect x="180" y="599" width="630" height="36" />
          </clipPath>
        )}
        <mask
          id={`${id}-torso`}
          maskUnits="userSpaceOnUse"
          x="180"
          y="548"
          width="630"
          height="320"
          style={{ maskType: "luminance" }}
        >
          <rect x="180" y="548" width="630" height="320" fill="white" />
          <path d={HOOD} fill="black" />
          {/* Remove exactly the pixels sampled by the moving parts. */}
          <path
            d={`${leftRibbon} ${rightRibbon} ${leftCloak} ${rightCloak}`}
            fill="black"
            stroke={jointSeams ? "black" : "white"}
            strokeWidth={jointSeams ? "8" : "2"}
          />
          {/* The landing supports only the attachment band. Retaining whole
              panels underneath makes two silhouettes visible when they sway. */}
          <path
            d={leftCloak}
            fill="white"
            stroke={jointSeams ? "white" : undefined}
            strokeWidth={jointSeams ? "8" : undefined}
            clipPath={jointSeams ? url("cape-joints") : undefined}
            transform={
              jointSeams ? undefined : insetAbout(...LEFT_CLOAK_CENTROID, 0.9)
            }
          />
          <path
            d={rightCloak}
            fill="white"
            stroke={jointSeams ? "white" : undefined}
            strokeWidth={jointSeams ? "8" : undefined}
            clipPath={jointSeams ? url("cape-joints") : undefined}
            transform={
              jointSeams ? undefined : insetAbout(...RIGHT_CLOAK_CENTROID, 0.9)
            }
          />
          <rect x="398" y="708" width="186" height="157" fill="black" />
          {/* Only the hips need seam overlap; the feet must move as one pair. */}
          <rect
            x="398"
            y="708"
            width="186"
            height={jointSeams ? "24" : "157"}
            fill="white"
            transform={jointSeams ? undefined : insetAbout(491, 786.5, 0.86)}
          />
          <path d="M490 558L537 602L490 648L444 603Z" fill="black" />
        </mask>
        <mask
          id={`${id}-withoutCloak`}
          maskUnits="userSpaceOnUse"
          x="180"
          y="548"
          width="630"
          height="320"
          style={{ maskType: "luminance" }}
        >
          <rect x="180" y="548" width="630" height="320" fill="white" />
          <path
            d={`${leftCloak} ${rightCloak}`}
            fill="black"
            stroke={jointSeams ? "black" : "white"}
            strokeWidth={jointSeams ? "8" : "2"}
          />
        </mask>
        <linearGradient id={`${id}-gold`}>
          <stop stopColor={p.gold} />
          <stop offset=".5" stopColor={p.goldLight} />
          <stop offset="1" stopColor={p.gold} />
        </linearGradient>
        <linearGradient
          id={`${id}-sleeve`}
          x1="-25"
          y1="-100"
          x2="25"
          y2="0"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor={p.ivory} />
          <stop offset=".55" stopColor={p.cream} />
          <stop offset="1" stopColor={p.fold} />
        </linearGradient>
        <linearGradient id={`${id}-panel`} x2="1" y2="1">
          <stop stopColor={p.blue} stopOpacity=".9" />
          <stop offset="1" stopColor={p.periwinkle} stopOpacity=".85" />
        </linearGradient>
      </defs>
      <ellipse
        data-part="shadow"
        className={s.shadow}
        cx="491"
        cy="871"
        rx={action === "FLOATING" ? 122 : 132}
        ry="12"
        fill={p.face}
        opacity=".1"
      />
      <g className={s.float} data-part="float">
        <g className={s.floatDrift} data-part="float-drift">
          <g className={s.floatRoll} data-part="float-roll">
            <g className={s.reaction}>
              <g className={s.statePose} data-part="expression-pose">
                <g className={s.actionPose} data-part="action-pose">
                  <g data-part="ribbons">
                    <g className={s.ribbonLagLeft} data-part="ribbon-left-lag">
                      <g className={s.ribbonPoseLeft}>
                        <g className={s.ribbonLeft}>
                          <use
                            href={source}
                            clipPath={
                              jointSeams ? undefined : url("leftRibbon")
                            }
                            mask={
                              jointSeams ? url("leftRibbon-paint") : undefined
                            }
                          />
                        </g>
                      </g>
                    </g>
                    <g
                      className={s.ribbonLagRight}
                      data-part="ribbon-right-lag"
                    >
                      <g className={s.ribbonPoseRight}>
                        <g className={s.ribbonRight}>
                          <use
                            href={source}
                            clipPath={
                              jointSeams ? undefined : url("rightRibbon")
                            }
                            mask={
                              jointSeams ? url("rightRibbon-paint") : undefined
                            }
                          />
                        </g>
                      </g>
                    </g>
                  </g>
                  {arms.map((pose) => (
                    <CompanionArm
                      key={`${action}-${pose.side}`}
                      pose={pose}
                      layer="sleeve"
                      sleeveFill={url("sleeve")}
                    />
                  ))}
                  <g data-part="body" className={s.body}>
                    <use href={source} mask={url("torso")} />
                    <g data-part="lower-body-lag" className={s.lowerBodyLag}>
                      <g data-part="lower-body" className={s.lowerBody}>
                        <g className={s.legLeft}>
                          <use
                            href={source}
                            clipPath={url("leftLeg")}
                            mask={url("withoutCloak")}
                          />
                        </g>
                        <g className={s.legRight}>
                          <use
                            href={source}
                            clipPath={url("rightLeg")}
                            mask={url("withoutCloak")}
                          />
                        </g>
                      </g>
                    </g>
                    <g className={s.capeLag} data-part="cape-lag">
                      <g data-part="cloak" className={s.cloak}>
                        <g
                          className={s.cloakTravelLeft}
                          data-part="cloak-travel-left"
                        >
                          <g className={s.cloakPoseLeft}>
                            <g className={s.cloakLeft} data-part="cloak-left">
                              <use
                                href={source}
                                clipPath={
                                  jointSeams ? undefined : url("leftCloak")
                                }
                                mask={
                                  jointSeams
                                    ? url("leftCloak-paint")
                                    : undefined
                                }
                              />
                            </g>
                          </g>
                        </g>
                        <g
                          className={s.cloakTravelRight}
                          data-part="cloak-travel-right"
                        >
                          <g className={s.cloakPoseRight}>
                            <g className={s.cloakRight} data-part="cloak-right">
                              <use
                                href={source}
                                clipPath={
                                  jointSeams ? undefined : url("rightCloak")
                                }
                                mask={
                                  jointSeams
                                    ? url("rightCloak-paint")
                                    : undefined
                                }
                              />
                            </g>
                          </g>
                        </g>
                      </g>
                    </g>
                    <g data-part="chest-clasp">
                      <use href={source} clipPath={url("clasp")} />
                    </g>
                  </g>
                  <g className={s.haloLag} data-part="halo-lag">
                    <g className={s.haloPose}>
                      <g data-part="halo" className={s.halo}>
                        <ellipse
                          cx="491"
                          cy="166"
                          rx="197"
                          ry="37"
                          stroke={url("gold")}
                          strokeWidth="3"
                          transform="rotate(2 491 166)"
                        />
                        <path
                          d="M295 163C300 189 414 205 525 201"
                          stroke={p.goldLight}
                          strokeWidth="4"
                          strokeLinecap="round"
                        />
                      </g>
                    </g>
                  </g>
                  <g data-part="hood" className={s.head}>
                    <use href={source} clipPath={url("hood")} />
                    <g data-part="face" className={s.gaze}>
                      <MagicalEyes
                        id={`${id}-eyes`}
                        blink={blink}
                        expression={
                          eyeExpression ?? eyeExpressionFor(expression)
                        }
                      />
                    </g>
                  </g>
                  <g className={s.starLag} data-part="star-lag">
                    <g className={s.starPose}>
                      <g data-part="star" className={s.star}>
                        <use href={source} clipPath={url("star")} />
                      </g>
                    </g>
                  </g>
                  {arms.map((pose) => (
                    <CompanionArm
                      key={`${action}-${pose.side}`}
                      pose={pose}
                      layer="cuff"
                      sleeveFill={url("sleeve")}
                    />
                  ))}
                  {prop && (
                    <g
                      key={action}
                      data-part={action === "READING" ? "book" : "tablet"}
                      className={s.prop}
                    >
                      <g
                        transform={
                          action === "READING"
                            ? "translate(88 40) scale(3)"
                            : "translate(108 78) scale(2.85)"
                        }
                      >
                        {action === "READING" ? (
                          <>
                            <path
                              d="M91 224Q111 217 132 228Q152 211 178 216L164 264Q146 259 129 274Q111 263 93 267Z"
                              fill={p.faceLight}
                              stroke={p.gold}
                              strokeWidth="1.8"
                              strokeLinejoin="round"
                            />
                            <path
                              d="M93 224Q112 214 132 228Q151 207 177 215L175 220Q152 216 132 235Q112 222 94 230Z"
                              fill={p.ivory}
                              stroke={p.gold}
                              strokeWidth=".8"
                            />
                            <path
                              d="M132 235L129 273"
                              stroke={p.gold}
                              strokeWidth="2"
                            />
                            <path
                              d="M110 237L113 245L120 250L112 252L109 261L107 251L100 247L108 245Z M153 233L156 240L162 243L155 246L151 254L151 245L145 241L151 239Z"
                              fill={p.goldLight}
                            />
                          </>
                        ) : (
                          <>
                            <path
                              d="M91 220L179 203L171 259L88 273Z"
                              fill={url("panel")}
                              stroke={p.blue}
                              strokeWidth="1.5"
                              strokeLinejoin="round"
                            />
                            <path
                              d="M98 226L170 212L164 252L96 263Z"
                              stroke={p.eye}
                              strokeOpacity=".7"
                            />
                            <path
                              d="M134 222L137 234L149 238L136 244L130 255L129 243L117 239L129 234Z"
                              fill={p.eye}
                              opacity=".9"
                            />
                          </>
                        )}
                      </g>
                    </g>
                  )}
                  {arms.length > 0 && (
                    <g
                      data-part={
                        action === "HELLO" || action === "CELEBRATING"
                          ? "greeting-arm"
                          : "holding-hands"
                      }
                    >
                      {arms.map((pose) => (
                        <CompanionArm
                          key={`${action}-${pose.side}`}
                          pose={pose}
                          layer="hand"
                          sleeveFill={url("sleeve")}
                        />
                      ))}
                    </g>
                  )}
                  {action === "TIMER_MODE" && (
                    <g
                      data-part="timer"
                      className={s.timer}
                      stroke={p.periwinkle}
                      strokeWidth="8"
                      strokeLinecap="round"
                    >
                      <circle
                        cx="754"
                        cy="574"
                        r="51"
                        fill={p.face}
                        fillOpacity=".9"
                        stroke={p.blue}
                        strokeOpacity=".35"
                      />
                      <circle
                        data-part="timer-progress"
                        className={s.timerProgress}
                        cx="754"
                        cy="574"
                        r="51"
                        pathLength="100"
                        stroke={p.blue}
                        strokeWidth="10"
                        strokeDasharray="73 27"
                        transform="rotate(-90 754 574)"
                      />
                      <path
                        d="M754 545V574L773 585M744 507H764M754 507V515"
                        stroke={p.ivory}
                        strokeWidth="7"
                      />
                      <circle
                        cx="754"
                        cy="574"
                        r="5"
                        fill={p.goldLight}
                        stroke="none"
                      />
                    </g>
                  )}
                  {action === "CELEBRATING" && (
                    <g
                      data-part="sparkles"
                      className={s.sparkles}
                      fill={p.goldLight}
                      stroke={p.gold}
                      strokeWidth="1.5"
                    >
                      <path d="M229 337L240 362L261 372L240 382L229 407L218 382L197 372L218 362Z M763 325L771 344L788 352L771 360L763 379L755 360L738 352L755 344Z M729 708L737 727L754 735L737 743L729 762L721 743L704 735L721 727Z" />
                    </g>
                  )}
                </g>
              </g>
            </g>
          </g>
        </g>
      </g>
    </svg>
  );
}
