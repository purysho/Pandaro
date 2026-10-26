# Rewards: review-based analysis (stand-in for the A/B test)

**Status:** decision made from published reviews and research, not from Pandaro users. No Pandaro
experiment has run, and nothing below is a Pandaro measurement. When enough users opt in to
"Help improve Pandaro", the plan in `docs/plans/v1.1-plan.md` §3 still applies.

## Question

Which daily reward style should Pandaro offer, and which should be the default?

| Arm | Style                                         | In the app   |
| --- | --------------------------------------------- | ------------ |
| A   | No daily rewards (garden only)                | `off`        |
| B   | Fixed daily reward                            | `daily`      |
| C   | Scaled reward (grows with consecutive days)   | `growing`    |
| D   | User-chosen commitment, reward scales with it | `commitment` |

## Method

1. Read third-party summaries of app-store reviews for focus and habit apps that use each kind
   of reward: Forest and Flora (grow a tree per session), Finch (gentle daily pet rewards),
   Habitica (rewards plus damage for missed dailies), Duolingo (streaks, streak goals, freezes).
2. Group recurring complaints and praise by reward mechanic.
3. Cross-check against published research and first-party company write-ups.
4. Score each arm on expected motivation and on harm (anxiety, guilt, quitting after a miss).

Limits: aggregator sites summarise reviews with their own methods; reviewers self-select; the
apps differ in many ways besides rewards. Treat the findings as directional.

## Findings by mechanic

### A. No daily rewards (per-session growth only)

- Forest's single tree per session is its most praised feature, and its complaints are about
  pricing and pause rules, not the reward loop ([Kimola](https://kimola.com/reports/exclusive-forest-app-user-feedback-analysis-report-google-play-en-us-151945),
  [Marlvel](https://marlvel.ai/apps/forest-focus-for-productivity/reviews),
  [Common Sense Media](https://www.commonsensemedia.org/app-reviews/forest-stay-focused-be-present)).
- Forest's withered tree on giving up is mentioned as both motivating and guilt-inducing.
  Pandaro's garden never withers.
- Gap: nothing pulls a user back on a new day.

### B. Fixed daily reward

- Finch's small daily rewards for "showing up" are its most praised mechanic, and reviewers
  describe it as kind rather than pressuring ([Headway](https://makeheadway.com/blog/finch-app-review/),
  [Kimola](https://kimola.com/reports/transform-your-self-care-routine-with-finch-app-insights-app-store-us-155384)).
- No loss is possible, so there is nothing to feel bad about after a missed day.
- Gap: a flat reward gives no sense of momentum.

### C. Scaled reward (consecutive days)

- Classic streaks drive return visits but cause "streak anxiety" and quitting after a break
  ([The Decision Lab](https://thedecisionlab.com/insights/consumer-insights/streak-creep-the-perils-of-too-much-gamification),
  [Yu-kai Chou](https://yukaichou.com/gamification-analysis/streak-design-gamification-motivation-burnout/)).
- Research summarised by The Decision Lab and others reports that a broken streak lowers the
  chance of continuing, more so when the break is highlighted.
- Habitica reviews praise the RPG rewards but repeatedly mention guilt from damage on missed
  dailies ([TechRadar](https://www.techradar.com/reviews/habitica),
  [Internet Matters](https://www.internetmatters.org/advice/apps-and-platforms/wellbeing/habitica/)).
- Duolingo added streak freezes and repair to soften breaks
  ([Duolingo blog](https://blog.duolingo.com/improving-the-streak)).
- Conclusion: momentum helps, a cliff hurts. A version that steps down one level per missed day,
  never to zero, keeps the momentum without the cliff.

### D. User-chosen commitment

- Duolingo reports that separating a daily goal from the streak raised Day-14 retention by 3.3%
  (relative), and describes streak goals the learner chooses
  ([Duolingo](https://making.duolingo.com/how-streaks-keep-duolingo-learners-committed-to-their-language-goals),
  [Lazyweb summary](https://lazyweb.com/research/duolingo-streak-goals-retention)).
- A second-hand source says the "choose your goal" screen helped even when the goal itself was
  not used; this is unverified.
- Risk: a commitment that breaks on one missed day is a streak by another name. Grace days and a
  "no harm done" message when it lapses address that.

## Scoring

| Arm            | Motivation  | Harm risk  | Notes                                            |
| -------------- | ----------- | ---------- | ------------------------------------------------ |
| A `off`        | Low         | None       | Good for people who dislike gamification         |
| B `daily`      | Medium      | None       | Kind, simple, easy to understand                 |
| C `growing`    | Medium–high | Low        | Only with step-down instead of reset             |
| D `commitment` | High        | Low–medium | Only with grace days and opt-in, no preselection |

## Decision (implemented in 1.1)

- **All four styles are offered**, chosen in Garden → Bamboo shoots. The user, not a random
  assignment, picks the style.
- **Default: `daily`.** It had the best motivation-to-harm ratio in the reviews.
- `growing`: 1 to 5 shoots a day; each focus day adds a level, a missed day drops one, never to
  zero.
- `commitment`: 3, 7, 14 or 30 days at ×1, ×1.5, ×2, ×3; two grace days; a bonus equal to the
  length on completion; nothing is preselected; a lapsed commitment shows "No harm done".
- `off`: the garden still grows per session.
- Guardrails in every style: shoots are cosmetic (panda accessories only) and never gate the
  timer, tasks or statistics; no loss wording; shoots are never taken away; reward notifications
  are not sent.

Code: `src/domain/rewards/rewards.ts`, tests in `tests/unit/rewards.test.ts` and
`tests/integration/rewards.test.tsx`.

## What would change the decision

Once opted-in usage data exists (see the plan's sample-size estimate), compare Day-7 and Day-30
retention and the share of users who switch to `off`. If `commitment` users switch to `off` more
often than `daily` users, make the commitment harder to start by accident; if `growing` beats
`daily` with no rise in switching off, make `growing` the default.

## Further sources

- [Duolingo: improving the streak](https://blog.duolingo.com/improving-the-streak)
- [BI Norwegian Business School: game mechanics and user experience](https://biopen.bi.no/bi-xmlui/handle/11250/2623593)
- [Forest review (AI Indigo)](https://aiindigo.com/blog/staying-focused-in-a-hyper-connected-world-a-2026-review-of-forest)
- [Flora reviews (Justuseapp)](https://justuseapp.com/en/app/1225155794/flora-green-focus/reviews)
- [Habitica habit review (Binary Moon)](https://www.binarymoon.co.uk/2016/10/improving-habits-habitica/)
- [Finch review (Bustle)](https://www.bustle.com/wellness/finch-app-review-features-price)
