# Onboarding documentation

Current implementation entry points are [the onboarding page](../../app/onboarding/page.tsx), [step components](../../app/onboarding/components/), [onboarding API](../../app/api/user/onboarding/route.ts), [auth/onboarding tests](../../__tests__/auth/onboarding.test.ts), and [redesign tests](../../__tests__/components/onboarding-redesign.test.tsx). No standalone current prose specification was established by this pass.

The [27 September redesign report](reports/redesign/ONBOARDING_REDESIGN_REPORT.md) records the implemented four-step redesign. The [archived pre-redesign audit](archive/pre-redesign/ONBOARDING_AUDIT_REPORT.md) diagnosed the earlier monolithic flow, boot delay, constellation terminology, and appearance selector. The redesign explicitly replaces those elements; the audit remains useful history.

[Browser captures](../../.browser-qa/) include desktop step 1–4, mobile steps, and keyboard simulation. These files remain beside the shared executable QA output, which can be refreshed by later runs. Do not treat them as physical-device verification or an immutable snapshot solely because a report passed.

The [landing companion](../landing-companion/README.md), [SVG capability history](../svg-companion/README.md), and [pixel contract](../pixel-companion/pixel-asset-contract.md) have separate documentation and preservation rules.
