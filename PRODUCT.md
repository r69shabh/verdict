# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Delegated: Vite + React + TypeScript static app on a Cloudflare Workers static-assets deployment (owner approved workers.dev hosting and a public GitHub repo on 27 Nov 2026). Flagsmith JavaScript SDK in the browser; Node SDK for the traffic simulator.

## Users

Developers and product engineers about to run an A/B test against a hard deadline. During launch week, primarily Toggle Wars hackathon entrants (26–29 Nov 2026) who have days, not weeks, of traffic and need to know whether their test can finish in time.

## Product Purpose

Verdict answers one question before an experiment starts: "If my change works, what is the chance Flagsmith Experimentation calls a winner before my deadline?" It turns baseline rate, expected lift, traffic and deadline into that probability, the traffic needed for an 80% chance, and a ready pre-registration plus Flagsmith CLI commands. Success: the visitor forecasts their own experiment and leaves with a plan.

## Positioning

Built around Flagsmith Experimentation's actual decision rules (95% chance to beat control, 50-identity / 5-conversion collecting-data floor) and its CLI, rather than generic frequentist sample-size calculators. The app runs a live Flagsmith experiment on its own first screen.

## Capabilities and Constraints

- Forecast uses a normal approximation of the Bayesian beta-binomial decision; verified against Monte Carlo in tests.
- The first screen is the experiment: control = empty form, `worked_example` = form pre-filled with a worked example. Both variants must be honest, working designs.
- No accounts, no database, no personal data. Visitor identity is a random ID in localStorage.
- Preview mode (`?preview=<arm>`) shows either variant without recording events.

## Evidence on Hand

No users, testimonials or results exist yet. Never fabricate usage numbers or experiment outcomes; results come only from Flagsmith's results API and committed snapshots.

## Product Principles

- One question, answered honestly, with its uncertainty visible.
- The experiment on this page is disclosed to visitors.
- Plain language over statistics jargon; every number says what it means.
