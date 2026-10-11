import test from "node:test";
import assert from "node:assert/strict";
import {
  STORE_EXAMPLES,
  buildTutorialStoreBundle,
  auditStoreBundle,
  simulateAgentPurchase,
} from "./server.mjs";

test("1. Ejemplo A (Pulso Outdoor) obtiene 0/8 con notas explicativas y el agente descarta la tienda", () => {
  const audit = auditStoreBundle(STORE_EXAMPLES.pulso);
  assert.equal(audit.score, 0);
  assert.equal(audit.maxScore, 8);
  assert.equal(audit.checks.length, 8);
  assert.equal(audit.checks.every(c => !c.passed && c.findingNote.length > 20 && c.businessImpactNote.length > 20), true);

  const sim = simulateAgentPurchase(audit);
  assert.equal(sim.decision, "TIENDA_DESCARTADA_POR_INCERTIDUMBRE");
  assert.equal(sim.orderReceipt, null);
});

test("2. Ejemplo B (Café Nube) obtiene 3/8 por catálogo parcial y el agente descarta por falta de talla y envío", () => {
  const audit = auditStoreBundle(STORE_EXAMPLES.cafenube);
  assert.equal(audit.score, 3);

  const byId = Object.fromEntries(audit.checks.map(c => [c.id, c.passed]));
  assert.equal(byId.robots_searchbots, true);
  assert.equal(byId.http_ssr_access, true);
  assert.equal(byId.ssr_initial_html, true);
  assert.equal(byId.jsonld_product_variants, false);
  assert.equal(byId.jsonld_shipping_details, false);

  const sim = simulateAgentPurchase(audit);
  assert.equal(sim.decision, "TIENDA_DESCARTADA_POR_INCERTIDUMBRE");
});

test("3. Ejemplo C (Kilómetro) obtiene 8/8 y el agente completa la compra en 3 pasos con mandato Passkey AP2", () => {
  const audit = auditStoreBundle(STORE_EXAMPLES.kilometro);
  assert.equal(audit.score, 8);
  assert.equal(audit.checks.every(c => c.passed), true);

  const sim = simulateAgentPurchase(audit);
  assert.equal(sim.decision, "COMPRA_APROBADA_EN_3_PASOS");
  assert.ok(sim.orderReceipt);
  assert.equal(sim.orderReceipt.sku, "KM-ACAT-T3-42");
  assert.equal(sim.orderReceipt.totalPaid, "Q1,250.00 GTQ");
});

test("4. Tutorial Paso a Paso sube la puntuación de 0/8 → 2/8 → 4/8 → 6/8 → 8/8 y aprueba la compra al llegar a 8/8", () => {
  const step0 = auditStoreBundle(buildTutorialStoreBundle({}));
  assert.equal(step0.score, 0);

  const step1 = auditStoreBundle(buildTutorialStoreBundle({ fix1_robots: true }));
  assert.equal(step1.score, 2);

  const step2 = auditStoreBundle(
    buildTutorialStoreBundle({ fix1_robots: true, fix2_jsonld: true })
  );
  assert.equal(step2.score, 4);

  const step3 = auditStoreBundle(
    buildTutorialStoreBundle({ fix1_robots: true, fix2_jsonld: true, fix3_ssr_feed: true })
  );
  assert.equal(step3.score, 6);
  const sim3 = simulateAgentPurchase(step3);
  assert.equal(sim3.decision, "CANDIDATA_EN_CATALOGO_FALTA_CHECKOUT");

  const step4 = auditStoreBundle(
    buildTutorialStoreBundle({
      fix1_robots: true,
      fix2_jsonld: true,
      fix3_ssr_feed: true,
      fix4_ucp_ap2: true,
    })
  );
  assert.equal(step4.score, 8);
  const sim4 = simulateAgentPurchase(step4);
  assert.equal(sim4.decision, "COMPRA_APROBADA_EN_3_PASOS");
  assert.equal(sim4.orderReceipt.sku, "PULSO-ACAT-T3-42");
  assert.equal(sim4.orderReceipt.totalPaid, "Q1,190.00 GTQ");
});
