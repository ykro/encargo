# Encargo — the sneaker race

Demo for the talk **"Your Next Customer Is an AI Agent."** Encargo is an agent that shops on a person's behalf. It gets one errand ("trail shoes, size 9, under 150 USD, arriving before Friday") and two fictional stores selling the same shoes:

- **Pulso** is stunning and cheaper (139 USD), but only humans can read it.
- **Kilómetro** is plain and costs 145 USD, but it is agent-ready: it publishes schema.org data, a Merchant Center feed and a UCP profile, and its checkout requires an AP2 mandate.

Encargo buys from Kilómetro, the only store where it can verify every condition. In control mode (`PULSO_AGENT_READY=true`), Pulso publishes the same data and Encargo buys from Pulso, because it is cheaper.

## What you'll learn

- What an agent actually sees in a store, and how a met / not met / not verifiable checklist decides the purchase.
- How to publish a store for agents: schema.org JSON-LD, a Merchant Center feed, and a UCP profile with catalog, cart and checkout.
- How to authorize a payment without giving the agent a card: the store signs the checkout and the person signs an AP2 mandate with a passkey.

## Quickstart

```bash
cp .env.example .env
make up      # app :3000, Kilómetro :3001, Pulso :3002, agent :8000
make test
make e2e     # passkey flow in Chrome with a virtual authenticator
make bias-test TARGET=cloud
```

## Who signs (technical decision)

**On stage, the signing device is the laptop, in a phone-sized Chrome window** (`make phone TARGET=cloud`, 390×844), using the Mac's platform authenticator (Touch ID).

- **Why not the phone:** the talk uses no real phone. The "phone" is the Android emulator `emulator-5556`. Without a Google account sign-in (ruled out), Chrome there has no credential provider and only offers "create passkey on another device" (hybrid QR). Chrome for Android also does not expose the DevTools virtual authenticator.
- **What the emulator does test:** `make e2e-emulator` covers the errand input, live progress, the approval card and cancelling.
- **Automated tests:** `make e2e` signs the AP2 mandate in desktop Chrome with a virtual authenticator. `make bias-test` signs through the same WebAuthn path with a software authenticator.
- **Production signer:** the cloud agent runs with `SIGNER_MODE=passkey`. The test signer token only exists in `test` mode, for local tests.

Protocol and dependency versions are in [VERSIONS.md](VERSIONS.md).
