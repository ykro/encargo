// GET /ucp/v1/payment-handlers/sandbox-pay: the spec the profile's payment
// handler points to. It says what the handler accepts and that no money moves.
import { CAPABILITIES, SANDBOX_HANDLER, SANDBOX_TOKEN, UCP_VERSION } from "./version";
import { json } from "./http";

export function sandboxPaySpec() {
  return json({
    name: SANDBOX_HANDLER,
    id: "sandbox_pay",
    version: UCP_VERSION,
    environment: "sandbox",
    summary: "Pagos simulados: no se cobra dinero real ni se piden tarjetas.",
    instrument: {
      type: "card",
      credential: { type: "PAYMENT_GATEWAY", token: SANDBOX_TOKEN },
      display: "Tarjeta de prueba •••• 4242",
    },
    requires: CAPABILITIES.ap2Mandate,
    rule: "complete_checkout coloca el pedido solo con este token y un mandato AP2 de checkout firmado por la persona.",
  });
}
